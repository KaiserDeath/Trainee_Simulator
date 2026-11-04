import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFileSync,unlinkSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {assertLocalE2EBackendEnvironment} from '../../src/config/localE2EGuard.js';
import {localCapacityClientCount,settleCapacityClients} from './localCapacityOptions.mjs';

assertLocalE2EBackendEnvironment();
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const runId=randomUUID();const author=randomUUID();const course=randomUUID();const module=randomUUID();const version=randomUUID();
const evaluation='10000000-0000-4000-8000-000000000404';
const clients=localCapacityClientCount();
const learners=Array.from({length:clients},(_,index)=>({id:randomUUID(),subject:`__TREZ_FINAL_CAPACITY__:${runId}:${index}`}));
const durations=[];let previousHead=null;let setupDone=false;let summary;
const recoveryPath=fileURLToPath(new URL(`../../../outputs/final-capacity-${runId}.json`,import.meta.url));
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const ids=values=>values.length?values.map(value=>{assert.match(value,/^[0-9a-f-]{36}$/i);return `'${value}'::uuid`;}).join(','):'NULL::uuid';
const identities=ids([author,...learners.map(row=>row.id)]);
function localSql(sql){
  const result=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(`Named local fixture transaction failed: ${result.stderr}`);
}
async function command(learner,attempt,operation,input,key){
  const started=performance.now();
  const value=checked(await client.rpc('hub_evaluation_runtime_command',{p_external_subject:learner.subject,p_attempt_id:attempt,p_command:operation,p_input:input,p_idempotency_key:key}),operation);
  durations.push(performance.now()-started);return value;
}
try{
  previousHead=checked(await client.from('hub_evaluation_policy_heads').select('version_id').eq('evaluation_id',evaluation).maybeSingle(),'prior policy head')?.version_id??null;
  if(previousHead)ids([previousHead]);
  mkdirSync(new URL('../../../outputs/',import.meta.url),{recursive:true});
  writeFileSync(recoveryPath,JSON.stringify({runId,author,course,module,version,evaluation,previousHead,learners},null,2));
  const rows=learners.map(row=>`('${row.id}'::uuid,'${row.subject}')`).join(',');
  localSql(`BEGIN;
INSERT INTO hub_identities(id,external_subject_reference) VALUES('${author}','__TREZ_FINAL_CAPACITY__:${runId}:author'),${rows};
INSERT INTO hub_role_assignments(identity_id,role_id) SELECT '${author}'::uuid,id FROM hub_roles WHERE code='trainer';
INSERT INTO hub_role_assignments(identity_id,role_id) SELECT i.id,r.id FROM hub_identities i CROSS JOIN hub_roles r WHERE i.id IN (${ids(learners.map(row=>row.id))}) AND r.code='postulante';
INSERT INTO hub_courses(id,stable_code,title) VALUES('${course}','capacity-${runId}','Isolated final capacity fixture');
INSERT INTO hub_modules(id,course_id,stable_code,position,title) VALUES('${module}','${course}','capacity',1,'Capacity prerequisite');
INSERT INTO hub_enrolments(identity_id,course_id) SELECT id,'${course}'::uuid FROM hub_identities WHERE id IN (${ids(learners.map(row=>row.id))});
INSERT INTO hub_module_progress(enrolment_id,course_id,module_id,status,started_at,completed_at) SELECT id,'${course}'::uuid,'${module}'::uuid,'completed',now(),now() FROM hub_enrolments WHERE course_id='${course}';
INSERT INTO hub_evaluation_policy_versions(id,evaluation_id,version,payload,author_id,rationale)
 SELECT '${version}','${evaluation}',greatest(e.revision,coalesce((SELECT max(version) FROM hub_evaluation_policy_versions WHERE evaluation_id=e.id),0))+1,
 to_jsonb(e)||jsonb_build_object('publication_status','published','is_provisional',FALSE,'prerequisite_module_ids',jsonb_build_array('${module}'),'prerequisite_evaluation_ids','[]'::jsonb,'theory_item_codes',jsonb_build_array('verification-first')),'${author}','Local capacity fixture; synthetic prerequisites; not learner certification'
 FROM hub_effective_evaluation('${evaluation}') e;
INSERT INTO hub_evaluation_policy_heads(evaluation_id,version_id) VALUES('${evaluation}','${version}') ON CONFLICT(evaluation_id) DO UPDATE SET version_id=EXCLUDED.version_id;
COMMIT;`);
  setupDone=true;
  const theory=checked(await client.from('hub_theory_question_versions').select('correct_option').eq('stable_code','verification-first').eq('published',true).order('version',{ascending:false}).limit(1).single(),'theory fixture');
  const outcomes=await settleCapacityClients(learners.map((learner,index)=>async()=>{
   async function round(number){
    const namespace=`${runId}:round:${number}`;
    const start=checked(await client.rpc('hub_start_scored_evaluation_attempt',{p_external_subject:learner.subject,p_evaluation_id:evaluation,p_idempotency_key:`${namespace}:attempt:${index}`}), 'start final attempt');
    const attempt=start.attemptId;
    let view=await command(learner,attempt,'start',{},`${namespace}:open:${index}`);
    view=await command(learner,attempt,'theory',{answers:{'verification-first':theory.correct_option}},`${namespace}:theory:${index}`);
    let steps=0;
    while(view.status==='in_progress'&&view.task){
      const task=view.task;const input={actionCode:task.action,identifier:task.identifier||`OS_Assess${String(index).padStart(3,'0')}`,kiosk:'OrionStars',decision:'APPROVED',reason:'Verified the exact operation and game history'};
      if(['CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD'].includes(task.action))input.password='capacity-disposable-private';
      if(['ADD_CREDITS','WITHDRAW_CREDITS'].includes(task.action))input.amount=task.amount;
      if(['VERIFY_BALANCE','BACKEND_REFRESH_BALANCE'].includes(task.action))input.credit=task.credit;
      if(task.action==='RESOLVE_RECONCILIATION'){
        const history=await command(learner,attempt,'history',{},`${namespace}:history:${index}:${steps}`);
        const posted=history.history.some(row=>row.type==='GAME ADD CREDITS'&&Number(row.amount)===Number(task.operation.amount)&&new Date(row.createdAt)>=new Date(task.operation.requestedAt));
        input.decision=posted?'APPROVED':'CANCELLED';
      }
      if(task.action==='CUSTOMER_RESPONSE')Object.assign(input,{responseCode:'recorded-outcome',reference:task.operation.id,credit:task.customerBalance});
      const key=`${namespace}:action:${index}:${steps++}`;
      view=await command(learner,attempt,'action',input,key);
      if(steps===1)assert.deepEqual(await command(learner,attempt,'action',input,key),view);
      assert.ok(steps<=100,'Final workload did not terminate');
    }
    assert.equal(Number(view.score),100,`Final client ${index} failed`);
    const submitted=checked(await client.rpc('hub_submit_scored_evaluation_attempt',{p_external_subject:learner.subject,p_attempt_id:attempt}),'official submission');
    assert.equal(submitted.submitted,true);assert.equal(Number(submitted.score),100);
    return {attempt,steps};
   }
   const first=await round(1);
   const original=checked(await client.from('hub_scored_evaluation_attempts').select('*').eq('id',first.attempt).single(),'original official result');
   assert.equal(original.status,'submitted');
   const reopened=checked(await client.rpc('hub_reopen_scored_evaluation',{p_external_subject:`__TREZ_FINAL_CAPACITY__:${runId}:author`,p_evaluation_id:evaluation,p_postulante_identity_id:learner.id,p_reason:'Existing-worker reinforcement; preserve the original official result'}),'reinforcement reopening');
   assert.ok(reopened);
   const second=await round(2);
   const refreshed=checked(await client.from('hub_scored_evaluation_attempts').select('*').eq('id',first.attempt).single(),'preserved original official result');
   const reassessment=checked(await client.from('hub_scored_evaluation_attempts').select('attempt_set_id,attempt_in_set,status').eq('id',second.attempt).single(),'reinforcement result');
   assert.deepEqual(refreshed,original);assert.notEqual(reassessment.attempt_set_id,original.attempt_set_id);assert.equal(reassessment.attempt_in_set,1);assert.equal(reassessment.status,'submitted');
   const budget=checked(await client.from('hub_evaluation_attempt_sets').select('max_attempts,set_number,status').eq('id',reassessment.attempt_set_id).single(),'reinforcement attempt budget');
   assert.equal(budget.max_attempts,3);assert.equal(budget.set_number,2);assert.equal(budget.status,'closed');
   return {steps:first.steps+second.steps,officialResults:2};
  }),'Native final capacity clients failed');
  const p95=[...durations].sort((a,b)=>a-b)[Math.ceil(durations.length*.95)-1];
  summary={gate:`${clients}-concurrent-native-final-assessment-clients`,clients,roundsPerClient:2,officialResults:outcomes.reduce((sum,row)=>sum+row.officialResults,0),originalResultsPreserved:clients,runtimeCommands:durations.length,practicalActions:outcomes.reduce((sum,row)=>sum+row.steps,0),errors:0,runtimeP95Milliseconds:Math.round(p95),scope:'Local REST/database native final execution, retries, official submission and reasoned TRAINER reinforcement with synthetic prerequisite fixtures; not browser/Auth/hosted load certification.'};
}finally{
  if(setupDone){
    const attempts=`SELECT id FROM hub_scored_evaluation_attempts WHERE identity_id IN (${identities})`;
    const ownedAttempts=checked(await client.from('hub_scored_evaluation_attempts').select('id').in('identity_id',learners.map(row=>row.id)),'owned attempt inventory');
    const worlds=ownedAttempts.length?checked(await client.from('hub_evaluation_worlds').select('session_id').in('attempt_id',ownedAttempts.map(row=>row.id)),'owned world inventory'):[];
    const sessions=ids(worlds.map(row=>row.session_id));
    localSql(`BEGIN;SET LOCAL session_replication_role=replica;
DO $$ BEGIN IF (SELECT version_id FROM hub_evaluation_policy_heads WHERE evaluation_id='${evaluation}') IS DISTINCT FROM '${version}'::uuid THEN RAISE EXCEPTION 'Concurrent policy change; refuse to overwrite its head';END IF;END;$$;
${previousHead?`UPDATE hub_evaluation_policy_heads SET version_id='${previousHead}' WHERE evaluation_id='${evaluation}' AND version_id='${version}';`:`DELETE FROM hub_evaluation_policy_heads WHERE evaluation_id='${evaluation}' AND version_id='${version}';`}
DELETE FROM hub_final_stage_evidence WHERE attempt_id IN (${attempts});DELETE FROM hub_evaluation_action_evidence WHERE attempt_id IN (${attempts});DELETE FROM hub_final_operation_plan WHERE attempt_id IN (${attempts});DELETE FROM hub_evaluation_worlds WHERE attempt_id IN (${attempts});DELETE FROM hub_evaluation_runtime WHERE attempt_id IN (${attempts});DELETE FROM hub_scored_evaluation_item_results WHERE attempt_id IN (${attempts});DELETE FROM hub_scored_evaluation_attempts WHERE id IN (${attempts});DELETE FROM hub_evaluation_reopen_events WHERE identity_id IN (${identities});DELETE FROM hub_evaluation_attempt_sets WHERE identity_id IN (${identities});
DELETE FROM hub_evaluation_policy_versions WHERE id='${version}' AND author_id='${author}';DELETE FROM hub_operation_evidence WHERE session_id IN (${sessions});
DELETE FROM hub_formal_retry_lineage WHERE identity_id IN (${identities});
DELETE FROM hub_simulation_jobs WHERE session_id IN (${sessions});
DELETE FROM sandbox_game_history WHERE session_id IN (${sessions});DELETE FROM sandbox_transaction_history WHERE session_id IN (${sessions});DELETE FROM trainee_action_logs WHERE session_id IN (${sessions});DELETE FROM sandbox_operations WHERE session_id IN (${sessions});DELETE FROM sandbox_game_wallets WHERE session_id IN (${sessions});DELETE FROM sandbox_game_accounts WHERE session_id IN (${sessions});DELETE FROM sandbox_customers WHERE session_id IN (${sessions});DELETE FROM trainee_sessions WHERE id IN (${sessions});
DELETE FROM hub_module_progress WHERE course_id='${course}';DELETE FROM hub_enrolments WHERE course_id='${course}';DELETE FROM hub_modules WHERE id='${module}';DELETE FROM hub_courses WHERE id='${course}';DELETE FROM hub_idempotency_keys WHERE identity_id IN (${identities});DELETE FROM hub_role_assignments WHERE identity_id IN (${identities});DELETE FROM hub_identities WHERE id IN (${identities});COMMIT;`);
    assert.equal(checked(await client.from('hub_identities').select('id').in('id',[author,...learners.map(row=>row.id)]),'cleanup verification').length,0);
    assert.equal(checked(await client.from('hub_evaluation_reopen_events').select('id').in('identity_id',learners.map(row=>row.id)),'reopening cleanup verification').length,0);
    assert.equal(checked(await client.from('hub_evaluation_policy_heads').select('version_id').eq('evaluation_id',evaluation).maybeSingle(),'restored policy head')?.version_id??null,previousHead);
    assert.equal(checked(await client.from('hub_evaluation_policy_versions').select('id').eq('id',version),'removed fixture policy version').length,0);
    unlinkSync(recoveryPath);
  }else if(existsSync(recoveryPath))unlinkSync(recoveryPath);
}
console.log(JSON.stringify({...summary,cleanupPassed:true}));
