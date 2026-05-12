import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

const router = Router();

//
// GET ALL SESSIONS
//
router.get('/sessions', async (
  req,
  res
) => {

  const { data, error } =
    await supabase
      .from('trainee_sessions')
      .select('*')
      .order('started_at', {
        ascending: false
      });

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  res.json(data);
});

//
// GET SESSION REPORT
//
router.get('/sessions/:id/report', async (
  req,
  res
) => {

  try {

    const { id } = req.params;

    // ============================
    // GET SESSION
    // ============================

    const {
      data: session,
      error: sessionError
    } = await supabase
      .from('trainee_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (
      sessionError ||
      !session
    ) {
      return res.status(404).json({
        error:
          'Session not found'
      });
    }

    // ============================
    // GET OPERATIONS
    // ============================

    const {
      data: operations,
      error: operationsError
    } = await supabase
      .from('sandbox_operations')
      .select(`
        *,
        customer:sandbox_customers(
          username
        ),
        game_account:sandbox_game_accounts(
          game
        )
      `)
      .eq('session_id', id);

    if (operationsError) {
      return res.status(500).json({
        error:
          operationsError.message
      });
    }

    // ============================
    // CALCULATIONS
    // ============================

    const totalOperations =
      operations.length;

    const processedOperations =
      operations.filter(op =>
        op.status !== 'PENDING'
      );

    const completedCount =
      processedOperations.length;

    const correctOperations =
      processedOperations.filter(
        op => op.is_correct === true
      );

    const incorrectOperations =
      processedOperations.filter(
        op => op.is_correct === false
      );

    const correctCount =
      correctOperations.length;

    const incorrectCount =
      incorrectOperations.length;

    const accuracy =
      completedCount > 0
        ? (
            (
              correctCount /
              completedCount
            ) * 100
          ).toFixed(2)
        : 0;

    // ============================
    // AVERAGE SPEED
    // ============================

    const processingTimes =
      processedOperations
        .filter(op =>
          op.processing_time_seconds
        )
        .map(op =>
          Number(
            op.processing_time_seconds
          )
        );

    const averageProcessingTime =
      processingTimes.length > 0
        ? (
            processingTimes.reduce(
              (a, b) => a + b,
              0
            ) /
            processingTimes.length
          ).toFixed(2)
        : 0;

    // ============================
    // OPERATION BREAKDOWN
    // ============================

    const operationBreakdown = {

      movements: {
        addCredits:
          operations.filter(op =>
            op.type ===
            'ADD CREDITS'
          ).length,

        withdrawCredits:
          operations.filter(op =>
            op.type ===
            'WITHDRAW CREDITS'
          ).length
      },

      requests: {
        createAccount:
          operations.filter(op =>
            op.type ===
            'CREATE ACCOUNT'
          ).length,

        resetPassword:
          operations.filter(op =>
            op.type ===
            'RESET PASSWORD'
          ).length,

        refreshBalance:
          operations.filter(op =>
            op.type ===
            'REFRESH BALANCE'
          ).length
      }
    };

    // ============================
    // RESPONSE
    // ============================

    res.json({

      session: {
        id: session.id,
        trainee_name:
          session.trainee_name,

        started_at:
          session.started_at,

        ended_at:
          session.ended_at,

        status:
          session.status
      },

      performance: {

        totalOperations,

        completedOperations:
          completedCount,

        pendingOperations:
          totalOperations -
          completedCount,

        correctOperations:
          correctCount,

        incorrectOperations:
          incorrectCount,

        accuracy:
          Number(accuracy),

        averageProcessingTimeSeconds:
          Number(
            averageProcessingTime
          )
      },

      operationBreakdown,

      operations
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

export default router;