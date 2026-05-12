import { Router } from 'express';

import { supabase }
  from '../config/supabase.js';

const router = Router();

//
// GET PENDING OPERATIONS
//
router.get('/:sessionId', async (
  req,
  res
) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(`
      *,
      customer:sandbox_customers(
        username,
        first_name,
        last_name,
        email,
        balance
      ),
      game_account:sandbox_game_accounts(
        game,
        game_username,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .eq('status', 'PENDING')
    .order('created_at', {
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
// PROCESS OPERATION
//
router.post('/:id/process', async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const {
      action,
      traineeName
    } = req.body;

    if (
      !action ||
      !traineeName
    ) {
      return res.status(400).json({
        error:
          'action and traineeName required'
      });
    }

    // GET OPERATION
    const { data: operation, error } =
      await supabase
        .from('sandbox_operations')
        .select(`
          *,
          customer:sandbox_customers(*),
          game_account:sandbox_game_accounts(*)
        `)
        .eq('id', id)
        .single();

    if (error || !operation) {
      return res.status(404).json({
        error:
          'Operation not found'
      });
    }

    if (
      operation.status !== 'PENDING'
    ) {
      return res.status(400).json({
        error:
          'Operation already processed'
      });
    }

    // =================================
    // EVALUATION LOGIC
    // =================================

    let isCorrect = false;

    // ADD CREDITS
    if (
      operation.type ===
      'ADD CREDITS'
    ) {
      const shouldApprove =
        operation.customer.balance >=
        operation.amount;

      if (
        action === 'APPROVED' &&
        shouldApprove
      ) {
        isCorrect = true;
      }

      if (
        action === 'CANCELLED' &&
        !shouldApprove
      ) {
        isCorrect = true;
      }
    }

    // WITHDRAW CREDITS
    else if (
      operation.type ===
      'WITHDRAW CREDITS'
    ) {
      const shouldApprove =
        operation.game_account.balance >=
        operation.amount;

      if (
        action === 'APPROVED' &&
        shouldApprove
      ) {
        isCorrect = true;
      }

      if (
        action === 'CANCELLED' &&
        !shouldApprove
      ) {
        isCorrect = true;
      }
    }

    // REQUESTS
    else {
      isCorrect =
        action === 'APPROVED';
    }

    // =================================
    // APPLY BALANCE CHANGES
    // =================================

    if (action === 'APPROVED') {

      // ADD CREDITS
      if (
        operation.type ===
        'ADD CREDITS'
      ) {
        await supabase
          .from('sandbox_customers')
          .update({
            balance:
              operation.customer.balance -
              operation.amount
          })
          .eq(
            'id',
            operation.customer_id
          );

        await supabase
          .from(
            'sandbox_game_accounts'
          )
          .update({
            balance:
              operation.game_account
                .balance +
              operation.amount
          })
          .eq(
            'id',
            operation.game_account_id
          );
      }

      // WITHDRAW CREDITS
      if (
        operation.type ===
        'WITHDRAW CREDITS'
      ) {
        await supabase
          .from('sandbox_customers')
          .update({
            balance:
              operation.customer.balance +
              operation.amount
          })
          .eq(
            'id',
            operation.customer_id
          );

        await supabase
          .from(
            'sandbox_game_accounts'
          )
          .update({
            balance:
              operation.game_account
                .balance -
              operation.amount
          })
          .eq(
            'id',
            operation.game_account_id
          );
      }
    }

    // =================================
    // CALCULATE PROCESSING TIME
    // =================================

    const created =
      new Date(
        operation.created_at
      ).getTime();

    const processed =
      Date.now();

    const processingSeconds =
      (
        processed - created
      ) / 1000;

    // =================================
    // UPDATE OPERATION
    // =================================

    const {
      data: updatedOperation,
      error: updateError
    } = await supabase
      .from('sandbox_operations')
      .update({
        status: action,
        processed_at:
          new Date().toISOString(),

        processed_by:
          traineeName,

        is_correct:
          isCorrect,

        processing_time_seconds:
          processingSeconds
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        error:
          updateError.message
      });
    }

    // =================================
    // CREATE AUDIT HISTORY
    // =================================

    await supabase
      .from(
        'sandbox_transaction_history'
      )
      .insert({
        session_id:
          operation.session_id,

        customer_id:
          operation.customer_id,

        type:
          operation.type,

        amount:
          operation.amount,

        description:
          `Operation ${action} by ${traineeName}`
      });

    res.json({
      message:
        'Operation processed',

      isCorrect,

      processingSeconds,

      operation:
        updatedOperation
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

export default router;