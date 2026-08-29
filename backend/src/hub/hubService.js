import { HubError } from './HubError.js';

const SENSITIVE_STATE_KEYS = new Set([
  'password',
  'newpassword',
  'secret',
  'token',
  'apikey',
  'credential',
  'credentials',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'authorization',
  'cookie'
]);

function containsSensitiveStateKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some(containsSensitiveStateKey);
  }
  return Object.entries(value).some(([key, child]) => (
    SENSITIVE_STATE_KEYS.has(key.replaceAll('_', '').toLowerCase()) ||
    containsSensitiveStateKey(child)
  ));
}

function requireNonEmptyString(value, fieldName, maxLength = 200) {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > maxLength
  ) {
    throw new HubError(
      400,
      'HUB_VALIDATION_ERROR',
      `${fieldName} must be a non-empty string of at most ${maxLength} characters.`
    );
  }

  return value.trim();
}

function normalizeState(state) {
  if (state === undefined) {
    return {};
  }

  if (
    state === null ||
    typeof state !== 'object' ||
    Array.isArray(state)
  ) {
    throw new HubError(
      400,
      'HUB_VALIDATION_ERROR',
      'state must be a JSON object.'
    );
  }

  if (containsSensitiveStateKey(state)) {
    throw new HubError(
      400,
      'HUB_SENSITIVE_EVIDENCE_REJECTED',
      'Credentials, tokens, and secrets must not be stored in Hub activity evidence.'
    );
  }

  return state;
}

export function createHubService(repository) {
  if (!repository) {
    throw new TypeError('A Hub repository is required.');
  }

  return Object.freeze({
    async getLearningPath(identity) {
      return repository.getLearningPath(identity);
    },

    async completeActivity(identity, activityId, body = {}) {
      return repository.completeActivity({
        identity,
        activityId: requireNonEmptyString(activityId, 'activityId'),
        state: normalizeState(body.state),
        idempotencyKey: requireNonEmptyString(
          body.idempotencyKey,
          'idempotencyKey'
        )
      });
    },

    async startActivityAttempt(identity, activityId, body = {}) {
      return repository.startActivityAttempt({
        identity,
        activityId: requireNonEmptyString(activityId, 'activityId'),
        state: normalizeState(body.state),
        idempotencyKey: requireNonEmptyString(
          body.idempotencyKey,
          'idempotencyKey'
        )
      });
    },

    async getActivityAttempt(identity, attemptId) {
      const attempt = await repository.getActivityAttempt({
        identity,
        attemptId: requireNonEmptyString(attemptId, 'attemptId')
      });

      if (!attempt) {
        throw new HubError(
          404,
          'HUB_ATTEMPT_NOT_FOUND',
          'The activity attempt was not found.'
        );
      }

      return attempt;
    },

    async completeActivityAttempt(identity, attemptId, body = {}) {
      return repository.completeActivityAttempt({
        identity,
        attemptId: requireNonEmptyString(attemptId, 'attemptId'),
        state: normalizeState(body.state),
        idempotencyKey: requireNonEmptyString(
          body.idempotencyKey,
          'idempotencyKey'
        )
      });
    },

    async listTrainerLearners(identity) {
      return repository.listTrainerLearners(identity);
    },

    async getTrainerLearner(identity, learnerIdentityId) {
      const learner = await repository.getTrainerLearner({
        identity,
        learnerIdentityId: requireNonEmptyString(
          learnerIdentityId,
          'learnerIdentityId'
        )
      });

      if (!learner) {
        throw new HubError(
          404,
          'HUB_POSTULANTE_NOT_FOUND',
          'The Postulante was not found.'
        );
      }

      return learner;
    },

    async getTrainerAttempt(identity, attemptId) {
      const attempt = await repository.getTrainerAttempt({
        identity,
        attemptId: requireNonEmptyString(attemptId, 'attemptId')
      });

      if (!attempt) {
        throw new HubError(
          404,
          'HUB_ATTEMPT_NOT_FOUND',
          'The activity attempt was not found.'
        );
      }

      return attempt;
    }
  });
}
