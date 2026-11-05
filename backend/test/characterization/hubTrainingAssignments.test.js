import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import http from 'node:http';
import {createHubTrainingAssignmentService} from '../../src/hub/hubTrainingAssignmentService.js';
import {createHubTrainingAssignmentRouter} from '../../src/routes/hubTrainingAssignmentRoutes.js';
const id='10000000-0000-4000-8000-000000000001';
const input={learnerId:id,moduleId:id,purpose:'reinforcement',reason:'Review exact verification',dueOn:null,expectedRevision:0,idempotencyKey:'assignment-create'};
test('training assignments reject malformed commands and dates before persistence',async()=>{
 const service=createHubTrainingAssignmentService({client:{rpc(){assert.fail('Invalid input reached persistence');}}});
 for(const patch of [{moduleId:'bad'},{learnerId:'bad'},{purpose:'certificate'},{reason:'x'},{dueOn:'2026-02-30'},{dueOn:'infinity'},{expectedRevision:0.5},{idempotencyKey:''}])await assert.rejects(()=>service.command({subjectId:'verified'},'assign',null,{...input,...patch}),error=>error.statusCode===400);
 assert.throws(()=>service.list({subjectId:'verified'},id,'bad'),error=>error.statusCode===400);
});
test('assignment persistence uses verified identity and canonical review acknowledgment',async()=>{
 const calls=[];const service=createHubTrainingAssignmentService({client:{async rpc(name,params){calls.push({name,params});return {data:{status:'acknowledged'}};}}});
 await service.command({subjectId:'verified'},'acknowledge',id,{expectedRevision:1,idempotencyKey:'ack',subjectId:'forged',reason:'Fake competency certification'});
 assert.equal(calls[0].params.p_external_subject,'verified');assert.equal(calls[0].params.p_reason,'Learner acknowledged review; this is not a competency result.');
 assert.equal(calls[0].params.p_verification_attempt_id,null);
});
test('assignment API keeps trainer writes, HR reads and learner acknowledgments separate',async()=>{
 const calls=[];const service={async list(){calls.push('read');return {};},async command(_identity,command){calls.push(command);return {};}};
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.hubIdentity={subjectId:'verified',roles:[req.get('x-test-role')]};next();});app.use(createHubTrainingAssignmentRouter({service}));
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
  for(const [role,method,path,status] of [['ADMIN','GET','/',403],['RRHH','GET','/',200],['RRHH','POST','/',403],['POSTULANTE','POST','/',403],['POSTULANTE','POST',`/${id}/verify`,403],['POSTULANTE','POST',`/${id}/acknowledge`,200],['TRAINER','POST','/',200],['TRAINER','POST',`/${id}/verify`,200]])assert.equal((await fetch(base+path,{method,headers:{'x-test-role':role}})).status,status);
  assert.deepEqual(calls,['read','acknowledge','assign','verify']);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
