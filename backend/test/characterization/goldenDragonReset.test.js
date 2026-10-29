import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOLDEN_DRAGON_CHANGED_PASSWORD_RATE,
  needsGoldenDragonReset
} from '../../src/engine/OperationGenerator.js';

test('about half of Golden Dragon password resets need Reset first', () => {
  assert.equal(needsGoldenDragonReset('RESET PASSWORD', 'Golden Dragon', 0), true);
  assert.equal(
    needsGoldenDragonReset(
      'RESET PASSWORD',
      'Golden Dragon',
      GOLDEN_DRAGON_CHANGED_PASSWORD_RATE
    ),
    false
  );
});

test('only Golden Dragon password resets get a changed password', () => {
  for (const game of ['Orion Stars', 'Vblink']) {
    assert.equal(needsGoldenDragonReset('RESET PASSWORD', game, 0), false);
  }
  for (const type of ['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE']) {
    assert.equal(needsGoldenDragonReset(type, 'Golden Dragon', 0), false);
  }
});
