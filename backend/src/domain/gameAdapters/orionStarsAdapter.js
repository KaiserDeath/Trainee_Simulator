export const ORION_STARS_GAME = 'Orion Stars';

export const ORION_STARS_TRAINING_MODES = Object.freeze({
  FREE_SIMULATOR: 'FREE_SIMULATOR',
  GAME_ACCOUNT_CREATION: 'GAME_ACCOUNT_CREATION',
  FINAL_ASSESSMENT: 'FINAL_ASSESSMENT'
});

const assessedModes = new Set([
  ORION_STARS_TRAINING_MODES.GAME_ACCOUNT_CREATION,
  ORION_STARS_TRAINING_MODES.FINAL_ASSESSMENT
]);

export function shouldEnforceOrionAccountStructure(trainingMode) {
  if (trainingMode === ORION_STARS_TRAINING_MODES.FREE_SIMULATOR) {
    return false;
  }

  if (assessedModes.has(trainingMode)) {
    return true;
  }

  throw new TypeError('Unsupported Orion Stars training mode.');
}

export function assertOrionAccountCreationPolicyBoundary({
  trainingMode,
  accountPolicyEvaluation
}) {
  if (!shouldEnforceOrionAccountStructure(trainingMode)) {
    return;
  }

  if (
    accountPolicyEvaluation?.approved !== true ||
    !String(accountPolicyEvaluation?.policyVersionId || '').trim() ||
    accountPolicyEvaluation?.matches !== true
  ) {
    const error = new Error(
      'An approved Orion Stars account-structure policy evaluation is required for this assessed activity.'
    );
    error.statusCode = 409;
    error.code = 'ORION_ACCOUNT_POLICY_REQUIRED';
    throw error;
  }
}

export function buildOrionAccountCreationOutcome({
  account,
  trainingMode
}) {
  return {
    adapterKey: 'orion-stars',
    game: ORION_STARS_GAME,
    trainingMode,
    accountStructureEvaluation: {
      enforced: shouldEnforceOrionAccountStructure(trainingMode),
      status: trainingMode === ORION_STARS_TRAINING_MODES.FREE_SIMULATOR
        ? 'NOT_EVALUATED'
        : 'VALIDATED_BY_APPROVED_POLICY'
    },
    successPrompt: {
      kind: 'ORION_ACCOUNT_CREATED',
      title: 'Success',
      message: 'Player account created successfully.'
    },
    evidence: {
      artifactType: 'CREATED_GAME_ACCOUNT',
      gameAccountId: account.id,
      sessionId: account.session_id,
      customerId: account.customer_id,
      game: ORION_STARS_GAME,
      gameUsername: account.game_username,
      createdAt: account.created_at || null
    }
  };
}
