import assert from 'node:assert/strict';
import test from 'node:test';
import {createReadiness} from '../../src/readiness.js';
import {createLoginLimiter} from '../../src/httpSecurity.js';
import {authenticateHub} from '../../src/hub/hubAuthorization.js';
import {createHubAccountService} from '../../src/auth/hubAccountService.js';
import {createHubDirectory} from '../../src/hub/hubDirectory.js';
const response=()=>({statusCode:200,set(){return this;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
test('readiness fails for database failure and stale worker, caches only the database probe',async()=>{
 let time=100000,calls=0,healthy=true;
 const chain={select(){return this;},limit(){return this;},async abortSignal(){calls++;return {error:healthy?null:{}};}};
 const check=createReadiness({client:{from:()=>chain},required:true,now:()=>time,worker:()=>({status:()=>({lastSuccessAt:100000,stopped:false})})});
 let res=response();await check({},res);assert.equal(res.statusCode,200);
 res=response();await check({},res);assert.equal(calls,1);
 time+=100000;res=response();await check({},res);assert.equal(res.statusCode,503);
 healthy=false;time+=6000;res=response();await check({},res);assert.equal(res.body.database,'unavailable');
});
test('login admission control limits requests and recovers after its window',()=>{
 let now=0,passed=0;const limiter=createLoginLimiter({now:()=>now,limit:2});
 const req={ip:'127.0.0.1'};limiter(req,response(),()=>passed++);limiter(req,response(),()=>passed++);
 const res=response();limiter(req,res,()=>passed++);assert.equal(res.statusCode,429);assert.equal(passed,2);
 now=60001;limiter(req,response(),()=>passed++);assert.equal(passed,3);
});
test('temporary credentials cannot access training or simulator routes, but can change password',async()=>{
 const middleware=authenticateHub({verify:async()=>({subjectId:'verified',roles:['POSTULANTE'],mustChangePassword:true})});
 for(const [baseUrl,path,allowed] of [['/api/hub','/context',true],['/api/hub','/auth/password',true],['/api/hub','/learning-path',false],['/api/sessions','/start',false]]){
  let passed=false;const res=response();await middleware({baseUrl,path},res,()=>passed=true);assert.equal(passed,allowed);if(!allowed)assert.equal(res.body.error.code,'HUB_PASSWORD_CHANGE_REQUIRED');
 }
});
test('learner password changes verify current credentials and reject weak or reused passwords',async()=>{
 let update;
 const service=createHubAccountService({authClientFactory:()=>({auth:{signInWithPassword:async({password})=>password==='temporary-secret'?{data:{user:{id:'actor'}}}:{error:{}}}}),serviceClient:{auth:{admin:{updateUserById:async(id,value)=>{update={id,...value};return {};}}}}});
 const identity={username:'Learner',roles:['POSTULANTE']};
 await assert.rejects(()=>service.changeOwnPassword(identity,{currentPassword:'wrong',newPassword:'a-strong-new-password'}));
 for(const password of ['short','temporary-secret'])await assert.rejects(()=>service.changeOwnPassword(identity,{currentPassword:'temporary-secret',newPassword:password}));
 await service.changeOwnPassword(identity,{currentPassword:'temporary-secret',newPassword:'a-strong-new-password'});assert.equal(update.id,'actor');assert.equal(update.app_metadata.must_change_password,false);
});
test('directory rejects invalid cursors before database access and passes only verified subject',async()=>{
 let args;const directory=createHubDirectory({rpc:async(name,parameters)=>{args=parameters;return {data:{rows:[],total:0,nextCursor:null}};}});
 await assert.rejects(()=>directory({subjectId:'actor'},'progress',{cursor:'bad'}));assert.equal(args,undefined);
 await directory({subjectId:'actor'},'progress',{search:'somebody',subjectId:'forged'});assert.equal(args.p_external_subject,'actor');assert.equal(args.p_limit,50);
});
