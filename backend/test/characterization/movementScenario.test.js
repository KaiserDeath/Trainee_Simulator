import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOVEMENT_SCENARIO_RATE,
  PENDING_RECONCILIATION_RATE,
  pickMovementScenario
} from '../../src/engine/OperationGenerator.js';

test('credit movements retain the existing already processed and player in game rates', () => {
  assert.equal(pickMovementScenario('ADD CREDITS', 0), 'ALREADY_PROCESSED');
  assert.equal(
    pickMovementScenario('WITHDRAW CREDITS', MOVEMENT_SCENARIO_RATE * 1.5),
    'PLAYER_IN_GAME'
  );
  assert.equal(
    pickMovementScenario('ADD CREDITS', MOVEMENT_SCENARIO_RATE * 2.5),
    'PENDING_RECONCILIATION'
  );
});

test('pending reconciliation covers 40 percent of each credit movement type', () => {
  assert.equal(PENDING_RECONCILIATION_RATE, 0.4);
  const start = MOVEMENT_SCENARIO_RATE * 2;
  const end = start + PENDING_RECONCILIATION_RATE;

  for (const type of ['ADD CREDITS', 'WITHDRAW CREDITS']) {
    assert.equal(pickMovementScenario(type, start - 0.000001), 'PLAYER_IN_GAME');
    assert.equal(pickMovementScenario(type, start), 'PENDING_RECONCILIATION');
    assert.equal(pickMovementScenario(type, end - 0.000001), 'PENDING_RECONCILIATION');
    assert.equal(pickMovementScenario(type, end), null);
    assert.equal(pickMovementScenario(type, 0.999999), null);
  }
});

test('requests never get a movement twist', () => {
  for (const type of ['CREATE ACCOUNT', 'RESET PASSWORD', 'REFRESH BALANCE']) {
    assert.equal(pickMovementScenario(type, 0), null);
  }
});
