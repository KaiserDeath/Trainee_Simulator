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
    const maxAvailable =
      operationType ===
      'ADD CREDITS'
        ? Number(customer.balance)
        : Number(gameAccount.balance);

    if (Number.isFinite(maxAvailable) && maxAvailable > 0) {
      const limit =
        Math.min(500, Math.floor(maxAvailable));
      amount =
        Math.floor(
          Math.random() * limit
        ) + 1;
    }
  }

  // =========================
  // RETURN OPERATION
  // =========================

  if (
    (operationType === 'ADD CREDITS' && !amount) ||
    (operationType === 'WITHDRAW CREDITS' && !amount)
  ) {
    return null;
  }

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

    customer_balance_at_request:
      Number(customer.balance),

    game_balance_at_request:
      Number(gameAccount.balance),

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
