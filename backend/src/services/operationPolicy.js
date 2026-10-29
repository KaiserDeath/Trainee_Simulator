import {
  MOVEMENT_TYPES
} from './scoringService.js';

export const MAX_CANCELLATION_REASON_LENGTH = 1000;

export const PENDING_RECONCILIATION =
  'PENDING_RECONCILIATION';

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function isPendingReconciliation(operation) {
  return (
    operation?.movement_scenario ===
    PENDING_RECONCILIATION
  );
}

// A movement the bot tried but could not confirm. The trainee never operates
// it from Pending; they only answer "It applied" / "It did not apply" from the
// Needs reconciliation tab, and the answer settles it.
export function assertReconciliationAnswer({
  operation,
  requestData = {}
}) {
  const isAnswer =
    requestData.reconciliation === true;

  if (isPendingReconciliation(operation) === isAnswer) {
    return;
  }

  const error = new Error(
    isAnswer
      ? 'This movement is not pending reconciliation'
      : 'Pending reconciliation: answer it from Needs reconciliation, do not operate it'
  );
  error.statusCode = 409;
  error.code = 'PENDING_RECONCILIATION';
  throw error;
}

function formatCredits(value) {
  return Number(value || 0).toFixed(2);
}

// What the bot reports for a movement it could not confirm. The balance read
// always fails (read=0.00), so the note never gives away whether it applied.
export function buildReconciliationNote(operation) {
  const before =
    Number(operation.game_balance_at_request || 0);
  const amount = Number(operation.amount || 0);
  const isAdd = operation.type === 'ADD CREDITS';
  const expected = isAdd
    ? before + amount
    : Math.max(before - amount, 0);

  return (
    'the platform accepted the movement but the balance did not end up as expected: ' +
    `before=${formatCredits(before)} ` +
    `expected ${isAdd ? 'at least' : 'at most'}=${formatCredits(expected)} ` +
    `read=0.00 (amount=${formatCredits(amount)})`
  );
}

export function getMovementCancellationReason({
  operation,
  action,
  requestData = {}
}) {
  const requiresReason =
    MOVEMENT_TYPES.includes(operation.type) &&
    (
      action === 'CANCELLED' ||
      isPendingReconciliation(operation)
    );

  if (!requiresReason) {
    return null;
  }

  const reason = String(
    requestData.cancellationReason ?? ''
  ).trim();

  if (!reason) {
    throw badRequest(
      isPendingReconciliation(operation)
        ? 'A reason is required to reconcile a movement'
        : 'Cancellation reason is required for credit movements'
    );
  }

  if (
    reason.length >
    MAX_CANCELLATION_REASON_LENGTH
  ) {
    throw badRequest(
      `Cancellation reason must be ${MAX_CANCELLATION_REASON_LENGTH} characters or fewer`
    );
  }

  return reason;
}
