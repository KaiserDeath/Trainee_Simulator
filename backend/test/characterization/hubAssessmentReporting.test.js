import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAssessmentAttempts} from '../../src/hub/hubAssessmentService.js';
import {assessmentReportCsv} from '../../src/hub/hubAssessmentCsv.js';
import http from 'node:http';
import express from 'express';
import {createHubRouter} from '../../src/routes/hubRoutes.js';

test('first-pass and attempts-to-pass statistics group each learner/evaluation separately',()=>{
  const row=(evaluationId,attempt_number,status,score)=>({identity_id:'same-learner',evaluationId,attempt_number,status,score,started_at:'2026-11-03T12:00:00Z',completed_at:'2026-11-03T12:01:00Z'});
  const stats=summarizeAssessmentAttempts([row('checkpoint-1',1,'passed',100),row('checkpoint-2',1,'unsuccessful',50),row('checkpoint-2',2,'passed',100)],0);
  assert.equal(stats.uniquePostulantes,1);assert.equal(stats.firstAttemptPassRate,50);assert.equal(stats.averageAttemptsToPass,1.5);assert.equal(stats.completedAttempts,3);
});
test('missing legacy scores remain unknown while a recorded zero is included',()=>{
  const stats=summarizeAssessmentAttempts([{identity_id:'one',attempt_number:1,status:'abandoned',score:null,completed_at:'2026-11-03T12:01:00Z',started_at:'2026-11-03T12:00:00Z'},{identity_id:'two',attempt_number:1,status:'timed_out',score:0,completed_at:'2026-11-03T12:00:00Z',started_at:'2026-11-03T11:00:00Z'}],0);
  assert.equal(stats.averageScore,0);assert.equal(stats.latestScore,null);assert.equal(stats.bestScore,0);
});
test('CSV export quotes cells, neutralizes spreadsheet formulas and omits unselected private evidence',()=>{
  const csv=assessmentReportCsv({attempts:[{postulante:{display_name:' =HYPERLINK("bad")',username:'@unsafe'},source:'governed_evaluation',evaluationTitle:'Checkpoint, "one"',attempt_number:1,status:'passed',officialSubmitted:false,score:100,settings_snapshot:{revision:2,password:'NEVER_EXPORT'},operationResults:[{operation_type:'ADD CREDITS',game:'Orion Stars',is_correct:true,failure_points:['NEVER_EXPORT']}]}]});
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =HYPERLINK(""bad"")"'));assert.ok(csv.includes('"\'@unsafe"'));assert.ok(csv.includes('"Checkpoint, ""one"""'));assert.ok(csv.includes('"Not submitted"'));assert.equal(csv.includes('NEVER_EXPORT'),false);
});

test('CSV route is staff-only and sends attachment/no-store headers',async()=>{
  const app=express();app.use(createHubRouter({identityVerifier:{async verify(req){return {subjectId:'verified',roles:[req.get('x-test-role')]};}},repository:{},csrfProtection:{middleware(_req,_res,next){next();}},assessmentService:{async report(){return {attempts:[]};}}}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const role of ['POSTULANTE','ADMIN'])assert.equal((await fetch(base+'/assessment/report.csv',{headers:{'x-test-role':role}})).status,403);
    for(const role of ['TRAINER','RRHH']){const response=await fetch(base+'/assessment/report.csv',{headers:{'x-test-role':role}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/csv/);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/attachment/);}
  }finally{await new Promise(resolve=>server.close(resolve));}
});
