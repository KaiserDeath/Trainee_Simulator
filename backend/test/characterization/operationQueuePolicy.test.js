import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canQueueOperation,
  createPendingOperationOccupancy,
  occupyPendingOperation
} from '../../src/domain/operationQueuePolicy.js';

const pending = overrides => ({
  status: 'PENDING',
  customer_id: 'customer-a',
  game_account_id: 'game-a',
  game: 'Orion Stars',
  type: 'ADD CREDITS',
  ...overrides
});

test('limited seeds allow only one pending movement per customer', () => {
  const occupancy =
    createPendingOperationOccupancy([
      pending({ type: 'ADD CREDITS' })
    ]);

  assert.equal(
    canQueueOperation(
      occupancy,
      pending({
        type: 'WITHDRAW CREDITS',
        game_account_id: 'game-b',
        game: 'Vblink'
      })
    ),
    false
  );
});

test('a request can coexist with a movement for the same customer', () => {
  const occupancy =
    createPendingOperationOccupancy([
      pending({ type: 'ADD CREDITS' })
    ]);

  assert.equal(
    canQueueOperation(
      occupancy,
      pending({
        type: 'RESET PASSWORD'
      })
    ),
    true
  );
});

test('requests for one customer must use different games', () => {
  const occupancy =
    createPendingOperationOccupancy([
      pending({ type: 'RESET PASSWORD' })
    ]);

  assert.equal(
    canQueueOperation(
      occupancy,
      pending({
        type: 'REFRESH BALANCE',
        game_account_id: 'another-account-for-same-game'
      })
    ),
    false
  );
  assert.equal(
    canQueueOperation(
      occupancy,
      pending({
        type: 'CREATE ACCOUNT',
        game_account_id: 'game-b',
        game: 'Vblink'
      })
    ),
    true
  );
});

test('operations selected in the same generator batch occupy their slot', () => {
  const occupancy =
    createPendingOperationOccupancy();
  const first = pending({
    type: 'REFRESH BALANCE'
  });

  assert.equal(
    canQueueOperation(occupancy, first),
    true
  );
  occupyPendingOperation(occupancy, first);
  assert.equal(
    canQueueOperation(
      occupancy,
      pending({ type: 'RESET PASSWORD' })
    ),
    false
  );
});
