import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertOrionAccountCreationPolicyBoundary,
  buildOrionAccountCreationOutcome,
  ORION_STARS_TRAINING_MODES,
  shouldEnforceOrionAccountStructure
} from '../../src/domain/gameAdapters/orionStarsAdapter.js';

test('Orion Stars leaves account structure ungraded in Free Simulator mode', () => {
  assert.equal(
    shouldEnforceOrionAccountStructure(ORION_STARS_TRAINING_MODES.FREE_SIMULATOR),
    false
  );
  assert.doesNotThrow(() => assertOrionAccountCreationPolicyBoundary({
    trainingMode: ORION_STARS_TRAINING_MODES.FREE_SIMULATOR
  }));
});

test('Orion Stars requires an approved matching policy in Module 3 and final assessment', () => {
  for (const trainingMode of [
    ORION_STARS_TRAINING_MODES.GAME_ACCOUNT_CREATION,
    ORION_STARS_TRAINING_MODES.FINAL_ASSESSMENT
  ]) {
    assert.equal(shouldEnforceOrionAccountStructure(trainingMode), true);
    assert.throws(
      () => assertOrionAccountCreationPolicyBoundary({ trainingMode }),
      (error) => error.code === 'ORION_ACCOUNT_POLICY_REQUIRED'
    );
    assert.doesNotThrow(() => assertOrionAccountCreationPolicyBoundary({
      trainingMode,
      accountPolicyEvaluation: {
        approved: true,
        matches: true,
        policyVersionId: 'approved-policy-version'
      }
    }));
  }
});

test('Orion Stars creation outcome contains safe artifact evidence and no password', () => {
  const outcome = buildOrionAccountCreationOutcome({
    trainingMode: ORION_STARS_TRAINING_MODES.FREE_SIMULATOR,
    account: {
      id: 'account-1',
      session_id: 'session-1',
      customer_id: 'customer-1',
      game_username: 'any-free-simulator-id',
      password: 'must-not-leak',
      created_at: '2026-08-24T10:00:00.000Z'
    }
  });

  assert.equal(outcome.successPrompt.kind, 'ORION_ACCOUNT_CREATED');
  assert.equal(outcome.accountStructureEvaluation.status, 'NOT_EVALUATED');
  assert.equal(outcome.evidence.gameUsername, 'any-free-simulator-id');
  assert.doesNotMatch(JSON.stringify(outcome), /must-not-leak|password/i);
});
