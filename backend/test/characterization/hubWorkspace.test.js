import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { validateInstruction } from '../../src/hub/hubWorkspaceService.js';
import { createHubWorkspaceRouter } from '../../src/routes/hubWorkspaceRoutes.js';

test('instruction editor accepts plain text and rejects execution-policy fields and malformed renderer values',()=>{
  assert.deepEqual(validateInstruction({title:' Lesson ',instruction:{summary:'text',paragraphs:['One','Two']}}),{title:'Lesson',instruction:{summary:'text',paragraphs:['One','Two']}});
  for(const instruction of [{surface:'balance'},{policyStatus:'approved'},{paragraphs:'not an array'},{items:[{id:'a',label:{html:'unsafe'}}]},{summary:{unexpected:'object'}}]){
    assert.throws(()=>validateInstruction({title:'Lesson',instruction}),error=>error.statusCode===400);
  }
});

test('workspace role matrix rejects learner/private access, RRHH writes and trainer publication',async()=>{
  const calls=[];
  const service=new Proxy({}, {get:(_,key)=>async()=>{calls.push(key);return {};}});
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.hubIdentity={subjectId:'test',roles:[req.get('x-test-role')||'POSTULANTE']};next();});
  app.use(createHubWorkspaceRouter({service}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [role,method,path,status] of [
      ['POSTULANTE','GET','/postulantes/id/notes',403],['ADMIN','GET','/postulantes/id/notes',403],
      ['RRHH','POST','/postulantes/id/notes',403],['TRAINER','POST','/activities/id/versions',403],
      ['TRAINER','GET','/catalog',200],['RRHH','GET','/postulantes/id/notes',200],
      ['TRAINER','POST','/postulantes/id/notes',200],['ADMIN','POST','/activities/id/versions',200],
    ])assert.equal((await fetch(base+path,{method,headers:{'x-test-role':role}})).status,status,`${role} ${method} ${path}`);
    assert.deepEqual(calls,['catalog','notes','saveNote','createInstruction']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
