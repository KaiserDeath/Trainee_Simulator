import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOVEMENT_SCENARIO_RATE,
  pickMovementScenario
} from '../../src/engine/OperationGenerator.js';

test('credit movements get each twist about 1 in 12 times', () => {
  assert.equal(pickMovementScenario('ADD CREDITS', 0), 'ALREADY_PROCESSED');
  assert.equal(
    pickMovementScenario('WITHDRAW CREDITS', MOVEMENT_SCENARIO_RATE * 1.5),
    'PLAYER_IN_GAME'
  );
  assert.equal(
    pickMovementScenario('ADD CREDITS', MOVEMENT_SCENARIO_RATE * 2.5),
    'PENDING_RECONCILIATION'
  );
  assert.equal(pickMovementScenario('ADD CREDITS', MOVEMENT_SCENARIO_RATE * 3), null);
});

test('requests never get a movement twist', () => {
  for (const type of ['CREATE ACCOUNT', 'RESET PASSWORD', 'REFRESH BALANCE']) {
    assert.equal(pickMovementScenario(type, 0), null);
  }
});
