import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';

import {
  sanitizeAuditorJson
} from '../../src/domain/auditorEvidence.js';
import {
  createHubAuditorService
} from '../../src/hub/hubAuditorService.js';
import {
  createSupabaseHubAuditorRepository
} from '../../src/hub/supabaseHubAuditorRepository.js';
import { createHubRouter } from '../../src/routes/hubRoutes.js';

const uuid = Object.freeze({
  traineeA: '10000000-0000-4000-8000-000000000001',
  traineeB: '10000000-0000-4000-8000-000000000002',
  sessionA: '20000000-0000-4000-8000-000000000001',
  sessionB: '20000000-0000-4000-8000-000000000002',
  attempt: '30000000-0000-4000-8000-000000000001',
  activityAttempt: '40000000-0000-4000-8000-000000000001',
  evidence: '50000000-0000-4000-8000-000000000001',
  artifact: '60000000-0000-4000-8000-000000000001',
  operationA: '70000000-0000-4000-8000-000000000001',
  operationB: '70000000-0000-4000-8000-000000000002',
  logA: '80000000-0000-4000-8000-000000000001',
  logB: '80000000-0000-4000-8000-000000000002'
});

const noOpCsrf = Object.freeze({
  middleware(_req, _res, next) { next(); }
});
const unused = Object.freeze({
  async logout() { throw new Error('unused'); },
  async createAccount() { throw new Error('unused'); },
  async listAccounts() { throw new Error('unused'); },
  async changeOwnPassword() { throw new Error('unused'); },
  async resetStaffPassword() { throw new Error('unused'); },
  async deactivate() { throw new Error('unused'); },
  async assignTrainerLearner() { throw new Error('unused'); },
  async assignCourse() { throw new Error('unused'); },
  async createContentVersion() { throw new Error('unused'); },
  async submitContentVersion() { throw new Error('unused'); },
  async reviewContentVersion() { throw new Error('unused'); }
});

function verifierFor(role) {
  return {
    async verify() {
      return { subjectId: `${role.toLowerCase()}-subject`, roles: [role] };
    }
  };
}

async function withServer(role, auditorService, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/hub', createHubRouter({
    identityVerifier: verifierFor(role),
    repository: {},
    csrfProtection: noOpCsrf,
    accountService: unused,
    administrationService: unused,
    auditorService
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}/api/hub`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

test('RRHH GET routes reject postulante, trainer, and admin roles', async () => {
  const auditorService = {
    async getOverview() { return { postulantes: [] }; }
  };
  for (const role of ['POSTULANTE', 'TRAINER', 'ADMIN']) {
    await withServer(role, auditorService, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/rrhh/overview`);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'HUB_ROLE_FORBIDDEN');
    });
  }
});

test('RRHH can read reporting routes but cannot mutate learning progress or ADMIN accounts', async () => {
  const calls = [];
  const auditorService = {
    async getOverview(query) {
      calls.push(['overview', query]);
      return { generatedAt: 'now', postulantes: [], legacySimulatorSessions: [] };
    },
    async getTraineeLearningRecords(identityId) {
      calls.push(['learning', identityId]);
      return { postulante: { id: identityId }, moduleRecords: [], attempts: [] };
    },
    async getHubAttempt(attemptId) {
      calls.push(['attempt', attemptId]);
      return { attempt: { id: attemptId } };
    },
    async getSimulatorSession(sessionId) {
      calls.push(['session', sessionId]);
      return { session: { id: sessionId } };
    }
  };
  await withServer('RRHH', auditorService, async (baseUrl) => {
    for (const path of [
      '/rrhh/overview?limit=5',
      `/rrhh/postulantes/${uuid.traineeA}/learning-records`,
      `/rrhh/hub-attempts/${uuid.attempt}`,
      `/rrhh/simulator-sessions/${uuid.sessionA}`
    ]) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 200);
    }
    assert.equal(calls.length, 4);

    for (const request of [
      ['/activities/activity-id/complete', { state: {}, idempotencyKey: 'x' }],
      ['/admin/accounts', { firstName: 'Blocked', surname: 'Person', roles: ['admin'] }]
    ]) {
      const response = await fetch(`${baseUrl}${request[0]}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request[1])
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'HUB_ROLE_FORBIDDEN');
    }
    assert.equal(calls.length, 4);
  });
});

test('overview is read-only, paginated, includes deactivated trainees, and never links names', async () => {
  const writes = [];
  const tables = {
    hub_role_assignments: [
      {
        identity_id: uuid.traineeA,
        hub_roles: { code: 'postulante' },
        hub_identities: {
          id: uuid.traineeA,
          display_name: 'Same Name',
          status: 'active'
        }
      },
      {
        identity_id: uuid.traineeB,
        hub_roles: { code: 'postulante' },
        hub_identities: {
          id: uuid.traineeB,
          display_name: 'Retained Learner',
          status: 'deactivated'
        }
      }
    ],
    trainee_sessions: [
      {
        id: uuid.sessionA,
        trainee_name: 'Same Name',
        status: 'completed',
        started_at: '2026-01-01T00:00:00Z',
        ended_at: '2026-01-01T01:00:00Z'
      },
      {
        id: uuid.sessionB,
        trainee_name: 'Other',
        status: 'completed',
        started_at: '2026-01-02T00:00:00Z',
        ended_at: '2026-01-02T01:00:00Z'
      }
    ],
    hub_attempts: []
  };
  const client = {
    from(table) {
      const filters = [];
      let rowLimit = Infinity;
      const query = {
        select() { return query; },
        eq(field, value) { filters.push(['eq', field, value]); return query; },
        gt(field, value) { filters.push(['gt', field, value]); return query; },
        in(field, values) { filters.push(['in', field, values]); return query; },
        order() { return query; },
        limit(value) { rowLimit = value; return query; },
        insert() { writes.push('insert'); throw new Error('write'); },
        update() { writes.push('update'); throw new Error('write'); },
        delete() { writes.push('delete'); throw new Error('write'); },
        upsert() { writes.push('upsert'); throw new Error('write'); },
        then(resolve, reject) {
          let rows = [...(tables[table] || [])];
          for (const [operator, field, value] of filters) {
            if (field.includes('.')) continue;
            if (operator === 'eq') rows = rows.filter((row) => row[field] === value);
            if (operator === 'gt') rows = rows.filter((row) => row[field] > value);
            if (operator === 'in') rows = rows.filter((row) => value.includes(row[field]));
          }
          const orderField = table === 'hub_role_assignments' ? 'identity_id' : 'id';
          rows.sort((a, b) => String(a[orderField]).localeCompare(String(b[orderField])));
          return Promise.resolve({ data: rows.slice(0, rowLimit), error: null })
            .then(resolve, reject);
        }
      };
      return query;
    }
  };
  const repository = createSupabaseHubAuditorRepository({ client });
  const first = await repository.getOverview({
    limit: 1,
    postulanteCursor: null,
    sessionCursor: null
  });
  assert.equal(first.postulantes.length, 1);
  assert.equal(first.pageInfo.postulantes.nextCursor, uuid.traineeA);
  assert.equal(first.legacySimulatorSessions[0].lineage.status, 'unlinked');
  assert.equal(
    first.legacySimulatorSessions[0].lineage.reason,
    'LEGACY_NAME_ONLY_SESSION'
  );
  assert.equal(
    first.legacySimulatorSessions[0].lineage.linkedAttemptCount,
    0
  );
  assert.equal(
    first.legacySimulatorSessions[0].lineage.linkedIdentityCount,
    0
  );

  const second = await repository.getOverview({
    limit: 1,
    postulanteCursor: first.pageInfo.postulantes.nextCursor,
    sessionCursor: first.pageInfo.legacySimulatorSessions.nextCursor
  });
  assert.equal(second.postulantes[0].identity.status, 'deactivated');
  assert.equal(writes.length, 0);
});

test('auditor service recursively redacts legacy and Hub evidence and pages detail arrays', async () => {
  const repository = {
    async getHubAttempt() {
      return {
        attempt: { id: uuid.attempt },
        activityAttempts: [{
          id: uuid.activityAttempt,
          activity_id: uuid.activityAttempt,
          status: 'completed',
          state: {
            nested: { newPassword: 'state-password', accessToken: 'state-token' }
          }
        }],
        evidenceEvents: [{
          id: uuid.evidence,
          activity_attempt_id: uuid.activityAttempt,
          sequence_number: 1,
          event_type: 'FAILED',
          payload: { secret: 'event-secret', password: 'event-password', reason: 'wrong step' }
        }],
        artifacts: [{
          id: uuid.artifact,
          artifact_type: 'RESULT',
          payload: { authorization: 'Bearer hidden', safe: 'retained' }
        }],
        pageInfo: {}
      };
    },
    async getLegacySession() {
      return {
        id: uuid.sessionA,
        lineage: {
          status: 'unlinked',
          reason: 'LEGACY_NAME_ONLY_SESSION',
          linkedAttemptCount: 0,
          linkedIdentityCount: 0
        }
      };
    },
    async getOverview() { return {}; },
    async getTraineeLearningRecords() { return null; }
  };
  const reportOperations = [uuid.operationA, uuid.operationB].map((id) => ({
    id,
    type: 'RESET PASSWORD',
    status: 'APPROVED',
    request_data: { newPassword: 'operation-password', token: 'operation-token' },
    validationRequirements: [{
      label: 'Password',
      expected: 'literal-expected-password',
      sent: 'literal-sent-password',
      ok: false
    }]
  }));
  const actionRows = [uuid.logA, uuid.logB].map((id) => ({
    id,
    action_type: 'VALIDATION_FAILED',
    details: '{"safe":"kept","newPassword":"log-password","credentials":"log-credentials","nested":{"refresh_token":"log-token","cookie":"log-cookie","bearer":"log-bearer"},"__proto__":{"polluted":true}}'
  }));
  const service = createHubAuditorService({
    repository,
    sessionReportReader: async () => ({
      performance: { total: 2, token: 'performance-token' },
      operationBreakdown: { failures: 2 },
      operations: reportOperations
    }),
    actionLogReader: async () => actionRows
  });

  const attempt = await service.getHubAttempt(uuid.attempt, {});
  const session = await service.getSimulatorSession(uuid.sessionA, {
    limit: '1'
  });
  const serialized = JSON.stringify({ attempt, session });
  for (const secret of [
    'state-password', 'state-token', 'event-secret', 'event-password',
    'Bearer hidden', 'operation-password', 'operation-token',
    'literal-expected-password', 'literal-sent-password',
    'log-password', 'log-credentials', 'log-token', 'log-cookie',
    'log-bearer', 'performance-token'
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret, 'i'));
  }
  assert.equal(attempt.activityAttempts[0].state.nested.passwordProvided, true);
  assert.equal(attempt.evidenceEvents[0].payload.passwordProvided, true);
  assert.equal(attempt.artifacts[0].payload.safe, 'retained');
  assert.equal(session.operations.length, 1);
  assert.equal(session.operations[0].failurePoints[0].sent, 'Provided');
  assert.equal(session.auditLog[0].details.safe, 'kept');
  assert.equal(session.auditLog[0].details.polluted, undefined);
  assert.equal(session.pageInfo.operations.nextCursor, uuid.operationA);
  assert.equal(session.pageInfo.auditLog.nextCursor, uuid.logA);
});

test('auditor pagination fails closed for oversized limits and invalid cursors', async () => {
  let repositoryCalls = 0;
  const service = createHubAuditorService({
    repository: {
      async getOverview() { repositoryCalls += 1; return {}; }
    },
    sessionReportReader: async () => ({}),
    actionLogReader: async () => []
  });
  for (const query of [
    { limit: '101' },
    { limit: '0' },
    { limit: '1.5' },
    { postulanteCursor: 'not-a-uuid' },
    { sessionCursor: ['unexpected-array'] }
  ]) {
    await assert.rejects(
      service.getOverview(query),
      (error) => error.statusCode === 400 && error.code === 'HUB_VALIDATION_ERROR'
    );
  }
  assert.equal(repositoryCalls, 0);
});

test('recursive sanitizer ignores dangerous object keys', () => {
  const value = JSON.parse(
    '{"safe":true,"constructor":{"x":1},"prototype":{"x":1},"__proto__":{"polluted":true}}'
  );
  assert.deepEqual(sanitizeAuditorJson(value), { safe: true });
  assert.equal({}.polluted, undefined);
});
