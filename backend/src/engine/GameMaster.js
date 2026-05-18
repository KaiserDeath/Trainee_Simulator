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
        weight: 30
      },
      {
        type: 'WITHDRAW CREDITS',
        weight: 15
      },
      {
        type: 'RESET PASSWORD',
        weight: 35
      },
      {
        type: 'REFRESH BALANCE',
        weight: 15
      },
      {
        type: 'CREATE ACCOUNT',
        weight: 5
      }
    ];
  }

  //
  // START SESSION
  //
  async startSession(sessionId) {

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

    const timeout = setTimeout(async () => {
      console.log(
        `Auto-closing session ${sessionId} after 30 minutes`
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
    }, this.autoCloseMs);

    this.activeSessions.set(
      sessionId,
      {
        interval,
        timeout
      }
    );
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

      // =========================
      // CREATE OPERATIONS
      // =========================

      for (
        let i = 0;
        i < numberOfOperations;
        i++
      ) {

        const customer =
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

        operations.push(
          generateOperation(
            customer,
            selectedGame,
            sessionId,
            operationType
          )
        );
      }

      // =========================
      // INSERT OPERATIONS
      // =========================

      if (operations.length > 0) {

        const { error } =
          await supabase
            .from('sandbox_operations')
            .insert(operations);

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
