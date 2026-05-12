import { v4 as uuidv4 }
  from 'uuid';

export function generateOperation(
  customer,
  gameAccount,
  sessionId,
  operationType
) {

  let amount = null;

  // =========================
  // MOVEMENTS HAVE AMOUNTS
  // =========================

  if (
    operationType ===
      'ADD CREDITS' ||

    operationType ===
      'WITHDRAW CREDITS'
  ) {

    amount =
      Math.floor(
        Math.random() * 500
      ) + 20;
  }

  // =========================
  // RETURN OPERATION
  // =========================

  return {

    id: uuidv4(),

    session_id:
      sessionId,

    customer_id:
      customer.id,

    game_account_id:
      gameAccount.id,

    type:
      operationType,

    amount,

    status:
      'PENDING',

    created_at:
      new Date().toISOString(),

    processed_at:
      null,

    processed_by:
      null,

    is_correct:
      null,

    processing_time_seconds:
      null
  };
}