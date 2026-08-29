import { supabase } from '../config/supabase.js';
import { generateOperation } from '../engine/OperationGenerator.js';
import {
  canGenerateOperations,
  getPendingCount,
  QUEUE_LIMITS
} from './QueueManager.js';
import { completeSession } from './SessionEngine.js';
import {
  canQueueOperation,
  createPendingOperationOccupancy,
  occupyPendingOperation
} from '../domain/operationQueuePolicy.js';
import {
  shouldDisableRandomOperationGeneration
} from '../config/localE2EGuard.js';

class GameMaster {

  constructor() {

    this.activeSessions = new Map();
    this.autoCloseMs = 30 * 60 * 1000; // 30 minutes

    // Weighted distribution
    this.operationWeights = [
      {
        type: 'ADD CREDITS',
        weight: 20
      },
      {
        type: 'WITHDRAW CREDITS',
        weight: 20
      },
      {
        type: 'RESET PASSWORD',
        weight: 20
      },
      {
        type: 'REFRESH BALANCE',
        weight: 20
      },
      {
        type: 'CREATE ACCOUNT',
        weight: 20
      }
    ];
  }

  //
  // START SESSION
  //
  async startSession(sessionId, autoCloseMs = this.autoCloseMs) {

    if (
      this.activeSessions.has(sessionId)
    ) {
      return;
    }

    console.log(
      `GameMaster started for ${sessionId}`
    );

    const randomGenerationDisabled =
      shouldDisableRandomOperationGeneration();

    let interval = null;

    if (!randomGenerationDisabled) {
      // Generate initial operations immediately
      await this.generateOperations(sessionId);

      interval = setInterval(async () => {
        await this.generateOperations(
          sessionId
        );
      }, QUEUE_LIMITS.generationIntervalMs);
    } else {
      console.log(
        `Random operation generation disabled for guarded local E2E session ${sessionId}`
      );
    }

    const timeout = this.scheduleAutoClose(
      sessionId,
      autoCloseMs
    );

    this.activeSessions.set(
      sessionId,
      {
        interval,
        timeout,
        autoCloseMs
      }
    );
  }

  scheduleAutoClose(sessionId, autoCloseMs) {
    return setTimeout(async () => {
      console.log(
        `Auto-closing session ${sessionId} after ${Math.round(autoCloseMs / 60000)} minutes`
      );

      this.stopSession(sessionId);

      try {
        await completeSession(sessionId);
      } catch (err) {
        console.error(
          `Failed to auto-complete session ${sessionId}:`,
          err
        );
      }
    }, autoCloseMs);
  }

  setSessionTimeout(sessionId, autoCloseMs) {
    const timers = this.activeSessions.get(sessionId);

    if (!timers) {
      return false;
    }

    clearTimeout(timers.timeout);

    const timeout = this.scheduleAutoClose(
      sessionId,
      autoCloseMs
    );

    timers.timeout = timeout;
    timers.autoCloseMs = autoCloseMs;

    this.activeSessions.set(sessionId, timers);
    return true;
  }

  //
  // STOP SESSION
  //
  stopSession(sessionId) {

    const timers =
      this.activeSessions.get(sessionId);

    if (timers) {

      clearInterval(timers.interval);
      clearTimeout(timers.timeout);

      this.activeSessions.delete(
        sessionId
      );

      console.log(
        `GameMaster stopped for ${sessionId}`
      );
    }
  }

  //
  // WEIGHTED OPERATION GENERATOR
  //
  generateWeightedOperationType() {

    const random =
      Math.random() * 100;

    let cumulative = 0;

    for (const operation of this.operationWeights) {

      cumulative += operation.weight;

      if (random < cumulative) {
        return operation.type;
      }
    }

    // fallback
    return 'RESET PASSWORD';
  }

  async getPendingOperations(sessionId) {
    const { data, error } = await supabase
      .from('sandbox_operations')
      .select(
        'customer_id, game_account_id, game, type, status'
      )
      .eq('session_id', sessionId)
      .eq('status', 'PENDING');

    if (error) {
      throw error;
    }

    return data || [];
  }

  async insertGeneratedOperation(operation) {
    const { data, error } = await supabase
      .rpc(
        'create_reserved_sandbox_operation',
        { p_operation: operation }
      );

    if (error) {
      const isOccupiedSlot =
        error.code === '23505' ||
        /pending movement|pending request|unique/i
          .test(error.message || '');

      if (isOccupiedSlot) {
        return null;
      }

      throw error;
    }

    return Array.isArray(data)
      ? data[0]
      : data;
  }

  //
  // GENERATE OPERATIONS
  //
  async generateOperations(sessionId) {

    try {

      // =========================
      // CHECK CURRENT PENDING
      // =========================

      const pendingCount =
        await getPendingCount(sessionId);

      // Queue protection
      // Prevent impossible workloads
      if (
        !canGenerateOperations(
          pendingCount
        )
      ) {

        console.log(
          `Session ${sessionId} queue full (${pendingCount})`
        );

        return;
      }

      // =========================
      // GET CUSTOMERS
      // =========================

      const { data: customers } =
        await supabase
          .from('sandbox_customers')
          .select('*')
          .eq('session_id', sessionId);

      // =========================
      // GET GAME ACCOUNTS
      // =========================

      const { data: gameAccounts } =
        await supabase
          .from('sandbox_game_accounts')
          .select('*')
          .eq('session_id', sessionId);

      if (
        !customers?.length ||
        !gameAccounts?.length
      ) {
        return;
      }

      // =========================
      // GENERATION VOLUME
      // =========================

      let minOpm = 2;
      let maxOpm = 4;
      try {
        const { data: minData } = await supabase
          .from('simulator_settings')
          .select('value')
          .eq('key', 'min_opm')
          .maybeSingle();

        const { data: maxData } = await supabase
          .from('simulator_settings')
          .select('value')
          .eq('key', 'max_opm')
          .maybeSingle();

        if (minData && minData.value !== undefined) {
          minOpm = Number(minData.value);
        }
        if (maxData && maxData.value !== undefined) {
          maxOpm = Number(maxData.value);
        }
      } catch (dbErr) {
        console.error('Failed to fetch OPM settings from database, using defaults:', dbErr);
      }

      // Pick a random OPM in the range
      const range = maxOpm - minOpm;
      const selectedOpm = range > 0
        ? Math.random() * range + minOpm
        : minOpm;

      // Translate OPM to Operations for this 30s tick (1/2 of a minute)
      const expectedOps = selectedOpm / 2;
      const baseOps = Math.floor(expectedOps);
      const remainder = expectedOps - baseOps;
      const numberOfOperations = Math.random() < remainder ? baseOps + 1 : baseOps;

      if (numberOfOperations <= 0) {
        console.log(`Session ${sessionId}: 0 operations generated for this tick (OPM range: ${minOpm}-${maxOpm})`);
        return;
      }

      const operations = [];
      const pendingOperations =
        await this.getPendingOperations(
          sessionId
        );
      const occupancy =
        createPendingOperationOccupancy(
          pendingOperations
        );
      const remainingCapacity = Math.max(
        0,
        QUEUE_LIMITS.maxPendingOperations -
          pendingOperations.length
      );
      const generationTarget = Math.min(
        numberOfOperations,
        remainingCapacity
      );

      // =========================
      // CREATE OPERATIONS
      // =========================

      for (
        let i = 0;
        i < generationTarget;
        i++
      ) {
        // Weighted operation type
        const operationType =
          this.generateWeightedOperationType();

        const candidates = [];

        for (const customer of customers) {
          const customerGames =
            gameAccounts.filter(
              game =>
                game.customer_id ===
                customer.id
            );

          for (const gameAccount of customerGames) {
            const candidate = {
              customer_id: customer.id,
              game_account_id:
                gameAccount.id,
              game: gameAccount.game,
              type: operationType,
              status: 'PENDING'
            };

            if (
              !canQueueOperation(
                occupancy,
                candidate
              )
            ) {
              continue;
            }

            if (
              operationType ===
                'ADD CREDITS' &&
              Number(customer.balance) < 1
            ) {
              continue;
            }

            if (
              operationType ===
                'WITHDRAW CREDITS' &&
              Number(gameAccount.balance) < 1
            ) {
              continue;
            }

            candidates.push({
              customer,
              gameAccount,
              candidate
            });
          }
        }

        if (!candidates.length) {
          continue;
        }

        const selected = candidates[
          Math.floor(
            Math.random() *
            candidates.length
          )
        ];

        const generated = generateOperation(
            selected.customer,
            selected.gameAccount,
            sessionId,
            operationType
          );

        if (generated) {
          const inserted =
            await this.insertGeneratedOperation(
              generated
            );

          if (inserted) {
            operations.push(inserted);
            occupyPendingOperation(
              occupancy,
              generated
            );

            if (
              operationType ===
              'ADD CREDITS'
            ) {
              selected.customer.balance =
                Number(
                  selected.customer.balance
                ) -
                Number(generated.amount);
            }
          }
        }
      }

      // =========================
      // REPORT OPERATIONS
      // =========================

      if (operations.length > 0) {

        console.log(
          `${operations.length} operations generated for ${sessionId}`
        );
      }
    } catch (err) {

      console.error(
        'GameMaster error:',
        err
      );
    }
  }
}

export default new GameMaster();
