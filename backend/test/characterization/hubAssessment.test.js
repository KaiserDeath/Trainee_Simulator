import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';

import { createHubRouter } from '../../src/routes/hubRoutes.js';
import {createHubAssessmentService} from '../../src/hub/hubAssessmentService.js';

const csrf = { middleware(_req, _res, next) { next(); } };
const unused = new Proxy({}, { get() { return async () => { throw new Error('unused'); }; } });

async function requestAs(role, path, options = {}, assessmentService = unused, accountService = unused, administrationService = unused) {
  const app = express();
  app.use(express.json());
  app.use('/api/hub', createHubRouter({
    identityVerifier: { async verify() { return { subjectId: `${role.toLowerCase()}-subject`, roles: [role] }; } },
    repository: {}, csrfProtection: csrf, accountService, administrationService,
    auditorService: unused, assessmentService,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hub${path}`, {
      ...options,
      headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('only TRAINER publishes new assessment policy versions',async()=>{
  let received;
  const service={async publishEvaluationPolicy(identity,id,body){received={identity,id,body};return {evaluation:{revision:4}};}};
  const path='/assessment/evaluations/10000000-0000-4000-8000-000000000401/publish-version';
  for(const role of ['POSTULANTE','ADMIN','RRHH'])assert.equal((await requestAs(role,path,{method:'POST',body:JSON.stringify({expectedRevision:3})},service)).status,403);
  const result=await requestAs('TRAINER',path,{method:'POST',body:JSON.stringify({expectedRevision:3})},service);
  assert.equal(result.status,201);assert.equal(received.identity.subjectId,'trainer-subject');assert.equal(received.body.expectedRevision,3);
});

test('question answer keys are staff-only and only TRAINER can publish',async()=>{
  const service={async listTheoryQuestions(){return {questions:[{correct_option:'private-key'}]};},async publishTheoryQuestion(){return {question:{version:2}};}};
  for(const role of ['POSTULANTE','ADMIN'])assert.equal((await requestAs(role,'/assessment/questions',{},service)).status,403);
  for(const role of ['POSTULANTE','ADMIN','RRHH'])assert.equal((await requestAs(role,'/assessment/questions',{method:'POST',body:'{}'},service)).status,403);
  assert.equal((await requestAs('RRHH','/assessment/questions',{},service)).body.questions[0].correct_option,'private-key');
  assert.equal((await requestAs('TRAINER','/assessment/questions',{method:'POST',body:'{}'},service)).status,201);
});

test('formal failure evidence remains restricted to TRAINER and RRHH',async()=>{
  const service={async getFormalEvidence(){return {stages:[{is_correct:false,evidence:{reason:'private assessment finding'}}]};}};
  const path='/assessment/attempts/10000000-0000-4000-8000-000000000499/evidence';
  for(const role of ['POSTULANTE','ADMIN'])assert.equal((await requestAs(role,path,{},service)).status,403);
  for(const role of ['TRAINER','RRHH'])assert.equal((await requestAs(role,path,{},service)).body.stages[0].evidence.reason,'private assessment finding');
});

test('formal retention preview is private and mutations remain TRAINER-only',async()=>{
  const service={async formalRetentionPreview(){return {eligible:false};},async formalRetentionCommand(){return {state:'pending'};}};
  const path='/assessment/attempts/10000000-0000-4000-8000-000000000499/retention';
  for(const role of ['POSTULANTE','ADMIN'])assert.equal((await requestAs(role,path,{},service)).status,403);
  assert.equal((await requestAs('RRHH',path,{},service)).status,200);
  for(const role of ['POSTULANTE','ADMIN','RRHH'])assert.equal((await requestAs(role,path,{method:'POST',body:'{}'},service)).status,403);
  assert.equal((await requestAs('TRAINER',path,{method:'POST',body:'{}'},service)).status,200);
  const missing=createHubAssessmentService({client:{async rpc(){return {error:{message:'HUB_OBJECT_NOT_FOUND'}};}}});
  await assert.rejects(()=>missing.formalRetentionPreview({subjectId:'trainer'},'10000000-0000-4000-8000-000000000499'),error=>error.statusCode===404);
});

test('TRAINER manages assessment settings while TRAINER and RRHH read filtered statistics', async () => {
  const calls = [];
  const service = {
    async getSettings() { return { duration_minutes: 30, minimum_operations: 2, maximum_operations: 6 }; },
    async updateSettings(identity, body) { calls.push(['update', identity.roles[0], body]); return body; },
    async report(query) { calls.push(['report', query]); return { attempts: [], statistics: { passRate: 0 } }; },
  };
  for (const role of ['TRAINER', 'RRHH']) {
    assert.equal((await requestAs(role, '/assessment/settings', {}, service)).status, 200);
    assert.equal((await requestAs(role, '/assessment/report?status=timed_out&category=movement', {}, service)).status, 200);
  }
  const updated = await requestAs('TRAINER', '/assessment/settings', { method: 'PUT', body: JSON.stringify({ durationMinutes: 30, minimumOperations: 2, maximumOperations: 6, operationTypes: ['ADD CREDITS'] }) }, service);
  assert.equal(updated.status, 200);
  const rrhhUpdate = await requestAs('RRHH', '/assessment/settings', { method: 'PUT', body: JSON.stringify({ durationMinutes: 30, minimumOperations: 2, maximumOperations: 6, operationTypes: ['ADD CREDITS'] }) }, service);
  assert.equal(rrhhUpdate.status, 403);
  assert.equal(calls.filter(([type]) => type === 'update').length, 1);
  assert.equal(calls.filter(([type]) => type === 'report').length, 2);
});

test('scored evaluation routes keep POSTULANTE results private and reopening TRAINER-only', async () => {
  const calls = [];
  const service = {
    async listEvaluationPolicies(identity, options) { calls.push(['list', identity.roles[0], options]); return { evaluations: [] }; },
    async updateEvaluationPolicy(identity, evaluationId, body) { calls.push(['policy', identity.roles[0], evaluationId, body]); return { id: evaluationId }; },
    async reopenEvaluation(identity, evaluationId, postulanteId, body) { calls.push(['reopen', identity.roles[0], evaluationId, postulanteId, body]); return { attemptsAvailable: 3 }; },
    async getMyEvaluations(identity) { calls.push(['mine', identity.roles[0]]); return { evaluations: [] }; },
    async startEvaluationAttempt(identity, evaluationId) { calls.push(['start', identity.roles[0], evaluationId]); return { attemptInSet: 1, attemptsRemaining: 2 }; },
    async submitEvaluationAttempt(identity, attemptId) { calls.push(['submit', identity.roles[0], attemptId]); return { submitted: true, score: 100 }; },
  };
  const evaluationId = '10000000-0000-4000-8000-000000000401';
  const postulanteId = '10000000-0000-4000-8000-000000000099';
  const attemptId = '10000000-0000-4000-8000-000000000499';

  assert.equal((await requestAs('POSTULANTE', '/scored-evaluations', {}, service)).status, 200);
  assert.equal((await requestAs('POSTULANTE', `/scored-evaluations/${evaluationId}/attempts`, { method: 'POST' }, service)).status, 201);
  assert.equal((await requestAs('POSTULANTE', `/scored-evaluations/attempts/${attemptId}/submit`, { method: 'POST' }, service)).status, 200);
  assert.equal((await requestAs('TRAINER', '/assessment/evaluations', {}, service)).status, 200);
  assert.equal((await requestAs('RRHH', '/assessment/evaluations', {}, service)).status, 200);
  assert.equal((await requestAs('TRAINER', `/assessment/evaluations/${evaluationId}`, { method: 'PUT', body: JSON.stringify({ theoryWeight: 20, practicalWeight: 80 }) }, service)).status, 200);
  assert.equal((await requestAs('RRHH', `/assessment/evaluations/${evaluationId}`, { method: 'PUT', body: '{}' }, service)).status, 403);
  assert.equal((await requestAs('TRAINER', `/assessment/evaluations/${evaluationId}/postulantes/${postulanteId}/reopen`, { method: 'POST', body: JSON.stringify({ reason: 'Additional guided practice completed.' }) }, service)).status, 201);
  assert.equal((await requestAs('RRHH', `/assessment/evaluations/${evaluationId}/postulantes/${postulanteId}/reopen`, { method: 'POST', body: JSON.stringify({ reason: 'No mutation.' }) }, service)).status, 403);
  assert.equal(calls.filter(([type]) => type === 'reopen').length, 1);
});

test('POSTULANTE and ADMIN cannot read or update assessment administration', async () => {
  for (const role of ['POSTULANTE', 'ADMIN']) {
    const response = await requestAs(role, '/assessment/settings');
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'HUB_ROLE_FORBIDDEN');
  }
});

test('TRAINER and RRHH create Postulantes while ADMIN account creation is TRAINER-only', async () => {
  const accountService = {
    async createPostulante(body) { return { identity: { username: `created-${body.firstName}` } }; },
    async createAccount(body) { return { identity: { username: `staff-${body.firstName}` } }; },
  };
  for (const role of ['TRAINER', 'RRHH']) {
    const response = await requestAs(role, '/staff/postulantes', { method: 'POST', body: JSON.stringify({ firstName: 'Ana', surname: 'Ramos' }) }, unused, accountService);
    assert.equal(response.status, 201);
  }
  const blocked = await requestAs('ADMIN', '/admin/accounts', { method: 'POST', body: JSON.stringify({ firstName: 'Ana', surname: 'Ramos', roles: ['postulante'] }) }, unused, accountService);
  assert.equal(blocked.status, 403);
  const trainer = await requestAs('ADMIN', '/admin/accounts', { method: 'POST', body: JSON.stringify({ firstName: 'Ana', surname: 'Ramos', roles: ['trainer'] }) }, unused, accountService);
  assert.equal(trainer.status, 201);
});

test('TRAINER and RRHH list courses and assign them to any Postulante', async () => {
  const calls = [];
  const administrationService = {
    async listCourses() { return [{ id: '10000000-0000-4000-8000-000000000001', title: 'Operator Foundations' }]; },
    async assignCourse(identity, postulanteId, courseId) {
      calls.push([identity.roles[0], postulanteId, courseId]);
      return { identity_id: postulanteId, course_id: courseId };
    },
  };
  for (const role of ['TRAINER', 'RRHH']) {
    const listed = await requestAs(role, '/staff/courses', {}, unused, unused, administrationService);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.courses[0].title, 'Operator Foundations');
    const assigned = await requestAs(role, '/trainer/postulantes/10000000-0000-4000-8000-000000000099/enrolments', {
      method: 'POST', body: JSON.stringify({ courseId: '10000000-0000-4000-8000-000000000001' }),
    }, unused, unused, administrationService);
    assert.equal(assigned.status, 201);
  }
  assert.equal(calls.length, 2);
});
