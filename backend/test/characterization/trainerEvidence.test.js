import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCreatedAccountRequirement,
  buildReservationRequirement,
  buildSecretMatchRequirement,
  sanitizeRequestEvidence,
  stripRawRequestPayload
} from '../../src/domain/trainerEvidence.js';

test('trainer evidence never exposes a submitted password literal', () => {
  const evidence = sanitizeRequestEvidence({
    gameId: 'neutral-player',
    kiosk: 'neutral-game',
    amount: 10,
    newPassword: 'fixture-secret',
    token: 'also-sensitive'
  });

  assert.deepEqual(evidence, {
    gameId: 'neutral-player',
    kiosk: 'neutral-game',
    amount: 10,
    passwordProvided: true
  });
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /fixture-secret|also-sensitive/
  );
});

test('trainer report rows remove every raw request payload alias', () => {
  const sanitized = stripRawRequestPayload({
    id: 'operation-id',
    request_data: { newPassword: 'one' },
    requestData: { newPassword: 'two' },
    request_payload: { newPassword: 'three' },
    submitted_data: { newPassword: 'four' }
  });

  assert.deepEqual(sanitized, {
    id: 'operation-id'
  });
});

test('password comparison evidence reports the result without either literal', () => {
  const matched = buildSecretMatchRequirement({
    label: 'Backoffice password',
    submittedValue: 'submitted-secret',
    storedValue: 'submitted-secret'
  });
  const mismatched = buildSecretMatchRequirement({
    label: 'Backoffice password',
    submittedValue: 'submitted-secret',
    storedValue: 'different-stored-secret'
  });

  assert.equal(matched.ok, true);
  assert.equal(mismatched.ok, false);
  assert.doesNotMatch(
    JSON.stringify({ matched, mismatched }),
    /submitted-secret|different-stored-secret/
  );
});

test('new Add Credits operations expose committed or released reservation evidence', () => {
  assert.deepEqual(
    buildReservationRequirement({
      type: 'ADD CREDITS',
      status: 'APPROVED',
      queue_policy_version: 1,
      customer_reservation_status: 'COMMITTED'
    }),
    {
      label: 'Customer reservation',
      expected: 'COMMITTED',
      sent: 'COMMITTED',
      ok: true
    }
  );

  assert.equal(
    buildReservationRequirement({
      type: 'ADD CREDITS',
      status: 'APPROVED',
      queue_policy_version: 0,
      customer_reservation_status: 'NONE'
    }),
    null
  );
});

test('Golden Dragon create account row names the Mobile ID and password match', () => {
  const operation = {
    type: 'CREATE ACCOUNT',
    game: 'Golden Dragon',
    game_account: null
  };

  assert.deepEqual(
    buildCreatedAccountRequirement({ operation, created: true }),
    {
      label: 'Mobile ID and Mobile Password',
      expected: 'Match',
      sent: 'Match',
      ok: true
    }
  );
  assert.deepEqual(
    buildCreatedAccountRequirement({ operation, created: false }),
    {
      label: 'Mobile ID and Mobile Password',
      expected: 'Match',
      sent: 'No match',
      ok: false
    }
  );
});

test('Golden Dragon row follows the linked game account over the request game', () => {
  assert.equal(
    buildCreatedAccountRequirement({
      operation: {
        type: 'CREATE ACCOUNT',
        game: 'Orion Stars',
        game_account: { game: 'Golden Dragon' }
      },
      created: true
    }).label,
    'Mobile ID and Mobile Password'
  );
});

test('other games keep the account created row', () => {
  for (const game of ['Orion Stars', 'Vblink']) {
    const operation = {
      type: 'CREATE ACCOUNT',
      game,
      game_account: null
    };

    assert.deepEqual(
      buildCreatedAccountRequirement({ operation, created: true }),
      {
        label: 'Account created',
        expected: 'Created',
        sent: 'Created',
        ok: true
      }
    );
    assert.deepEqual(
      buildCreatedAccountRequirement({ operation, created: false }),
      {
        label: 'Account created',
        expected: 'Created',
        sent: 'Missing',
        ok: false
      }
    );
  }
});