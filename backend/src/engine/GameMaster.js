import { supabase } from '../config/supabase.js';
import { generateOperation } from '../engine/OperationGenerator.js';
import {
  canGenerateOperations,
  getGenerationVolume,
  getPendingCount,
  QUEUE_LIMITS
} from './QueueManager.js';
import { completeSession } from './SessionEngine.js';

class GameMaster {

  constructor() {

    this.activeSessions = new Map();
    this.autoCloseMs = 30 * 60 * 1000; // 30 minutes

    // Weighted distribution
    this.operationWeights = [
      {
        type: 'ADD CREDITS',
        weight: 25
      },
      {
        type: 'WITHDRAW CREDITS',
        weight: 20
      },
      {
        type: 'RESET PASSWORD',
        weight: 25
      },
      {
        type: 'REFRESH BALANCE',
        weight: 15
      },
      {
        type: 'CREATE ACCOUNT',
        weight: 15
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

    // Generate initial operations immediately
    await this.generateOperations(sessionId);

    const interval = setInterval(async () => {
      await this.generateOperations(
        sessionId
      );
    }, QUEUE_LIMITS.generationIntervalMs);

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

  async getPendingAddCreditExposure(sessionId) {
    const { data, error } = await supabase
      .from('sandbox_operations')
      .select('customer_id, amount')
      .eq('session_id', sessionId)
      .eq('type', 'ADD CREDITS')
      .eq('status', 'PENDING');

    if (error) {
      throw error;
    }

    return (data || []).reduce((map, operation) => {
      const current =
        map.get(operation.customer_id) || 0;
      map.set(
        operation.customer_id,
        current + Number(operation.amount || 0)
      );
      return map;
    }, new Map());
  }

  async ensureAddCreditBalance({
    customer,
    pendingExposure
  }) {
    const balance =
      Number(customer.balance) || 0;
    const reserved =
      pendingExposure.get(customer.id) || 0;
    const available =
      balance - reserved;

    if (available >= 50) {
      return customer;
    }

    const injectedBalance =
      reserved + 500;

    const { data, error } = await supabase
      .from('sandbox_customers')
      .update({
        balance: injectedBalance
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(
      `Injected customer balance for ADD CREDITS generation: ${customer.id}`
    );

    return data;
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

      const numberOfOperations =
        getGenerationVolume();

      const operations = [];
      const pendingAddExposure =
        await this.getPendingAddCreditExposure(
          sessionId
        );

      // =========================
      // CREATE OPERATIONS
      // =========================

      for (
        let i = 0;
        i < numberOfOperations;
        i++
      ) {

        let customer =
          customers[
            Math.floor(
              Math.random() *
              customers.length
            )
          ];

        const customerGames =
          gameAccounts.filter(
            game =>
              game.customer_id ===
              customer.id
          );

        if (!customerGames.length) {
          continue;
        }

        const selectedGame =
          customerGames[
            Math.floor(
              Math.random() *
              customerGames.length
            )
          ];

        // Weighted operation type
        const operationType =
          this.generateWeightedOperationType();

        if (operationType === 'ADD CREDITS') {
          customer =
            await this.ensureAddCreditBalance({
              customer,
              pendingExposure:
                pendingAddExposure
            });
        }

        const generationCustomer =
          operationType === 'ADD CREDITS'
            ? {
                ...customer,
                balance: Math.max(
                  0,
                  Number(customer.balance || 0) -
                    (pendingAddExposure.get(customer.id) || 0)
                )
              }
            : customer;

        const generated = generateOperation(
            generationCustomer,
            selectedGame,
            sessionId,
            operationType
          );

        if (generated) {
          operations.push(generated);
          if (operationType === 'ADD CREDITS') {
            pendingAddExposure.set(
              customer.id,
              (pendingAddExposure.get(customer.id) || 0) +
                Number(generated.amount || 0)
            );
          }
        }
      }

      // =========================
      // INSERT OPERATIONS
      // =========================

      if (operations.length > 0) {

        let { error } =
          await supabase
            .from('sandbox_operations')
            .insert(operations);

        if (
          error &&
          /customer_balance_at_request|game_balance_at_request|column .* does not exist|field .* not found/i
            .test(error.message)
        ) {
          const legacyOperations =
            operations.map(operation => {
              const legacyOperation = {
                ...operation
              };
              delete legacyOperation
                .customer_balance_at_request;
              delete legacyOperation
                .game_balance_at_request;
              return legacyOperation;
            });

          const retry =
            await supabase
              .from('sandbox_operations')
              .insert(legacyOperations);

          error = retry.error;
        }

        if (error) {

          console.error(
            'Operation generation error:',
            error
          );

        } else {

          console.log(
            `${operations.length} operations generated for ${sessionId}`
          );
        }
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
