import assert from 'node:assert/strict';
import test from 'node:test';

import { HubError } from '../../src/hub/HubError.js';
import { createHubFocusedPracticeService } from '../../src/hub/hubFocusedPracticeService.js';

const identity = { subjectId: 'postulante-focused', displayName: 'Focused Postulante' };

function createService(overrides = {}) {
  const calls = [];
  const practiceRepository = {
    async start() {
      return { created: true, game: 'Orion Stars', surface: 'balance', timedSimulator: false };
    },
    async read() {
      return { game: 'Orion Stars', surface: 'balance', timedSimulator: false };
    },
    async submitRefresh() {
      return {
        context: { activityAttemptId: 'activity-attempt-focused', game: 'Orion Stars' },
        account: { id: 'account-focused' },
        observedCredit: 100,
        observedAvailableBalance: 20000,
        verified: true,
      };
    },
    async startAddCredits() {
      return { created: true, game: 'Orion Stars', surface: 'add_credits', timedSimulator: false };
    },
    async readAddCredits() {
      return { game: 'Orion Stars', surface: 'add_credits', timedSimulator: false };
    },
    async rechargeAddCredits() {
      return { game: 'Orion Stars', surface: 'add_credits', operation: { gameActionExecuted: true } };
    },
    async settleAddCredits() {
      return {
        context: { activityAttemptId: 'activity-attempt-add', operationId: 'operation-add', game: 'Orion Stars' },
        operation: { status: 'APPROVED' },
      };
    },
    ...overrides.practiceRepository,
  };
  const hubService = {
    async completeActivityAttempt(...args) {
      calls.push(args);
      return { activityStatus: 'completed' };
    },
  };
  return {
    service: createHubFocusedPracticeService({ practiceRepository, hubService }),
    calls,
  };
}

test('focused practice starts without opening a timed simulator', async () => {
  const { service } = createService();
  const result = await service.start(identity, 'activity-focused', { idempotencyKey: 'start-key' });
  assert.equal(result.game, 'Orion Stars');
  assert.equal(result.timedSimulator, false);
});

test('focused refresh submits only verified observation state to the Hub attempt', async () => {
  const { service, calls } = createService();
  const result = await service.submitRefresh(identity, 'activity-focused', {
    accountId: 'account-focused',
    observedCredit: '100',
    observedAvailableBalance: '20000',
    idempotencyKey: 'complete-key',
  });
  assert.equal(result.verified, true);
  assert.equal(calls[0][1], 'activity-attempt-focused');
  assert.deepEqual(calls[0][2].state, {
    focusedPractice: true,
    game: 'Orion Stars',
    operation: 'REFRESH BALANCE',
    accountId: 'account-focused',
    observedCredit: 100,
    observedAvailableBalance: 20000,
    verified: true,
  });
  assert.equal(calls[0][2].idempotencyKey, 'complete-key');
});

test('focused practice requires idempotency keys', async () => {
  const { service } = createService();
  await assert.rejects(
    service.start(identity, 'activity-focused', {}),
    (error) => error instanceof HubError && error.code === 'HUB_VALIDATION_ERROR',
  );
});

test('focused Add Credits settles only through an explicit action and records safe Hub state', async () => {
  const { service, calls } = createService();
  const result = await service.approveAddCredits(identity, 'activity-add', { idempotencyKey: 'add-approve' });
  assert.equal(result.completion.activityStatus, 'completed');
  assert.deepEqual(calls[0][2].state, {
    focusedPractice: true,
    game: 'Orion Stars',
    operation: 'ADD CREDITS',
    operationId: 'operation-add',
    action: 'APPROVED',
    gameActionExecuted: true,
    verified: true,
  });
});

test('focused Add Credits validates the exact game amount before recharge', async () => {
  const { service } = createService();
  await assert.rejects(
    service.rechargeAddCredits(identity, 'activity-add', { accountId: 'account-add', amount: '', }),
    (error) => error instanceof HubError && error.code === 'HUB_VALIDATION_ERROR',
  );
});
