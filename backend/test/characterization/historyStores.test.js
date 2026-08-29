import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOMER_MOVEMENT_HISTORY_TABLE,
  GAME_HISTORY_TABLE,
  isGameHistoryType
} from '../../src/domain/historyStores.js';

test('Backend customer movements and game actions use different stores', () => {
  assert.notEqual(
    CUSTOMER_MOVEMENT_HISTORY_TABLE,
    GAME_HISTORY_TABLE
  );
  assert.equal(
    CUSTOMER_MOVEMENT_HISTORY_TABLE,
    'sandbox_transaction_history'
  );
  assert.equal(
    GAME_HISTORY_TABLE,
    'sandbox_game_history'
  );
});

test('game action types cannot leak into customer movement results', () => {
  assert.equal(
    isGameHistoryType('GAME ADD CREDITS'),
    true
  );
  assert.equal(
    isGameHistoryType('ADD CREDITS'),
    false
  );
});
