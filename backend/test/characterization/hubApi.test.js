import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';

import { HubError } from '../../src/hub/HubError.js';
import {
  createSupabaseHubRepository
} from '../../src/hub/supabaseHubRepository.js';
import {
  createUnconfiguredHubIdentityVerifier
} from '../../src/identity/unconfiguredHubIdentityVerifier.js';
import { createHubRouter } from '../../src/routes/hubRoutes.js';

const traineeA = {
  subjectId: 'test-subject-trainee-a',
  username: 'Jperez',
  roles: ['POSTULANTE']
};
const traineeB = {
  subjectId: 'test-subject-trainee-b',
  roles: ['POSTULANTE']
};
const trainer = {
  subjectId: 'test-subject-trainer',
  roles: ['TRAINER']
};

function verifierFor(identity) {
  return Object.freeze({
    async verify() {
      return identity;
    }
  });
}

const testCsrfProtection = Object.freeze({
  middleware(_req, _res, next) { next(); }
});

const unusedAccountService = Object.freeze({
  async logout() {},
  async createAccount() { throw new Error('unused'); },
  async listAccounts() { throw new Error('unused'); },
  async changeOwnPassword() { throw new Error('unused'); },
  async resetStaffPassword() { throw new Error('unused'); },
  async deactivate() { throw new Error('unused'); }
});

const unusedAdministrationService = Object.freeze({
  async assignTrainerLearner() { throw new Error('unused'); },
  async assignCourse() { throw new Error('unused'); },
  async createContentVersion() { throw new Error('unused'); },
  async submitContentVersion() { throw new Error('unused'); },
  async reviewContentVersion() { throw new Error('unused'); }
});

function createFakeRepository() {
  const activityOwners = new Map([
    ['activity-a', traineeA.subjectId],
    ['activity-b', traineeB.subjectId]
  ]);
  const attemptOwners = new Map([
    ['attempt-a', traineeA.subjectId],
    ['attempt-b', traineeB.subjectId]
  ]);
  const idempotency = new Map();

  function assertOwner(owner, identity) {
    if (owner !== identity.subjectId) {
      throw new HubError(
        403,
        'HUB_OBJECT_FORBIDDEN',
        'The authenticated subject is not authorized for this Hub object.'
      );
    }
  }

  function idempotentResult(action, identity, key, request, factory) {
    const storageKey = `${identity.subjectId}:${action}:${key}`;
    const fingerprint = JSON.stringify(request);
    const existing = idempotency.get(storageKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new HubError(
          409,
          'HUB_IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used for a different Hub request.'
        );
      }
      return existing.result;
    }

    const result = factory();
    idempotency.set(storageKey, { fingerprint, result });
    return result;
  }

  return {
    async getLearningPath(identity) {
      return {
        enrolments: [{ id: `enrolment:${identity.subjectId}` }]
      };
    },

    async completeActivity(request) {
      assertOwner(activityOwners.get(request.activityId), request.identity);
      return idempotentResult(
        'complete-activity',
        request.identity,
        request.idempotencyKey,
        { activityId: request.activityId, state: request.state },
        () => ({
          activityId: request.activityId,
          moduleId: 'module-1',
          activityStatus: 'completed',
          moduleStatus: 'in_progress',
          completedAt: '2026-08-20T12:00:00.000Z'
        })
      );
    },

    async startActivityAttempt(request) {
      assertOwner(activityOwners.get(request.activityId), request.identity);
      return {
        created: true,
        attempt: {
          activityAttemptId: `started:${request.activityId}`,
          activityId: request.activityId,
          status: 'in_progress'
        }
      };
    },

    async getActivityAttempt({ identity, attemptId }) {
      if (attemptOwners.get(attemptId) !== identity.subjectId) return null;
      return { id: attemptId, status: 'in_progress' };
    },

    async completeActivityAttempt(request) {
      assertOwner(attemptOwners.get(request.attemptId), request.identity);
      return {
        activityAttemptId: request.attemptId,
        activityStatus: 'completed'
      };
    },

    async listTrainerLearners() {
      return [{ id: 'identity-a', displayName: 'Learner A' }];
    },

    async getTrainerLearner({ learnerIdentityId }) {
      return learnerIdentityId === 'identity-a'
        ? { id: 'identity-a', displayName: 'Learner A' }
        : null;
    },

    async getTrainerAttempt({ attemptId }) {
      return attemptId === 'attempt-a'
        ? { id: attemptId, status: 'in_progress' }
        : null;
    }
  };
}

async function withHubServer({ identityVerifier, repository }, callback) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/hub',
    createHubRouter({
      identityVerifier,
      repository,
      csrfProtection: testCsrfProtection,
      accountService: unusedAccountService,
      administrationService: unusedAdministrationService
    })
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}/api/hub`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

test('Hub fails closed when no identity provider is configured', async () => {
  await withHubServer(
    {
      identityVerifier: createUnconfiguredHubIdentityVerifier(),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      const result = await readJson(await fetch(`${baseUrl}/context`));
      assert.equal(result.status, 503);
      assert.equal(
        result.body.error.code,
        'HUB_IDENTITY_PROVIDER_UNAVAILABLE'
      );
    }
  );
});

test('context exposes only identity data returned by the server verifier', async () => {
  await withHubServer(
    {
      identityVerifier: verifierFor(traineeA),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      const context = await readJson(
        await fetch(`${baseUrl}/context`)
      );
      assert.deepEqual(context.body, {
        subject: {
          id: traineeA.subjectId,
          displayName: null,
          username: 'Jperez',
          preferredLocale: 'en',
          roles: ['POSTULANTE']
        }
      });
    }
  );
});

test('trainer is rejected from trainee learning and attempt routes', async () => {
  await withHubServer(
    {
      identityVerifier: verifierFor(trainer),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      for (const path of [
        '/learning-path',
        '/attempts/attempt-a'
      ]) {
        const result = await readJson(await fetch(`${baseUrl}${path}`));
        assert.equal(result.status, 403);
        assert.equal(result.body.error.code, 'HUB_ROLE_FORBIDDEN');
      }
    }
  );
});

test('Postulante is rejected from trainer reads even with a browser role claim', async () => {
  await withHubServer(
    {
      identityVerifier: verifierFor(traineeA),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      const result = await readJson(
        await fetch(`${baseUrl}/trainer/postulantes`, {
          headers: { 'x-browser-role': 'TRAINER' }
        })
      );
      assert.equal(result.status, 403);
      assert.equal(result.body.error.code, 'HUB_ROLE_FORBIDDEN');
    }
  );
});

test('one Postulante cannot read or complete another Postulante direct object', async () => {
  const repository = createFakeRepository();
  await withHubServer(
    {
      identityVerifier: verifierFor(traineeA),
      repository
    },
    async (baseUrl) => {
      const readResult = await readJson(
        await fetch(`${baseUrl}/attempts/attempt-b`)
      );
      assert.equal(readResult.status, 404);
      assert.equal(readResult.body.error.code, 'HUB_ATTEMPT_NOT_FOUND');

      const writeResult = await readJson(
        await fetch(`${baseUrl}/activities/activity-b/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            state: {},
            idempotencyKey: 'cross-subject-write'
          })
        })
      );
      assert.equal(writeResult.status, 403);
      assert.equal(writeResult.body.error.code, 'HUB_OBJECT_FORBIDDEN');
    }
  );
});

test('trainer direct-object reads do not reveal an unauthorized Postulante', async () => {
  await withHubServer(
    {
      identityVerifier: verifierFor(trainer),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      const result = await readJson(
        await fetch(`${baseUrl}/trainer/postulantes/identity-b`)
      );
      assert.equal(result.status, 404);
      assert.equal(result.body.error.code, 'HUB_POSTULANTE_NOT_FOUND');
    }
  );
});

test('activity completion replays exactly and rejects key reuse with new state', async () => {
  const repository = createFakeRepository();
  await withHubServer(
    {
      identityVerifier: verifierFor(traineeA),
      repository
    },
    async (baseUrl) => {
      const submit = (state) =>
        fetch(`${baseUrl}/activities/activity-a/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            state,
            idempotencyKey: 'same-request'
          })
        });

      const first = await readJson(await submit({ page: 2 }));
      const replay = await readJson(await submit({ page: 2 }));
      assert.equal(first.status, 200);
      assert.deepEqual(replay, first);

      const conflict = await readJson(await submit({ page: 3 }));
      assert.equal(conflict.status, 409);
      assert.equal(
        conflict.body.error.code,
        'HUB_IDEMPOTENCY_CONFLICT'
      );
    }
  );
});

test('activity completion requires an explicit idempotency key', async () => {
  await withHubServer(
    {
      identityVerifier: verifierFor(traineeA),
      repository: createFakeRepository()
    },
    async (baseUrl) => {
      const result = await readJson(
        await fetch(`${baseUrl}/activities/activity-a/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state: {} })
        })
      );
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'HUB_VALIDATION_ERROR');
    }
  );
});

test('Supabase RPC policy errors are translated without leaking database details', async () => {
  const cases = [
    ['HUB_INVALID_INPUT', 400, 'HUB_VALIDATION_ERROR'],
    ['HUB_ACCESS_DENIED', 403, 'HUB_OBJECT_FORBIDDEN'],
    ['HUB_IDEMPOTENCY_CONFLICT', 409, 'HUB_IDEMPOTENCY_CONFLICT'],
    ['HUB_PREREQUISITE_INCOMPLETE', 409, 'HUB_PREREQUISITE_NOT_MET'],
    ['HUB_RETRY_POLICY_REQUIRED', 409, 'HUB_RETRY_POLICY_REQUIRED'],
    ['HUB_ACTIVITY_BLOCKED', 409, 'HUB_ACTIVITY_BLOCKED']
  ];

  for (const [databaseToken, statusCode, publicCode] of cases) {
    const repository = createSupabaseHubRepository({
      client: {
        from() {},
        async rpc() {
          return {
            data: null,
            error: {
              message: `${databaseToken}: internal database context`
            }
          };
        }
      }
    });

    await assert.rejects(
      repository.completeActivity({
        identity: traineeA,
        activityId: 'activity-a',
        state: {},
        idempotencyKey: 'policy-error'
      }),
      (error) => {
        assert.equal(error.statusCode, statusCode);
        assert.equal(error.code, publicCode);
        assert.doesNotMatch(error.message, /database context/i);
        return true;
      }
    );
  }
});
