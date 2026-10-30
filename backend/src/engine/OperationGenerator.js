import { v4 as uuidv4 }
  from 'uuid';

export function generateOperation(
  customer,
  gameAccount,
  sessionId,
  operationType,
  targetGame = gameAccount?.game
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
    if (!gameAccount) {
      return null;
    }

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
      gameAccount?.id || null,

    game:
      targetGame,

    type:
      operationType,

    amount,

    customer_balance_at_request:
      Number(customer.balance),

    game_balance_at_request:
      gameAccount
        ? Number(gameAccount.balance)
        : null,

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

// Already processed and player in game each affect roughly 1 in 12 movements.
export const MOVEMENT_SCENARIO_RATE = 1 / 12;
export const PENDING_RECONCILIATION_RATE = 0.4;

export function pickMovementScenario(
  operationType,
  random = Math.random()
) {
  if (
    operationType !== 'ADD CREDITS' &&
    operationType !== 'WITHDRAW CREDITS'
  ) {
    return null;
  }

  if (random < MOVEMENT_SCENARIO_RATE) {
    return 'ALREADY_PROCESSED';
  }

  if (random < MOVEMENT_SCENARIO_RATE * 2) {
    return 'PLAYER_IN_GAME';
  }

  if (random < MOVEMENT_SCENARIO_RATE * 2 + PENDING_RECONCILIATION_RATE) {
    return 'PENDING_RECONCILIATION';
  }

  return null;
}

// Golden Dragon shows the Customer ID as the password. In about half of its
// Reset Password requests the password was changed in the game: it shows a
// Reset button instead, and only after Reset → OK is it the Customer ID again.
export const GOLDEN_DRAGON_CHANGED_PASSWORD_PREFIX = 'CHANGED:';
export const GOLDEN_DRAGON_CHANGED_PASSWORD_RATE = 1 / 2;

export function needsGoldenDragonReset(
  operationType,
  game,
  random = Math.random()
) {
  return (
    operationType === 'RESET PASSWORD' &&
    game === 'Golden Dragon' &&
    random < GOLDEN_DRAGON_CHANGED_PASSWORD_RATE
  );
}
