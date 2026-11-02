import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {createSimulatorAccess} from '../../src/auth/simulatorAccess.js';

const own='10000000-0000-4000-8000-000000000001';
const foreign='10000000-0000-4000-8000-000000000002';
test('simulator cutover enforces authentication, CSRF, explicit ownership and staff role boundaries',async()=>{
  const client={from(table){const filters=[];return {select(){return this;},eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){if(table==='hub_simulator_sessions')return {data:filters.some(([key,value])=>key==='session_id'&&value===own)?{session_id:own}:null};return {data:{session_id:foreign}};}};}};
  const identityVerifier={async verify(req){const role=req.get('x-test-role');return role?{subjectId:'server-subject',displayName:'Server identity',roles:[role]}:null;}};
  const csrfProtection={middleware(req,res,next){if(req.method==='POST'&&req.get('x-test-csrf')!=='valid')return res.status(403).json({error:'csrf'});next();}};
  const app=express();app.use(express.json());
  for(const area of ['sessions','operations','games','trainer'])app.use(`/api/${area}`,...createSimulatorAccess({identityVerifier,csrfProtection,client}), (req,res)=>res.json({actor:req.body?.traineeName||null}));
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [role,method,path,csrf,status] of [
      [null,'GET',`/api/sessions/${own}`,null,401],['POSTULANTE','GET',`/api/sessions/${own}`,null,200],
      ['POSTULANTE','GET',`/api/sessions/${foreign}`,null,404],['POSTULANTE','POST',`/api/sessions/${own}/stop`,null,403],
      ['POSTULANTE','POST',`/api/sessions/${own}/stop`,'valid',200],['POSTULANTE','POST',`/api/operations/${own}/process`,'valid',404],
      ['POSTULANTE','GET','/api/trainer/sessions',null,403],['TRAINER','GET','/api/trainer/sessions',null,200],
      ['TRAINER','POST',`/api/games/accounts/${own}/recharge`,'valid',403],['RRHH','GET','/api/trainer/sessions',null,403],
    ]){
      const response=await fetch(base+path,{method,headers:{...(role?{'x-test-role':role}:{}),...(csrf?{'x-test-csrf':csrf}:{}),'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({traineeName:'forged-author'})}:{})});
      assert.equal(response.status,status,`${role} ${method} ${path}`);
      if(method==='POST'&&status===200)assert.equal((await response.json()).actor,'Server identity');
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
