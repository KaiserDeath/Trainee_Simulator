import assert from 'node:assert/strict';
import test from 'node:test';

import { generateOperation } from '../src/engine/OperationGenerator.js';

const customer = {
  id: 'customer-empty',
  balance: 500,
};

test('Create Account targets a game without attaching an existing game account', () => {
  const operation = generateOperation(
    customer,
    null,
    'session-1',
    'CREATE ACCOUNT',
    'Orion Stars'
  );

  assert.equal(operation.customer_id, customer.id);
  assert.equal(operation.game, 'Orion Stars');
  assert.equal(operation.game_account_id, null);
  assert.equal(operation.game_balance_at_request, null);
});

test('movement generation still requires an existing game account', () => {
  assert.equal(
    generateOperation(
      customer,
      null,
      'session-1',
      'WITHDRAW CREDITS',
      'Orion Stars'
    ),
    null
  );
});
