import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubEvaluationRuntimeService} from '../../src/hub/hubEvaluationRuntimeService.js';

const attemptId='10000000-0000-4000-8000-000000000001';
const identity={subjectId:'verified-subject'};
test('assessment adapter sends verified identity and strips caller verdicts',async()=>{
  let received;
  const service=createHubEvaluationRuntimeService({client:{async rpc(name,args){received={name,args};return {data:{status:'in_progress'}};}}});
  await service.command(identity,attemptId,'action',{idempotencyKey:'retry-1',actionCode:'ADD_CREDITS',amount:50,identifier:'OS_player123',isCorrect:true,score:100,subjectId:'another-person'});
  assert.equal(received.name,'hub_evaluation_runtime_command');
  assert.equal(received.args.p_external_subject,identity.subjectId);
  assert.deepEqual(received.args.p_input,{actionCode:'ADD_CREDITS',identifier:'OS_player123',amount:50});
});
test('assessment rejects malformed evidence before persistence',async()=>{
  const service=createHubEvaluationRuntimeService({client:{rpc(){assert.fail('Invalid evidence reached persistence');}}});
  for(const body of [{idempotencyKey:'x',historyIds:['not-a-uuid']},{idempotencyKey:'x',amount:Infinity},{idempotencyKey:'x',password:{literal:'secret'}},{actionCode:'SEARCH_USER'}]){
    await assert.rejects(()=>service.command(identity,attemptId,'action',body),error=>error.statusCode===400);
  }
  await assert.rejects(()=>service.command(identity,attemptId,'theory',{idempotencyKey:'x',answers:{question:true}}),error=>error.statusCode===400);
});
test('assessment persistence failures cannot leak SQL details or submitted credentials',async()=>{
  const service=createHubEvaluationRuntimeService({client:{async rpc(){return {error:{message:'SQL password literal sensitive-secret'}};}}});
  await assert.rejects(()=>service.command(identity,attemptId,'start',{idempotencyKey:'x'}),error=>error.statusCode===503&&!error.message.includes('sensitive-secret'));
});

test('practice commands require the current run and stage and keep their separate persistence boundary',async()=>{
  let received;const service=createHubEvaluationRuntimeService({client:{async rpc(name,args){received={name,args};return {data:{status:'in_progress'}};}}});
  await assert.rejects(()=>service.command(identity,attemptId,'action',{idempotencyKey:'practice-1',stage:1},true),error=>error.statusCode===400);
  await service.command(identity,attemptId,'action',{idempotencyKey:'practice-1',runId:attemptId,worldId:attemptId,stage:2,actionCode:'BACKEND_ADD_CREDITS',decision:'APPROVED',score:100},true);
  assert.equal(received.name,'hub_mixed_command');assert.equal(received.args.p_activity_id,attemptId);assert.equal(received.args.p_input.stage,2);assert.equal(received.args.p_input.runId,attemptId);assert.equal(received.args.p_input.score,undefined);
});
