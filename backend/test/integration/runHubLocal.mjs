import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';

import { assertLocalE2EBackendEnvironment } from '../../src/config/localE2EGuard.js';
import { createApp } from '../../src/app.js';
import { createSupabaseHubRepository } from '../../src/hub/supabaseHubRepository.js';
import { supabase } from '../../src/config/supabase.js';

assertLocalE2EBackendEnvironment();

const prefix = '__TREZ_HUB_LOCAL__';
const runId = randomUUID();
const subjects = {
  traineeA: `${prefix}:trainee-a:${runId}`,
  traineeB: `${prefix}:trainee-b:${runId}`,
  trainer: `${prefix}:trainer:${runId}`,
};
const identities = new Map([
  [subjects.traineeA, { subjectId: subjects.traineeA, roles: ['POSTULANTE'] }],
  [subjects.traineeB, { subjectId: subjects.traineeB, roles: ['POSTULANTE'] }],
  [subjects.trainer, { subjectId: subjects.trainer, roles: ['TRAINER'] }],
]);

const verifier = Object.freeze({
  async verify(request) {
    return identities.get(request.get('x-local-hub-test-subject')) || null;
  },
});

function localJwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    role,
    iss: 'supabase-demo',
    aud: 'authenticated',
    sub: '30000000-0000-4000-8000-000000000001',
    iat: Math.floor(Date.now() / 1000) - 5,
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const signature = createHmac('sha256', process.env.SUPABASE_LOCAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function assertBrowserDatabaseRoleDenied(role, path, options = {}) {
  const token = role === 'anon' ? process.env.SUPABASE_ANON_KEY : localJwt(role);
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (role === 'authenticated') {
    assert.equal(response.status, 403, 'The authenticated database role must be valid but denied by ACL.');
  } else {
    assert.ok(
      response.status === 401 || response.status === 403,
      `${role} database request unexpectedly returned ${response.status}.`,
    );
  }
}

function expectNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function cleanup() {
  const fixtureIdentity = `i.external_subject_reference LIKE '${prefix}:%:${runId}'`;
  const fixtureEnrolments = `SELECT e.id FROM public.hub_enrolments e JOIN public.hub_identities i ON i.id = e.identity_id WHERE ${fixtureIdentity}`;
  const fixtureProgress = `SELECT p.id FROM public.hub_module_progress p WHERE p.enrolment_id IN (${fixtureEnrolments})`;
  const fixtureAttempts = `SELECT a.id FROM public.hub_attempts a WHERE a.module_progress_id IN (${fixtureProgress})`;
  const fixtureIdentities = `SELECT i.id FROM public.hub_identities i WHERE ${fixtureIdentity}`;
  const sql = `
BEGIN;
CREATE TEMP TABLE trez_cleanup_sessions ON COMMIT DROP AS
SELECT DISTINCT context.legacy_trainee_session_id AS id
FROM public.hub_practice_contexts context
WHERE context.identity_id IN (${fixtureIdentities})
  AND context.legacy_trainee_session_id IS NOT NULL
UNION
SELECT DISTINCT attempt.legacy_trainee_session_id AS id
FROM public.hub_attempts attempt
WHERE attempt.id IN (${fixtureAttempts})
  AND attempt.legacy_trainee_session_id IS NOT NULL;
SET LOCAL session_replication_role = replica;
DELETE FROM public.hub_practice_contexts
WHERE identity_id IN (${fixtureIdentities})
   OR attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_evidence_events WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_attempt_artifacts WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_activity_attempts WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_attempts WHERE id IN (${fixtureAttempts});
DELETE FROM public.hub_module_progress WHERE id IN (${fixtureProgress});
DELETE FROM public.hub_enrolments WHERE id IN (${fixtureEnrolments});
DELETE FROM public.hub_idempotency_keys WHERE identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_role_assignments WHERE identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_identities i WHERE ${fixtureIdentity};
SET LOCAL session_replication_role = origin;
DELETE FROM public.trainee_sessions
WHERE id IN (SELECT id FROM trez_cleanup_sessions);
COMMIT;`;
  const cleanupResult = spawnSync(
    'docker',
    [
      'exec', '-i', 'supabase_db_simulador-dos-local',
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ],
    { encoding: 'utf8', shell: false, windowsHide: true },
  );
  if (cleanupResult.error) throw cleanupResult.error;
  if (cleanupResult.status !== 0) {
    throw new Error(`Guarded Hub fixture cleanup failed: ${cleanupResult.stderr || cleanupResult.stdout}`);
  }
  const remaining = expectNoError(
    await supabase.from('hub_identities').select('id').like('external_subject_reference', `${prefix}:%:${runId}`),
    'verify Hub integration cleanup',
  ) || [];
  assert.equal(remaining.length, 0, 'Guarded cleanup must leave zero Hub verification identities.');
}

async function startServer({ visibleLearnerId }) {
  const repository = createSupabaseHubRepository({
    client: supabase,
    trainerVisibilityResolver: {
      async listVisibleLearnerIdentityIds() {
        return [visibleLearnerId];
      },
      async canViewLearner({ learnerIdentityId }) {
        return learnerIdentityId === visibleLearnerId;
      },
    },
  });
  const server = http.createServer(createApp({
    hubIdentityVerifier: verifier,
    hubRepository: repository,
    hubCsrfProtection: { middleware(_req, _res, next) { next(); } },
    hubAccountService: {
      async logout() {},
      async createAccount() { throw new Error('unused'); },
      async listAccounts() { throw new Error('unused'); },
      async changeOwnPassword() { throw new Error('unused'); },
      async resetStaffPassword() { throw new Error('unused'); },
      async deactivate() { throw new Error('unused'); },
    },
    hubAdministrationService: {
      async assignTrainerLearner() { throw new Error('unused'); },
      async assignCourse() { throw new Error('unused'); },
      async createContentVersion() { throw new Error('unused'); },
      async submitContentVersion() { throw new Error('unused'); },
      async reviewContentVersion() { throw new Error('unused'); },
    },
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/api/hub`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function request(server, subject, path, options = {}) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    ...options,
    headers: {
      'x-local-hub-test-subject': subject,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
}

async function complete(server, subject, activityId, idempotencyKey, state = {}) {
  return request(server, subject, `/activities/${activityId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ state, idempotencyKey }),
  });
}

let server;
try {
  await cleanup();

  for (const role of ['anon', 'authenticated']) {
    await assertBrowserDatabaseRoleDenied(role, 'hub_courses?select=id');
    await assertBrowserDatabaseRoleDenied(role, 'rpc/hub_complete_activity', {
      method: 'POST',
      body: JSON.stringify({
        p_external_subject: 'unprovisioned',
        p_activity_id: '10000000-0000-4000-8000-000000001101',
        p_state: {},
        p_idempotency_key: 'must-be-denied',
      }),
    });
  }

  const roleRows = expectNoError(await supabase.from('hub_roles').select('id, code'), 'read Hub roles');
  const roleByCode = new Map(roleRows.map((row) => [row.code, row.id]));
  const insertedIdentities = expectNoError(
    await supabase.from('hub_identities').insert([
      { external_subject_reference: subjects.traineeA, display_name: 'Local Trainee A' },
      { external_subject_reference: subjects.traineeB, display_name: 'Local Trainee B' },
      { external_subject_reference: subjects.trainer, display_name: 'Local Trainer' },
    ]).select('id, external_subject_reference'),
    'insert Hub verification identities',
  );
  const identityBySubject = new Map(insertedIdentities.map((row) => [row.external_subject_reference, row.id]));
  expectNoError(await supabase.from('hub_role_assignments').insert([
    { identity_id: identityBySubject.get(subjects.traineeA), role_id: roleByCode.get('postulante') },
    { identity_id: identityBySubject.get(subjects.traineeB), role_id: roleByCode.get('postulante') },
    { identity_id: identityBySubject.get(subjects.trainer), role_id: roleByCode.get('trainer') },
  ]), 'insert Hub verification role assignments');

  const course = expectNoError(
    await supabase.from('hub_courses').select('id').eq('stable_code', 'trez-operator-foundations').single(),
    'read seeded Hub course',
  );
  expectNoError(await supabase.from('hub_enrolments').insert([
    { identity_id: identityBySubject.get(subjects.traineeA), course_id: course.id },
    { identity_id: identityBySubject.get(subjects.traineeB), course_id: course.id },
  ]), 'insert Hub verification enrolments');

  server = await startServer({ visibleLearnerId: identityBySubject.get(subjects.traineeA) });
  const initial = await request(server, subjects.traineeA, '/learning-path');
  assert.equal(initial.status, 200);
  const modules = initial.body.enrolments[0].modules;
  assert.equal(modules.length, 11);
  assert.equal(modules[0].available, true);
  assert.equal(modules[1].available, false);
  assert.equal(modules[2].available, false);
  assert.equal(modules[3].available, false);
  assert.equal(modules[4].available, false);
  assert.equal(modules[5].available, false);
  assert.equal(modules[6].available, false);
  assert.equal(modules[7].available, false);
  assert.equal(modules[8].available, false);
  assert.equal(modules[9].available, false);
  assert.equal(modules[10].available, false);

  const blocked = await complete(server, subjects.traineeA, modules[1].activities[0].id, 'blocked-module-2');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error.code, 'HUB_PREREQUISITE_NOT_MET');

  let firstCompletion;
  for (const [index, activity] of modules[0].activities.entries()) {
    const result = await complete(server, subjects.traineeA, activity.id, `module-1-${index}`, { reviewed: true });
    assert.equal(result.status, 200);
    if (index === 0) firstCompletion = result;
  }
  const replay = await complete(server, subjects.traineeA, modules[0].activities[0].id, 'module-1-0', { reviewed: true });
  assert.deepEqual(replay, firstCompletion);
  const conflict = await complete(server, subjects.traineeA, modules[0].activities[0].id, 'module-1-0', { reviewed: false });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'HUB_IDEMPOTENCY_CONFLICT');

  const crossRead = await request(server, subjects.traineeB, `/attempts/${firstCompletion.body.activityAttemptId}`);
  assert.equal(crossRead.status, 404);
  const crossWrite = await request(server, subjects.traineeB, `/attempts/${firstCompletion.body.activityAttemptId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ state: {}, idempotencyKey: 'cross-subject' }),
  });
  assert.equal(crossWrite.status, 403);
  const trainerWrite = await complete(server, subjects.trainer, modules[0].activities[0].id, 'trainer-write');
  assert.equal(trainerWrite.status, 403);
  const traineeTrainerRead = await request(server, subjects.traineeA, '/trainer/postulantes');
  assert.equal(traineeTrainerRead.status, 403);

  const raceRequests = ['race-a', 'race-b'].map((idempotencyKey) =>
    request(server, subjects.traineeB, `/activities/${modules[0].activities[0].id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ state: { concurrency: true }, idempotencyKey }),
    })
  );
  const raceResults = await Promise.all(raceRequests);
  assert.deepEqual(raceResults.map((result) => result.status).sort(), [200, 201]);
  assert.equal(raceResults.filter((result) => result.body.created === true).length, 1);
  assert.equal(raceResults.filter((result) => result.body.created === false).length, 1);
  expectNoError(
    await supabase
      .from('hub_enrolments')
      .update({ status: 'withdrawn' })
      .eq('identity_id', identityBySubject.get(subjects.traineeB)),
    'withdraw second Hub verification enrolment',
  );
  const withdrawnWrite = await complete(
    server,
    subjects.traineeB,
    modules[0].activities[1].id,
    'withdrawn-subject-write',
  );
  assert.equal(withdrawnWrite.status, 403);
  assert.equal(withdrawnWrite.body.error.code, 'HUB_OBJECT_FORBIDDEN');

  const afterModule1 = await request(server, subjects.traineeA, '/learning-path');
  assert.equal(afterModule1.body.enrolments[0].modules[0].status, 'completed');
  assert.equal(afterModule1.body.enrolments[0].modules[1].available, true);
  assert.equal(afterModule1.body.enrolments[0].modules[2].available, false);
  assert.equal(afterModule1.body.enrolments[0].modules[3].available, false);
  assert.equal(afterModule1.body.enrolments[0].modules[4].available, false);

  await server.close();
  server = await startServer({ visibleLearnerId: identityBySubject.get(subjects.traineeA) });
  const secondDevice = await request(server, subjects.traineeA, '/learning-path');
  assert.equal(secondDevice.body.enrolments[0].modules[0].status, 'completed');
  assert.equal(secondDevice.body.enrolments[0].modules[1].available, true);

  for (const [index, activity] of secondDevice.body.enrolments[0].modules[1].activities.entries()) {
    const result = await complete(server, subjects.traineeA, activity.id, `module-2-${index}`, { reviewed: true });
    assert.equal(result.status, 200);
  }
  const afterModule2 = await request(server, subjects.traineeA, '/learning-path');
  assert.equal(afterModule2.body.enrolments[0].status, 'in_progress');
  assert.equal(afterModule2.body.enrolments[0].modules[1].status, 'completed');
  assert.equal(afterModule2.body.enrolments[0].modules[2].available, true);
  assert.equal(afterModule2.body.enrolments[0].modules[3].available, false);
  assert.equal(afterModule2.body.enrolments[0].modules[4].available, false);

  const policyBlocked = await complete(
    server,
    subjects.traineeA,
    afterModule2.body.enrolments[0].modules[2].activities[1].id,
    'module-3-policy-blocked',
    { answer: 'browser-state-cannot-approve-policy' },
  );
  assert.equal(policyBlocked.status, 409, JSON.stringify(policyBlocked.body));
  assert.equal(policyBlocked.body.error.code, 'HUB_ACTIVITY_BLOCKED');

  const artifactBlocked = await complete(
    server,
    subjects.traineeA,
    afterModule2.body.enrolments[0].modules[2].activities[2].id,
    'module-3-artifact-blocked',
    { sourceArtifactId: 'browser-state-cannot-publish-artifact' },
  );
  assert.equal(artifactBlocked.status, 409, JSON.stringify(artifactBlocked.body));
  assert.equal(artifactBlocked.body.error.code, 'HUB_ACTIVITY_BLOCKED');

  const prerequisiteBlocked = await complete(
    server,
    subjects.traineeA,
    afterModule2.body.enrolments[0].modules[3].activities[0].id,
    'module-4-prerequisite-blocked',
  );
  assert.equal(prerequisiteBlocked.status, 409, JSON.stringify(prerequisiteBlocked.body));
  assert.equal(prerequisiteBlocked.body.error.code, 'HUB_PREREQUISITE_NOT_MET');

  // The remaining policy-gated modules are intentionally not completed through
  // the generic activity endpoint. For the local focused-practice check, mark
  // their module progress as an approved fixture prerequisite only.
  const focusedEnrolment = (await supabase.from('hub_enrolments').select('id, course_id').eq('identity_id', identityBySubject.get(subjects.traineeA)).single()).data;
  expectNoError(await supabase.from('hub_module_progress').upsert([3, 4, 5, 6].map((position) => ({ enrolment_id: focusedEnrolment.id, course_id: focusedEnrolment.course_id, module_id: `10000000-0000-4000-8000-00000000010${position}`, status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })), { onConflict: 'enrolment_id,module_id' }), 'prepare focused Withdraw Credits prerequisites');
  const focusedPath = await request(server, subjects.traineeA, '/learning-path');
  const withdrawActivity = focusedPath.body.enrolments[0].modules[6].activities[2];
  const withdrawStart = await request(server, subjects.traineeA, `/activities/${withdrawActivity.id}/focused-practice/withdraw-credits/start`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'withdraw-start' }) });
  assert.equal(withdrawStart.status, 201, JSON.stringify(withdrawStart.body));
  const withdrawOperation = withdrawStart.body.operation;
  const withdrawRedeem = await request(server, subjects.traineeA, `/activities/${withdrawActivity.id}/focused-practice/withdraw-credits/redeem`, { method: 'POST', body: JSON.stringify({ accountId: withdrawStart.body.account.id, amount: withdrawOperation.amount }) });
  assert.equal(withdrawRedeem.status, 200);
  assert.equal(withdrawRedeem.body.operation.gameCredit, withdrawOperation.gameCredit - withdrawOperation.amount);
  assert.equal(withdrawRedeem.body.operation.gameWalletBalance, withdrawOperation.gameWalletBalance + withdrawOperation.amount);
  const withdrawApprove = await request(server, subjects.traineeA, `/activities/${withdrawActivity.id}/focused-practice/withdraw-credits/approve`, { method: 'POST', body: JSON.stringify({ action: 'APPROVED', idempotencyKey: 'withdraw-complete' }) });
  assert.equal(withdrawApprove.status, 200, JSON.stringify(withdrawApprove.body));
  assert.equal(withdrawApprove.body.operation.status, 'APPROVED');

  const report = await request(server, subjects.trainer, '/trainer/postulantes');
  assert.equal(report.status, 200);
  assert.equal(report.body.postulantes.length, 1);
  assert.equal(report.body.postulantes[0].id, identityBySubject.get(subjects.traineeA));
  assert.equal(report.body.postulantes[0].enrolments[0].status, 'in_progress');
  const hiddenLearner = await request(server, subjects.trainer, `/trainer/postulantes/${identityBySubject.get(subjects.traineeB)}`);
  assert.equal(hiddenLearner.status, 404);

  console.log('Local Hub integration passed: assignment, prerequisites, policy/artifact fail-closed behavior, idempotency, RBAC, direct-object isolation, persistence, and reporting.');
} finally {
  if (server) await server.close().catch(() => {});
  await cleanup();
}
