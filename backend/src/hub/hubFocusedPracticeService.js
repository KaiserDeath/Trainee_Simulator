import { HubError } from './HubError.js';

function requiredKey(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', 'idempotencyKey must be a non-empty string.');
  }
  return value.trim();
}

function numeric(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${field} must be a non-negative number.`);
  }
  return parsed;
}

function positiveNumeric(value, field) {
  const parsed = numeric(value, field);
  if (parsed <= 0) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${field} must be greater than zero.`);
  }
  return parsed;
}

export function createHubFocusedPracticeService({ practiceRepository, hubService }) {
  if (!practiceRepository || !hubService) {
    throw new TypeError('Focused practice and Hub services are required.');
  }

  return Object.freeze({
    async start(identity, activityId, body = {}) {
      return practiceRepository.start({
        identity,
        activityId,
        idempotencyKey: requiredKey(body.idempotencyKey),
      });
    },

    async read(identity, activityId) {
      return practiceRepository.read({ identity, activityId });
    },

    async submitRefresh(identity, activityId, body = {}) {
      const observation = await practiceRepository.submitRefresh({
        identity,
        activityId,
        accountId: typeof body.accountId === 'string' ? body.accountId.trim() : '',
        observedCredit: numeric(body.observedCredit, 'observedCredit'),
        observedAvailableBalance: numeric(body.observedAvailableBalance, 'observedAvailableBalance'),
      });
      const completion = await hubService.completeActivityAttempt(
        identity,
        observation.context.activityAttemptId,
        {
          state: {
            focusedPractice: true,
            game: observation.context.game,
            operation: 'REFRESH BALANCE',
            accountId: observation.account.id,
            observedCredit: observation.observedCredit,
            observedAvailableBalance: observation.observedAvailableBalance,
            verified: true,
          },
          idempotencyKey: requiredKey(body.idempotencyKey),
        }
      );
      return { ...observation, completion };
    },

    async startAddCredits(identity, activityId, body = {}) {
      return practiceRepository.startAddCredits({
        identity,
        activityId,
        idempotencyKey: requiredKey(body.idempotencyKey),
      });
    },

    async readAddCredits(identity, activityId) {
      return practiceRepository.readAddCredits({ identity, activityId });
    },

    async rechargeAddCredits(identity, activityId, body = {}) {
      return practiceRepository.rechargeAddCredits({
        identity,
        activityId,
        accountId: typeof body.accountId === 'string' ? body.accountId.trim() : '',
        amount: positiveNumeric(body.amount, 'amount'),
      });
    },

    async settleAddCredits(identity, activityId, body = {}, action) {
      const settled = await practiceRepository.settleAddCredits({
        identity,
        activityId,
        action,
        cancellationReason: body.cancellationReason,
      });
      const completion = await hubService.completeActivityAttempt(
        identity,
        settled.context.activityAttemptId,
        {
          state: {
            focusedPractice: true,
            game: settled.context.game,
            operation: 'ADD CREDITS',
            operationId: settled.context.operationId,
            action,
            gameActionExecuted: settled.operation?.gameActionExecuted ?? settled.operation?.status === 'APPROVED',
            verified: true,
          },
          idempotencyKey: requiredKey(body.idempotencyKey),
        }
      );
      return { ...settled, completion };
    },

    async approveAddCredits(identity, activityId, body = {}) {
      return this.settleAddCredits(identity, activityId, body, 'APPROVED');
    },

    async cancelAddCredits(identity, activityId, body = {}) {
      return this.settleAddCredits(identity, activityId, body, 'CANCELLED');
    },

    async startWithdrawCredits(identity, activityId, body = {}) {
      return practiceRepository.startWithdrawCredits({ identity, activityId, idempotencyKey: requiredKey(body.idempotencyKey) });
    },

    async readWithdrawCredits(identity, activityId) {
      return practiceRepository.readWithdrawCredits({ identity, activityId });
    },

    async redeemWithdrawCredits(identity, activityId, body = {}) {
      return practiceRepository.redeemWithdrawCredits({
        identity,
        activityId,
        accountId: typeof body.accountId === 'string' ? body.accountId.trim() : '',
        amount: positiveNumeric(body.amount, 'amount'),
      });
    },

    async settleWithdrawCredits(identity, activityId, body = {}, action) {
      const settled = await practiceRepository.settleWithdrawCredits({
        identity,
        activityId,
        action,
        cancellationReason: body.cancellationReason,
      });
      const completion = await hubService.completeActivityAttempt(identity, settled.context.activityAttemptId, {
        state: {
          focusedPractice: true,
          game: settled.context.game,
          operation: 'WITHDRAW CREDITS',
          operationId: settled.context.operationId,
          action,
          gameActionExecuted: settled.operation?.gameActionExecuted ?? settled.operation?.status === 'APPROVED',
          verified: true,
        },
        idempotencyKey: requiredKey(body.idempotencyKey),
      });
      return { ...settled, completion };
    },

    async approveWithdrawCredits(identity, activityId, body = {}) {
      return this.settleWithdrawCredits(identity, activityId, body, 'APPROVED');
    },

    async cancelWithdrawCredits(identity, activityId, body = {}) {
      return this.settleWithdrawCredits(identity, activityId, body, 'CANCELLED');
    },
  });
}
