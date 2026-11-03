import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {createHubMediaRouter} from '../../src/routes/hubMediaRoutes.js';
import {createHubMediaService} from '../../src/hub/hubMediaService.js';
import {validateInstruction} from '../../src/hub/hubWorkspaceService.js';

test('media mutations remain ADMIN-only while access still passes through entitlement checks',async()=>{
  const calls=[];const service=new Proxy({}, {get:(_,method)=>async()=>{calls.push(method);return {};}});
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.hubIdentity={subjectId:'verified',roles:[req.get('x-test-role')]};next();});app.use(createHubMediaRouter({service}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [role,method,path,status] of [['POSTULANTE','GET','/',403],['RRHH','GET','/',403],['TRAINER','POST','/uploads',403],['TRAINER','POST','/asset/approve',403],['ADMIN','POST','/uploads',200],['POSTULANTE','GET','/asset/access',200]]){
      assert.equal((await fetch(base+path,{method,headers:{'x-test-role':role}})).status,status);
    }
    assert.deepEqual(calls,['beginUpload','access']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('private media is never signed before server entitlement succeeds',async()=>{
  let signed=false;const service=createHubMediaService({client:{async rpc(){return {error:{message:'HUB_ACCESS_DENIED'}};},storage:{from(){signed=true;assert.fail('Denied access reached the signer');}}}});
  await assert.rejects(()=>service.access({subjectId:'learner'},'10000000-0000-4000-8000-000000000001'),error=>error.statusCode===403);assert.equal(signed,false);
});
test('lesson media references are bounded UUIDs and cannot become arbitrary URLs',()=>{
  const id='10000000-0000-4000-8000-000000000001';assert.deepEqual(validateInstruction({title:'Lesson',instruction:{mediaAssetIds:[id,id]}}).instruction.mediaAssetIds,[id]);
  for(const mediaAssetIds of ['https://external.example/file',['https://external.example/file'],Array.from({length:21},()=>id)])assert.throws(()=>validateInstruction({title:'Lesson',instruction:{mediaAssetIds}}),error=>error.statusCode===400);
});
