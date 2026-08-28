import {
  MOVEMENT_TYPES
} from './scoringService.js';

export const MAX_CANCELLATION_REASON_LENGTH = 1000;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function getMovementCancellationReason({
  operation,
  action,
  requestData = {}
}) {
  const requiresReason =
    action === 'CANCELLED' &&
    MOVEMENT_TYPES.includes(operation.type);

  if (!requiresReason) {
    return null;
  }

  const reason = String(
    requestData.cancellationReason ?? ''
  ).trim();

  if (!reason) {
    throw badRequest(
      'Cancellation reason is required for credit movements'
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
