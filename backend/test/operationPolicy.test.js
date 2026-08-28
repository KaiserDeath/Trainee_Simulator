import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateOperation
} from '../src/services/scoringService.js';
import {
  getMovementCancellationReason,
  MAX_CANCELLATION_REASON_LENGTH
} from '../src/services/operationPolicy.js';

const addCredits = {
  type: 'ADD CREDITS',
  amount: 25
};

const withdrawCredits = {
  type: 'WITHDRAW CREDITS',
  amount: 25,
  game_balance_at_request: 10
};

test('requires and trims a reason when cancelling a credit movement', () => {
  assert.equal(
    getMovementCancellationReason({
      operation: addCredits,
      action: 'CANCELLED',
      requestData: {
        cancellationReason: '  Customer requested cancellation  '
      }
    }),
    'Customer requested cancellation'
  );

  assert.throws(
    () => getMovementCancellationReason({
      operation: withdrawCredits,
      action: 'CANCELLED'
    }),
    error =>
      error.statusCode === 400 &&
      /reason is required/i.test(error.message)
  );
});

test('does not require a reason outside movement cancellation', () => {
  assert.equal(
    getMovementCancellationReason({
      operation: addCredits,
      action: 'APPROVED'
    }),
    null
  );

  assert.equal(
    getMovementCancellationReason({
      operation: {
        type: 'RESET PASSWORD'
      },
      action: 'CANCELLED'
    }),
    null
  );
});

test('rejects cancellation reasons above the storage limit', () => {
  assert.throws(
    () => getMovementCancellationReason({
      operation: addCredits,
      action: 'CANCELLED',
      requestData: {
        cancellationReason:
          'x'.repeat(
            MAX_CANCELLATION_REASON_LENGTH + 1
          )
      }
    }),
    error =>
      error.statusCode === 400 &&
      /characters or fewer/i.test(error.message)
  );
});

test('cancellation reason does not participate in scoring', () => {
  const withoutReason = evaluateOperation(
    withdrawCredits,
    'CANCELLED',
    {}
  );
  const withReason = evaluateOperation(
    withdrawCredits,
    'CANCELLED',
    {
      cancellationReason:
        'Any operational note'
    }
  );

  assert.equal(withoutReason, true);
  assert.equal(withReason, withoutReason);
});
