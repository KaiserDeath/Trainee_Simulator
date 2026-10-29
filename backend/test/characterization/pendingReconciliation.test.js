import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertReconciliationAnswer,
  buildReconciliationNote,
  getMovementCancellationReason
} from '../../src/services/operationPolicy.js';

const reconciliation = {
  type: 'ADD CREDITS',
  amount: 50,
  game_balance_at_request: 3.5,
  movement_scenario: 'PENDING_RECONCILIATION'
};

const plainMovement = {
  type: 'ADD CREDITS',
  amount: 50,
  movement_scenario: null
};

test('a pending reconciliation cannot be operated from Pending', () => {
  for (const requestData of [{}, { cancellationReason: 'x' }]) {
    assert.throws(
      () => assertReconciliationAnswer({ operation: reconciliation, requestData }),
      (error) => error.statusCode === 409 && error.code === 'PENDING_RECONCILIATION'
    );
  }

  assertReconciliationAnswer({
    operation: reconciliation,
    requestData: { reconciliation: true }
  });
});

test('only pending reconciliations take a reconciliation answer', () => {
  assertReconciliationAnswer({ operation: plainMovement, requestData: {} });
  assert.throws(
    () => assertReconciliationAnswer({
      operation: plainMovement,
      requestData: { reconciliation: true }
    }),
    (error) => error.statusCode === 409
  );
});

test('both reconciliation answers require a reason', () => {
  for (const action of ['APPROVED', 'CANCELLED']) {
    assert.throws(
      () => getMovementCancellationReason({
        operation: reconciliation,
        action,
        requestData: { reconciliation: true, cancellationReason: '  ' }
      }),
      /reason is required to reconcile/
    );

    assert.equal(
      getMovementCancellationReason({
        operation: reconciliation,
        action,
        requestData: { cancellationReason: ' checked game history ' }
      }),
      'checked game history'
    );
  }
});

test('the bot note shows the expected balance but never the real one', () => {
  assert.equal(
    buildReconciliationNote(reconciliation),
    'the platform accepted the movement but the balance did not end up as expected: ' +
      'before=3.50 expected at least=53.50 read=0.00 (amount=50.00)'
  );
  assert.match(
    buildReconciliationNote({
      type: 'WITHDRAW CREDITS',
      amount: 20,
      game_balance_at_request: 30
    }),
    /expected at most=10\.00 read=0\.00/
  );
});

test('settlement grades the answer against what the bot really did', async () => {
  const sql = await readFile(
    new URL(
      '../../../supabase/migrations/20261029000000_pending_reconciliation.sql',
      import.meta.url
    ),
    'utf8'
  );

  assert.match(sql, /ADD COLUMN IF NOT EXISTS bot_applied BOOLEAN/);
  assert.match(
    sql,
    /WHEN COALESCE\(v_operation\.bot_applied, FALSE\)\s+THEN v_action = 'APPROVED' AND v_match_count = 1\s+ELSE v_action = 'CANCELLED' AND v_match_count = 0/
  );
});
