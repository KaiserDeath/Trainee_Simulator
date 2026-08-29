import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
