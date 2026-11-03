import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {createHubCohortRouter} from '../../src/routes/hubCohortRoutes.js';
import {createHubCohortService} from '../../src/hub/hubCohortService.js';

const id='10000000-0000-4000-8000-000000000001';
const body={title:'November group',courseId:id,dueOn:'2026-11-30',learnerIds:[id],expectedRevision:0,idempotencyKey:'create-group'};
test('cohort route preserves existing TRAINER/RRHH assignment permissions and learner read access',async()=>{
  const calls=[];
  const service={list:async()=>{calls.push('list');return {};},save:async()=>{calls.push('save');return {};}};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.hubIdentity={subjectId:'verified',roles:[req.get('x-test-role')]};next();});app.use(createHubCohortRouter({service}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const [role,method,path,status] of [['ADMIN','POST','/',403],['POSTULANTE','POST','/',403],['POSTULANTE','POST',`/${id}`,403],['POSTULANTE','GET','/',200],['TRAINER','POST','/',200],['RRHH','POST',`/${id}`,200]]){
      assert.equal((await fetch(base+path,{method,headers:{'x-test-role':role}})).status,status);
    }
    assert.deepEqual(calls,['list','save','save']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('cohort input rejects impossible calendar dates, invalid cursors and oversized batches before persistence',async()=>{
  const service=createHubCohortService({client:{rpc(){assert.fail('Invalid input reached persistence');}}});
  for(const change of [{dueOn:'2026-02-30'},{dueOn:'2026-11-03T00:00:00Z'},{dueOn:'infinity'},{learnerIds:Array(101).fill(id)},{learnerIds:['foreign']},{expectedRevision:1.2},{idempotencyKey:''}]){
    await assert.rejects(()=>service.save({subjectId:'trainer'},null,{...body,...change}),error=>error.statusCode===400);
  }
  assert.throws(()=>service.list({subjectId:'trainer'},'bad-cursor'),error=>error.statusCode===400);
});
test('cohort saves send verified subject and retain server revision conflicts',async()=>{
  let params;const service=createHubCohortService({client:{async rpc(name,input){assert.equal(name,'hub_save_cohort');params=input;return {error:{message:'HUB_REVISION_CONFLICT'}};}}});
  await assert.rejects(()=>service.save({subjectId:'verified-trainer'},id,{...body,subjectId:'forged',expectedRevision:2}),error=>error.statusCode===409);
  assert.equal(params.p_external_subject,'verified-trainer');assert.equal(params.p_expected_revision,2);
});
