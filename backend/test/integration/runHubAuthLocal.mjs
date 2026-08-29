import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

import { assertLocalE2EBackendEnvironment } from '../../src/config/localE2EGuard.js';
import { createApp } from '../../src/app.js';
import { supabase } from '../../src/config/supabase.js';

assertLocalE2EBackendEnvironment();

const legacySessionPrefix = '__TREZ_HUB_AUDITOR_E2E__';
const runId = randomUUID().slice(0, 8);
const usernamePrefix = `E${runId}`;
const accountInputs = {
  adminA: { firstName: 'E2e', surname: `${runId}Admina`, roles: ['admin'], preferredLocale: 'es' },
  adminB: { firstName: 'E2e', surname: `${runId}Adminb`, roles: ['admin'], preferredLocale: 'es' },
  trainer: { firstName: 'E2e', surname: `${runId}Trainer`, roles: ['trainer'], preferredLocale: 'en' },
  postulante: { firstName: 'E2e', surname: `${runId}Postulante`, roles: ['postulante'], preferredLocale: 'en' },
  rrhh: { firstName: 'E2e', surname: `${runId}Rrhh`, roles: ['rrhh'], preferredLocale: 'es' },
};
const baseUrl = 'http://localhost:8080/api/hub';
const clientOrigin = 'http://localhost:5173';

function expectData(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

class CookieJar {
  constructor() { this.cookies = new Map(); this.lastSetCookies = []; }
  absorb(response) {
    const values = response.headers.getSetCookie?.() || [];
    this.lastSetCookies = values;
    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '); }
}

async function request(path, { jar, csrf, method = 'GET', body, headers = {}, redirect = 'follow' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      ...(jar?.header() ? { cookie: jar.header() } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { origin: clientOrigin, 'x-trez-csrf': csrf } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  jar?.absorb(response);
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function issueCsrf(jar) {
  const result = await request('/auth/csrf', { jar });
  assert.equal(result.status, 200);
  return result.body.csrfToken;
}

async function cleanupDatabase() {
  const fixtureIdentity = `i.username LIKE '${usernamePrefix}%'`;
  const fixtureIdentities = `SELECT i.id FROM public.hub_identities i WHERE ${fixtureIdentity}`;
  const fixtureEnrolments = `SELECT e.id FROM public.hub_enrolments e WHERE e.identity_id IN (${fixtureIdentities})`;
  const fixtureProgress = `SELECT p.id FROM public.hub_module_progress p WHERE p.enrolment_id IN (${fixtureEnrolments})`;
  const fixtureAttempts = `SELECT a.id FROM public.hub_attempts a WHERE a.module_progress_id IN (${fixtureProgress})`;
  const fixtureVersions = `SELECT v.id FROM public.hub_content_versions v WHERE v.author_identity_id IN (${fixtureIdentities}) OR v.reviewed_by_identity_id IN (${fixtureIdentities})`;
  const sql = `BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM public.hub_content_review_events WHERE content_version_id IN (${fixtureVersions}) OR actor_identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_content_versions WHERE id IN (${fixtureVersions});
DELETE FROM public.hub_evidence_events WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_attempt_artifacts WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_activity_attempts WHERE attempt_id IN (${fixtureAttempts});
DELETE FROM public.hub_attempts WHERE id IN (${fixtureAttempts});
DELETE FROM public.hub_module_progress WHERE id IN (${fixtureProgress});
DELETE FROM public.hub_enrolments WHERE id IN (${fixtureEnrolments});
DELETE FROM public.hub_trainer_learner_assignments WHERE trainer_identity_id IN (${fixtureIdentities}) OR learner_identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_idempotency_keys WHERE identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_role_assignments WHERE identity_id IN (${fixtureIdentities});
DELETE FROM public.hub_identities i WHERE ${fixtureIdentity};
DELETE FROM public.trainee_sessions
  WHERE trainee_name LIKE '${legacySessionPrefix}%'
     OR trainee_name = '${accountInputs.postulante.firstName} ${accountInputs.postulante.surname}';
COMMIT;`;
  const result = spawnSync('docker', [
    'exec', '-i', 'supabase_db_simulador-dos-local',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { encoding: 'utf8', shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

async function cleanupAuthUsers() {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  for (const user of listed.data.users.filter((candidate) => candidate.email?.startsWith(usernamePrefix.toLowerCase()))) {
    const deleted = await supabase.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
}

async function createBootstrapAdmin() {
  const username = `${usernamePrefix}${accountInputs.adminA.surname.slice(runId.length).toLowerCase()}`;
  const internalEmail = `${username.toLowerCase()}@auth.trez.invalid`;
  const created = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: username,
    email_confirm: true,
    user_metadata: { username, display_name: 'E2e Admin A' },
  });
  if (created.error) throw created.error;
  const role = expectData(await supabase.from('hub_roles').select('id').eq('code', 'admin').single(), 'read admin role');
  const identity = expectData(await supabase.from('hub_identities').insert({
    auth_user_id: created.data.user.id,
    external_subject_reference: created.data.user.id,
    email: internalEmail,
    first_name: accountInputs.adminA.firstName,
    surname: accountInputs.adminA.surname,
    username,
    display_name: 'E2e Admin A',
    preferred_locale: 'es',
  }).select('id').single(), 'create bootstrap administrator');
  expectData(await supabase.from('hub_role_assignments').insert({ identity_id: identity.id, role_id: role.id }), 'assign bootstrap administrator role');
  return { username, identityId: identity.id };
}

async function createDirectLocalStaff(input, suffix) {
  const username = `${usernamePrefix}${suffix}`;
  const internalEmail = `${username.toLowerCase()}@auth.trez.invalid`;
  const created = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: username,
    email_confirm: true,
    user_metadata: { username, display_name: `${input.firstName} ${input.surname}` },
  });
  if (created.error) throw created.error;
  const roleCode = input.roles[0];
  const role = expectData(await supabase.from('hub_roles').select('id').eq('code', roleCode).single(), `read ${roleCode} role`);
  const identity = expectData(await supabase.from('hub_identities').insert({
    auth_user_id: created.data.user.id,
    external_subject_reference: created.data.user.id,
    email: internalEmail,
    first_name: input.firstName,
    surname: input.surname,
    username,
    display_name: `${input.firstName} ${input.surname}`,
    preferred_locale: input.preferredLocale,
  }).select('id, username, display_name').single(), `create local ${roleCode} fixture`);
  expectData(await supabase.from('hub_role_assignments').insert({ identity_id: identity.id, role_id: role.id }), `assign local ${roleCode} fixture`);
  return { identity: { ...identity, displayName: identity.display_name }, session: await passwordLogin(username) };
}

async function verifyGovernanceConcurrency() {
  const roleRows = expectData(
    await supabase.from('hub_roles').select('id, code').in('code', ['admin', 'rrhh', 'postulante']),
    'read governance concurrency roles'
  );
  const roleId = new Map(roleRows.map((role) => [role.code, role.id]));
  const created = [];

  try {
    for (const suffix of ['role-race', 'locale-race', 'postulante-role-race']) {
      created.push(expectData(
        await supabase.from('hub_identities').insert({
          external_subject_reference: `governance-race-${runId}-${suffix}`,
          email: `race-${runId}-${suffix}@auth.trez.invalid`,
          display_name: `Governance ${suffix}`,
          preferred_locale: 'en',
        }).select('id').single(),
        `create ${suffix} identity`
      ));
    }

    const roleRace = await Promise.all([
      supabase.from('hub_role_assignments').insert({
        identity_id: created[0].id,
        role_id: roleId.get('rrhh'),
      }),
      supabase.from('hub_role_assignments').insert({
        identity_id: created[0].id,
        role_id: roleId.get('admin'),
      }),
    ]);
    assert.equal(roleRace.filter((result) => !result.error).length, 1);
    assert.equal(roleRace.filter((result) => result.error).length, 1);

    const postulanteRoleRace = await Promise.all([
      supabase.from('hub_role_assignments').insert({
        identity_id: created[2].id,
        role_id: roleId.get('postulante'),
      }),
      supabase.from('hub_role_assignments').insert({
        identity_id: created[2].id,
        role_id: roleId.get('admin'),
      }),
    ]);
    assert.equal(postulanteRoleRace.filter((result) => !result.error).length, 1);
    assert.equal(postulanteRoleRace.filter((result) => result.error).length, 1);

    const localeRace = await Promise.all([
      supabase.from('hub_identities')
        .update({ preferred_locale: 'es' })
        .eq('id', created[1].id),
      supabase.from('hub_role_assignments').insert({
        identity_id: created[1].id,
        role_id: roleId.get('postulante'),
      }),
    ]);
    assert.equal(localeRace.filter((result) => !result.error).length, 1);
    assert.equal(localeRace.filter((result) => result.error).length, 1);

    const localeIdentity = expectData(
      await supabase.from('hub_identities').select('preferred_locale').eq('id', created[1].id).single(),
      'read locale race identity'
    );
    const traineeAssignment = expectData(
      await supabase.from('hub_role_assignments')
        .select('identity_id, hub_roles!inner(code)')
        .eq('identity_id', created[1].id)
        .eq('hub_roles.code', 'postulante'),
      'read locale race role'
    );
    assert.equal(localeIdentity.preferred_locale === 'es' && traineeAssignment.length > 0, false);
  } finally {
    const ids = created.map((identity) => identity.id);
    if (ids.length) {
      expectData(await supabase.from('hub_role_assignments').delete().in('identity_id', ids), 'clean governance concurrency roles');
      expectData(await supabase.from('hub_identities').delete().in('id', ids), 'clean governance concurrency identities');
    }
  }
}

async function createLegacyAuditorFixtures({ attemptId, sharedName }) {
  const now = new Date().toISOString();
  const linkedSession = expectData(
    await supabase.from('trainee_sessions').insert({
      trainee_name: `${legacySessionPrefix} Linked ${runId}`,
      status: 'completed',
      started_at: now,
      ended_at: now,
    }).select('id').single(),
    'create linked legacy session'
  );
  const unlinkedSession = expectData(
    await supabase.from('trainee_sessions').insert({
      trainee_name: sharedName,
      status: 'completed',
      started_at: now,
      ended_at: now,
    }).select('id').single(),
    'create same-name unlinked legacy session'
  );
  const customer = expectData(
    await supabase.from('sandbox_customers').insert({
      session_id: linkedSession.id,
      username: 'audit-fixture-customer',
      first_name: 'Audit',
      last_name: 'Fixture',
      email: 'audit-fixture@example.test',
      balance: 500,
    }).select('id').single(),
    'create auditor customer fixture'
  );
  const account = expectData(
    await supabase.from('sandbox_game_accounts').insert({
      session_id: linkedSession.id,
      customer_id: customer.id,
      game: 'Orion Stars',
      game_username: 'audit-fixture-player',
      password: 'stored-report-secret',
      balance: 100,
    }).select('id').single(),
    'create auditor account fixture'
  );
  const operation = expectData(
    await supabase.from('sandbox_operations').insert({
      session_id: linkedSession.id,
      customer_id: customer.id,
      game_account_id: account.id,
      game: 'Orion Stars',
      type: 'RESET PASSWORD',
      status: 'APPROVED',
      processed_at: now,
      processed_by: 'Audit Fixture',
      is_correct: false,
      request_data: {
        gameId: 'wrong-player',
        kiosk: 'orionstars',
        newPassword: 'submitted-report-secret',
      },
    }).select('id').single(),
    'create auditor operation fixture'
  );
  expectData(
    await supabase.from('trainee_action_logs').insert({
      session_id: linkedSession.id,
      trainee_name: `${legacySessionPrefix} Linked ${runId}`,
      operation_id: operation.id,
      action_type: 'VALIDATION_FAILED',
      details: {
        safe: 'retained-action-detail',
        credentials: 'audit-log-secret',
        nested: { refresh_token: 'audit-log-token' },
      },
    }),
    'create auditor action fixture'
  );
  expectData(
    await supabase.from('hub_attempts')
      .update({ legacy_trainee_session_id: linkedSession.id })
      .eq('id', attemptId),
    'link Hub attempt to legacy session'
  );
  expectData(
    await supabase.from('hub_attempt_artifacts').insert({
      attempt_id: attemptId,
      artifact_type: 'AUDITOR_SECURITY_FIXTURE',
      payload: {
        safe: 'retained-artifact-detail',
        token: 'artifact-token-secret',
      },
    }),
    'create auditor artifact fixture'
  );
  return {
    linkedSessionId: linkedSession.id,
    unlinkedSessionId: unlinkedSession.id,
  };
}

async function passwordLogin(username, password = username) {
  const preAuthJar = new CookieJar();
  const csrf = await issueCsrf(preAuthJar);
  const requested = await request('/auth/login', {
    jar: preAuthJar,
    csrf,
    method: 'POST',
    body: { username, password },
  });
  assert.equal(requested.status, 200, JSON.stringify(requested.body));
  assert.ok(preAuthJar.lastSetCookies.some((cookie) => cookie.startsWith('trez_hub_access=') && /HttpOnly/i.test(cookie)));
  assert.ok(preAuthJar.lastSetCookies.some((cookie) => cookie.startsWith('trez_hub_refresh=') && /HttpOnly/i.test(cookie)));
  assert.ok(!preAuthJar.lastSetCookies.some((cookie) => /Service.Role|service_role/i.test(cookie)));
  return { jar: preAuthJar, csrf: requested.body.csrfToken };
}

async function createAccount(adminSession, payload) {
  const created = await request('/admin/accounts', {
    jar: adminSession.jar,
    csrf: adminSession.csrf,
    method: 'POST',
    body: payload,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return {
    identity: created.body.identity,
    session: await passwordLogin(created.body.identity.username),
  };
}

async function createPostulante(staffSession, payload) {
  const created = await request('/staff/postulantes', {
    jar: staffSession.jar,
    csrf: staffSession.csrf,
    method: 'POST',
    body: { firstName: payload.firstName, surname: payload.surname },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { identity: created.body.identity, session: await passwordLogin(created.body.identity.username) };
}

let server;
try {
  await cleanupDatabase();
  await cleanupAuthUsers();
  await verifyGovernanceConcurrency();
  const bootstrap = await createBootstrapAdmin();
  server = http.createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8080, '127.0.0.1', resolve);
  });

  const adminA = await passwordLogin(bootstrap.username);
  const adminContext = await request('/context', { jar: adminA.jar });
  assert.equal(adminContext.status, 200);
  assert.deepEqual(adminContext.body.subject.roles, ['ADMIN']);
  assert.equal(adminContext.body.subject.preferredLocale, 'es');

  const adminSelfReset = await request(`/admin/identities/${bootstrap.identityId}/password-reset`, {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: {},
  });
  assert.equal(adminSelfReset.status, 400);
  assert.equal(adminSelfReset.body.error.code, 'HUB_VALIDATION_ERROR');

  const unknownJar = new CookieJar();
  const unknownCsrf = await issueCsrf(unknownJar);
  const unknown = await request('/auth/login', {
    jar: unknownJar,
    csrf: unknownCsrf,
    method: 'POST',
    body: { username: 'Unknownperson', password: 'Unknownperson' },
  });
  assert.equal(unknown.status, 401);

  const trainer = await createAccount(adminA, accountInputs.trainer);
  const trainee = await createPostulante(trainer.session, accountInputs.postulante);
  const adminB = await createDirectLocalStaff(accountInputs.adminB, 'adminb');
  const auditor = await createDirectLocalStaff(accountInputs.rrhh, 'rrhh');

  for (const invalidInvitation of [
    {
      firstName: 'Mixed', surname: `${runId}Rrhh`,
      roles: ['rrhh', 'admin'],
      preferredLocale: 'en',
    },
    {
      firstName: 'Spanish', surname: `${runId}Postulante`,
      roles: ['postulante'],
      preferredLocale: 'es',
    },
    {
      firstName: 'Mixed', surname: `${runId}PostulanteAdmin`,
      roles: ['postulante', 'admin'],
      preferredLocale: 'en',
    },
  ]) {
    const rejected = await request('/admin/accounts', {
      jar: adminA.jar,
      csrf: adminA.csrf,
      method: 'POST',
      body: invalidInvitation,
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error.code, 'HUB_ROLE_FORBIDDEN');
  }

  const bypass = await request('/admin/accounts', {
    jar: trainee.session.jar,
    csrf: trainee.session.csrf,
    method: 'POST',
    headers: { 'x-browser-role': 'ADMIN' },
    body: { firstName: 'Blocked', surname: 'Person', roles: ['admin'] },
  });
  assert.equal(bypass.status, 403);

  const trainerLearners = await request('/trainer/postulantes', { jar: trainer.session.jar });
  assert.equal(trainerLearners.status, 200);
  assert.deepEqual(trainerLearners.body.postulantes.map((postulante) => postulante.id), [trainee.identity.id]);

  const assessmentSettings = await request('/assessment/settings', { jar: trainer.session.jar });
  assert.equal(assessmentSettings.status, 200, JSON.stringify(assessmentSettings.body));
  assert.equal(assessmentSettings.body.settings.duration_minutes, 30);
  assert.equal(assessmentSettings.body.settings.minimum_operations, 2);
  assert.equal(assessmentSettings.body.settings.maximum_operations, 6);
  assert.equal(assessmentSettings.body.settings.revision, 1);
  const assessmentReport = await request('/assessment/report?settingsRevision=1', { jar: auditor.session.jar });
  assert.equal(assessmentReport.status, 200, JSON.stringify(assessmentReport.body));

  const course = expectData(await supabase.from('hub_courses').select('id').eq('stable_code', 'trez-operator-foundations').single(), 'read course');
  const enrolment = await request(`/trainer/postulantes/${trainee.identity.id}/enrolments`, {
    jar: trainer.session.jar,
    csrf: trainer.session.csrf,
    method: 'POST',
    body: { courseId: course.id },
  });
  assert.equal(enrolment.status, 201, JSON.stringify(enrolment.body));

  const path = await request('/learning-path', { jar: trainee.session.jar });
  assert.equal(path.status, 200);
  assert.equal(path.body.enrolments.length, 1);
  for (const [index, activity] of path.body.enrolments[0].modules[0].activities.entries()) {
    const completed = await request(`/activities/${activity.id}/complete`, {
      jar: trainee.session.jar,
      csrf: trainee.session.csrf,
      method: 'POST',
      body: { state: { reviewed: true }, idempotencyKey: `auth-e2e-${runId}-${index}` },
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
  }
  const progressRows = expectData(await supabase.from('hub_module_progress').select('id').eq('enrolment_id', path.body.enrolments[0].id), 'read progress');
  const attempts = expectData(await supabase.from('hub_attempts').select('id, completed_at, retention_until').in('module_progress_id', progressRows.map((row) => row.id)), 'read retention');
  const retained = attempts.find((attempt) => attempt.completed_at);
  assert.ok(retained?.retention_until);
  const retentionYears = (new Date(retained.retention_until) - new Date(retained.completed_at)) / (365.25 * 24 * 60 * 60 * 1000);
  assert.ok(retentionYears > 1.99 && retentionYears < 2.01);

  const legacyFixtures = await createLegacyAuditorFixtures({
    attemptId: retained.id,
    sharedName: trainee.identity.displayName,
  });
  const auditorOverview = await request('/rrhh/overview?limit=100', {
    jar: auditor.session.jar,
  });
  assert.equal(auditorOverview.status, 200, JSON.stringify(auditorOverview.body));
  assert.ok(auditorOverview.body.postulantes.some((row) => row.identity.id === trainee.identity.id));
  const linkedLegacy = auditorOverview.body.legacySimulatorSessions.find(
    (session) => session.id === legacyFixtures.linkedSessionId
  );
  const unlinkedLegacy = auditorOverview.body.legacySimulatorSessions.find(
    (session) => session.id === legacyFixtures.unlinkedSessionId
  );
  assert.equal(linkedLegacy.lineage.status, 'linked');
  assert.equal(unlinkedLegacy.lineage.status, 'unlinked');
  assert.equal(unlinkedLegacy.lineage.reason, 'LEGACY_NAME_ONLY_SESSION');

  const learningRecords = await request(
    `/rrhh/postulantes/${trainee.identity.id}/learning-records?limit=100`,
    { jar: auditor.session.jar }
  );
  assert.equal(learningRecords.status, 200, JSON.stringify(learningRecords.body));
  assert.ok(learningRecords.body.moduleRecords.some(
    (record) => record.module.status === 'completed'
  ));
  assert.ok(learningRecords.body.attempts.some((attempt) => attempt.id === retained.id));

  const attemptEvidence = await request(
    `/rrhh/hub-attempts/${retained.id}?limit=100`,
    { jar: auditor.session.jar }
  );
  assert.equal(attemptEvidence.status, 200, JSON.stringify(attemptEvidence.body));
  const securityArtifact = attemptEvidence.body.artifacts.find(
    (artifact) => artifact.artifactType === 'AUDITOR_SECURITY_FIXTURE'
  );
  assert.equal(securityArtifact.payload.safe, 'retained-artifact-detail');
  assert.equal(JSON.stringify(attemptEvidence.body).includes('artifact-token-secret'), false);

  const simulatorReport = await request(
    `/rrhh/simulator-sessions/${legacyFixtures.linkedSessionId}?limit=100`,
    { jar: auditor.session.jar }
  );
  assert.equal(simulatorReport.status, 200, JSON.stringify(simulatorReport.body));
  assert.equal(simulatorReport.body.operations.length, 1);
  assert.ok(simulatorReport.body.operations[0].failurePoints.length > 0);
  assert.equal(simulatorReport.body.auditLog[0].details.safe, 'retained-action-detail');
  const serializedAuditorReport = JSON.stringify(simulatorReport.body);
  for (const secret of [
    'stored-report-secret',
    'submitted-report-secret',
    'audit-log-secret',
    'audit-log-token',
  ]) {
    assert.equal(serializedAuditorReport.includes(secret), false);
  }

  const nonAuditorRead = await request('/rrhh/overview', { jar: adminA.jar });
  assert.equal(nonAuditorRead.status, 403);
  const auditorMutation = await request('/admin/accounts', {
    jar: auditor.session.jar,
    csrf: auditor.session.csrf,
    method: 'POST',
    body: {
      firstName: 'Rrhh', surname: `${runId}Bypass`,
      roles: ['postulante'],
      preferredLocale: 'en',
    },
  });
  assert.equal(auditorMutation.status, 403);
  const oversizedAuditPage = await request('/rrhh/overview?limit=101', {
    jar: auditor.session.jar,
  });
  assert.equal(oversizedAuditPage.status, 400);

  const sensitiveState = await request(
    `/activities/${path.body.enrolments[0].modules[1].activities[0].id}/complete`,
    {
      jar: trainee.session.jar,
      csrf: trainee.session.csrf,
      method: 'POST',
      body: {
        state: { nested: { newPassword: 'must-not-persist' } },
        idempotencyKey: `sensitive-evidence-${runId}`,
      },
    }
  );
  assert.equal(sensitiveState.status, 400);
  assert.equal(sensitiveState.body.error.code, 'HUB_SENSITIVE_EVIDENCE_REJECTED');

  const activityId = path.body.enrolments[0].modules[0].activities[0].id;
  const draft = await request('/admin/content-versions', {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: {
      definitionKind: 'activity',
      definitionId: activityId,
      locale: 'es',
      content: { title: 'Contenido administrativo de prueba' },
      changeRationale: 'Verify bilingual administrator workflow',
    },
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const contentVersionId = draft.body.contentVersion.id;
  const submitted = await request(`/admin/content-versions/${contentVersionId}/submit`, {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: {},
  });
  assert.equal(submitted.status, 200);
  const selfReview = await request(`/admin/content-versions/${contentVersionId}/review`, {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: { decision: 'approve', rationale: 'Must be rejected' },
  });
  assert.equal(selfReview.status, 409);
  assert.equal(selfReview.body.error.code, 'HUB_SEPARATE_APPROVER_REQUIRED');
  const approved = await request(`/admin/content-versions/${contentVersionId}/review`, {
    jar: adminB.session.jar,
    csrf: adminB.session.csrf,
    method: 'POST',
    body: { decision: 'approve', rationale: 'Independent local verification approval' },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.contentVersion.status, 'published');

  const postulantePasswordChange = await request('/auth/password', {
    jar: trainee.session.jar,
    csrf: trainee.session.csrf,
    method: 'POST',
    body: { currentPassword: trainee.identity.username, newPassword: 'NotAllowed123' },
  });
  assert.equal(postulantePasswordChange.status, 403);

  const changedTrainerPassword = `${trainer.identity.username}Changed`;
  const trainerPasswordChange = await request('/auth/password', {
    jar: trainer.session.jar,
    csrf: trainer.session.csrf,
    method: 'POST',
    body: { currentPassword: trainer.identity.username, newPassword: changedTrainerPassword },
  });
  assert.equal(trainerPasswordChange.status, 200, JSON.stringify(trainerPasswordChange.body));
  const resetTrainerPassword = await request(`/admin/identities/${trainer.identity.id}/password-reset`, {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: {},
  });
  assert.equal(resetTrainerPassword.status, 200, JSON.stringify(resetTrainerPassword.body));
  const trainerAfterReset = await passwordLogin(trainer.identity.username);
  assert.equal((await request('/context', { jar: trainerAfterReset.jar })).status, 200);

  const deactivated = await request(`/admin/identities/${trainer.identity.id}/deactivate`, {
    jar: adminA.jar,
    csrf: adminA.csrf,
    method: 'POST',
    body: {},
  });
  assert.equal(deactivated.status, 200);
  const blockedTrainer = await request('/context', { jar: trainerAfterReset.jar });
  assert.equal(blockedTrainer.status, 403);

  const logout = await request('/auth/logout', {
    jar: trainee.session.jar,
    csrf: trainee.session.csrf,
    method: 'POST',
    body: {},
  });
  assert.equal(logout.status, 204);
  const afterLogout = await request('/context', { jar: trainee.session.jar });
  assert.equal(afterLogout.status, 401);

  console.log('Local Supabase Auth verification passed: username/password login, HTTP-only JWT cookies, CSRF, generated usernames, exclusive roles, locale policy, global TRAINER/RRHH Postulante visibility, assessment defaults/reporting, staff password controls, course assignment, retention, two-person publishing, read-only RRHH evidence reporting with redaction and explicit lineage, deactivation, and logout.');
} finally {
  if (server) await new Promise((resolve) => server.close(() => resolve()));
  await cleanupDatabase();
  await cleanupAuthUsers();
  const identities = expectData(await supabase.from('hub_identities').select('id').like('username', `${usernamePrefix}%`), 'verify identity cleanup');
  assert.equal(identities.length, 0);
  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  assert.equal(users.data.users.filter((user) => user.email?.startsWith(usernamePrefix.toLowerCase())).length, 0);
  const legacySessions = expectData(
    await supabase.from('trainee_sessions').select('id').or(
      `trainee_name.like.${legacySessionPrefix}%,trainee_name.eq.${accountInputs.postulante.firstName} ${accountInputs.postulante.surname}`
    ),
    'verify auditor legacy-session cleanup'
  );
  assert.equal(legacySessions.length, 0);
}
