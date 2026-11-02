import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {assertLocalE2EBackendEnvironment} from '../../src/config/localE2EGuard.js';

assertLocalE2EBackendEnvironment();
const makeClient=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=makeClient();
const runId=randomUUID();const courseId=randomUUID();const moduleId=randomUUID();const labId=randomUUID();const creationId=randomUUID();
const identities=Array.from({length:10},(_,index)=>({id:randomUUID(),external_subject_reference:`__TREZ_CAPACITY__:${runId}:${index}`,display_name:`Capacity fixture ${index}`}));
const durations=[];
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const quoted=ids=>ids.length?ids.map(id=>`'${id}'::uuid`).join(','):'NULL::uuid';
async function stage(activityId,command,input,connection=client){
  return Promise.all(identities.map(async(identity,index)=>{
    const start=performance.now();
    const result=checked(await connection.rpc('hub_account_practice_command',{p_external_subject:identity.external_subject_reference,p_activity_id:activityId,p_command:command,p_input:input(index),p_idempotency_key:`${runId}:${command}:${index}`}),command);
    durations.push(performance.now()-start);return result;
  }));
}
try{
  const role=checked(await client.from('hub_roles').select('id').eq('code','postulante').single(),'role');
  checked(await client.from('hub_identities').insert(identities),'identities');
  checked(await client.from('hub_role_assignments').insert(identities.map(identity=>({identity_id:identity.id,role_id:role.id}))),'roles');
  checked(await client.from('hub_courses').insert({id:courseId,stable_code:`capacity-${runId}`,title:'Capacity fixture'}),'course');
  checked(await client.from('hub_modules').insert({id:moduleId,course_id:courseId,stable_code:'capacity',position:1,title:'Capacity fixture'}),'module');
  checked(await client.from('hub_activities').insert([
    {id:labId,module_id:moduleId,stable_code:'capacity-lab',position:1,title:'Account lab',activity_type:'interactive_rule_lab',content:{policyStatus:'approved',executionKind:'account_id_lab',policyVersionId:'20000000-0000-4000-8000-000000000001'}},
    {id:creationId,module_id:moduleId,stable_code:'capacity-create',position:2,title:'Create account',activity_type:'quick_simulation',content:{policyStatus:'approved',executionKind:'account_creation',policyVersionId:'20000000-0000-4000-8000-000000000001'}},
  ]),'activities');
  checked(await client.from('hub_enrolments').insert(identities.map(identity=>({identity_id:identity.id,course_id:courseId}))),'enrolments');
  const starts=await stage(labId,'start',()=>({}));assert.equal(new Set(starts.map(row=>row.id)).size,10);
  const identifier=index=>`OS_Practi${String(index).padStart(3,'0')}`;
  await stage(labId,'validate',index=>({identifier:identifier(index)}));
  const creates=await stage(creationId,'create',index=>({identifier:identifier(index),password:'capacity-fixture-only'}));
  // New clients replay uncertain writes without creating a second account.
  const replays=await stage(creationId,'create',index=>({identifier:identifier(index),password:'capacity-fixture-only'}),makeClient());
  assert.deepEqual(replays,creates);
  const finishes=await stage(creationId,'confirm',index=>({identifier:identifier(index),password:'capacity-fixture-only',kiosk:'OrionStars'}));
  assert.equal(new Set(finishes.map(row=>row.artifactId)).size,10);
  assert.ok(finishes.every(row=>row.operation.status==='APPROVED'));
  const p95=[...durations].sort((a,b)=>a-b)[Math.ceil(durations.length*.95)-1];
  console.log(JSON.stringify({gate:'10-concurrent-account-practice-clients',clients:10,commands:durations.length,errors:0,p95Milliseconds:Math.round(p95),scope:'Local database/REST practice commands and second-client retries; not a full browser/production load certification.'}));
}finally{
  const ids=quoted(identities.map(row=>row.id));
  const sessions=checked(await client.from('hub_account_practice').select('session_id').in('identity_id',identities.map(row=>row.id)),'cleanup session inventory');
  const sessionIds=quoted(sessions.map(row=>row.session_id));
  const attempts=`SELECT a.id FROM hub_attempts a JOIN hub_module_progress p ON p.id=a.module_progress_id WHERE p.course_id='${courseId}'::uuid`;
  const sql=`BEGIN; SET LOCAL session_replication_role=replica;
DELETE FROM hub_operation_evidence WHERE session_id IN (${sessionIds});
DELETE FROM hub_account_practice WHERE identity_id IN (${ids});
DELETE FROM hub_evidence_events WHERE attempt_id IN (${attempts});
DELETE FROM hub_attempt_artifacts WHERE attempt_id IN (${attempts});
DELETE FROM hub_activity_attempts WHERE module_id='${moduleId}'::uuid;
DELETE FROM hub_attempts WHERE id IN (${attempts});
DELETE FROM hub_module_progress WHERE course_id='${courseId}'::uuid;
DELETE FROM hub_enrolments WHERE course_id='${courseId}'::uuid;
DELETE FROM hub_activities WHERE module_id='${moduleId}'::uuid;
DELETE FROM hub_modules WHERE id='${moduleId}'::uuid; DELETE FROM hub_courses WHERE id='${courseId}'::uuid;
DELETE FROM hub_idempotency_keys WHERE identity_id IN (${ids});
DELETE FROM hub_role_assignments WHERE identity_id IN (${ids}); DELETE FROM hub_identities WHERE id IN (${ids});
DELETE FROM sandbox_game_history WHERE session_id IN (${sessionIds}); DELETE FROM sandbox_operations WHERE session_id IN (${sessionIds});
DELETE FROM sandbox_game_accounts WHERE session_id IN (${sessionIds}); DELETE FROM sandbox_customers WHERE session_id IN (${sessionIds});
DELETE FROM trainee_sessions WHERE id IN (${sessionIds}); COMMIT;`;
  const cleanup=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});
  if(cleanup.status!==0)throw new Error(`Exact-ID local fixture cleanup failed: ${cleanup.stderr}`);
  const remaining=checked(await client.from('hub_identities').select('id').in('id',identities.map(row=>row.id)),'cleanup verification');assert.equal(remaining.length,0);
}
