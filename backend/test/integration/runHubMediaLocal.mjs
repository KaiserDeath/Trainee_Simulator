import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {assertLocalE2EBackendEnvironment} from '../../src/config/localE2EGuard.js';
import {createHubMediaService} from '../../src/hub/hubMediaService.js';
import {createHubMediaCleanup} from '../../src/hub/hubMediaCleanup.js';

assertLocalE2EBackendEnvironment();
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const service=createHubMediaService({client});const runId=randomUUID();const course=randomUUID();const firstModule=randomUUID();const secondModule=randomUUID();const firstActivity=randomUUID();const secondActivity=randomUUID();
const users=[['author','admin'],['reviewer','admin'],['learner','postulante'],['other','postulante'],['trainer','trainer']].map(([name,role])=>({id:randomUUID(),name,role,subjectId:`__TREZ_MEDIA__:${runId}:${name}`,roles:[role.toUpperCase()]}));
const [author,reviewer,learner,other,trainer]=users;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8pAAAAABJRU5ErkJggg==','base64');
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
const ids=users.map(row=>`'${row.id}'::uuid`).join(',');
function localSql(input){const result=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-XAtq','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr);return result.stdout.trim();}
try{
  checked(await client.from('hub_identities').insert(users.map(row=>({id:row.id,external_subject_reference:row.subjectId,display_name:`Media fixture ${row.name}`}))),'media identities');
  const roles=checked(await client.from('hub_roles').select('id,code'),'roles');
  checked(await client.from('hub_role_assignments').insert(users.map(row=>({identity_id:row.id,role_id:roles.find(role=>role.code===row.role).id}))),'media roles');
  const uploaded=await service.beginUpload(author,{key:`media-${runId}`,title:'Private test image',fileName:'pixel.png',mimeType:'image/png',size:png.length,altText:'A generated one-pixel test image',source:'Generated isolated verification fixture',idempotencyKey:`${runId}:upload`});
  const upload=await fetch(uploaded.uploadUrl,{method:'PUT',headers:{'content-type':'image/png','x-upsert':'false'},body:png});assert.ok(upload.ok,`Signed upload failed: ${upload.status}`);
  const duplicate=await fetch(uploaded.uploadUrl,{method:'PUT',headers:{'content-type':'image/png','x-upsert':'false'},body:png});assert.equal(duplicate.ok,false,'Signed upload could overwrite an immutable asset');
  const forcedOverwrite=await fetch(uploaded.uploadUrl,{method:'PUT',headers:{'content-type':'image/png','x-upsert':'true'},body:png});assert.equal(forcedOverwrite.ok,false,'Upload header bypassed the non-overwrite signature');
  const assetId=uploaded.asset.id;
  const completed=await service.transition(author,assetId,'complete',{idempotencyKey:`${runId}:complete`});assert.equal(completed.asset.status,'pending_review');
  await assert.rejects(()=>service.transition({...learner,roles:['ADMIN']},assetId,'approve',{reason:'A forged role cannot publish this asset',idempotencyKey:`${runId}:forged-role`}),error=>error.statusCode===403);
  await assert.rejects(()=>service.transition(author,assetId,'approve',{reason:'Self approval must be rejected',idempotencyKey:`${runId}:self-review`}),error=>error.code==='HUB_SEPARATE_APPROVER_REQUIRED');
  checked(await client.from('hub_courses').insert({id:course,stable_code:`media-${runId}`,title:'Media access fixture'}),'media course');
  checked(await client.from('hub_modules').insert([{id:firstModule,course_id:course,stable_code:'prerequisite',position:1,title:'Prerequisite'},{id:secondModule,course_id:course,stable_code:'media',position:2,title:'Private media lesson'}]),'media modules');
  checked(await client.from('hub_activities').insert([{id:firstActivity,module_id:firstModule,stable_code:'read',position:1,activity_type:'article',title:'Read prerequisite'},{id:secondActivity,module_id:secondModule,stable_code:'media',position:1,activity_type:'article',title:'Private media lesson'}]),'media activities');
  checked(await client.from('hub_module_prerequisites').insert({course_id:course,module_id:secondModule,prerequisite_module_id:firstModule}),'media prerequisite');
  checked(await client.from('hub_enrolments').insert({identity_id:learner.id,course_id:course}),'media enrolment');
  const version=checked(await client.rpc('hub_create_content_version',{p_external_subject:author.subjectId,p_definition_kind:'activity',p_definition_id:secondActivity,p_locale:'en',p_content:{title:'Private media lesson',instruction:{paragraphs:['Review the approved training image.'],mediaAssetIds:[assetId]}},p_change_rationale:'Attach a reviewed private training asset'}),'create linked lesson');
  checked(await client.rpc('hub_submit_content_version',{p_external_subject:author.subjectId,p_content_version_id:version.id}),'submit linked lesson');
  const fingerprint=checked(await client.rpc('hub_instruction_source_hash',{p_content:version.content}),'source fingerprint');
  const companion=checked(await client.rpc('hub_create_content_version',{p_external_subject:author.subjectId,p_definition_kind:'activity',p_definition_id:secondActivity,p_locale:'es',p_content:{displayTranslation:{sourceVersionId:version.id,sourceFingerprint:fingerprint,es:{'Private media lesson':'Lección de recurso privado','Review the approved training image.':'Revise la imagen de formación aprobada.'}}},p_change_rationale:'Spanish counterpart of private media lesson'}),'Spanish media companion');
  checked(await client.rpc('hub_submit_content_version',{p_external_subject:author.subjectId,p_content_version_id:companion.id}),'submit media companion');
  checked(await client.rpc('hub_review_content_version',{p_external_subject:reviewer.subjectId,p_content_version_id:companion.id,p_decision:'approve',p_rationale:'Reviewed exact Spanish source counterpart'}),'publish media companion');
  const premature=await client.rpc('hub_review_content_version',{p_external_subject:reviewer.subjectId,p_content_version_id:version.id,p_decision:'approve',p_rationale:'This cannot publish before its asset'});assert.ok(premature.error?.message.includes('HUB_MEDIA_NOT_PUBLISHED'));
  assert.equal((await service.transition(reviewer,assetId,'approve',{reason:'Reviewed generated fixture and alternative text',idempotencyKey:`${runId}:review`})).asset.status,'published');
  checked(await client.rpc('hub_review_content_version',{p_external_subject:reviewer.subjectId,p_content_version_id:version.id,p_decision:'approve',p_rationale:'Approved asset is now available'}),'publish linked lesson');
  await assert.rejects(()=>service.access(learner,assetId),error=>error.statusCode===403);
  await assert.rejects(()=>service.access(other,assetId),error=>error.statusCode===403);
  checked(await client.rpc('hub_complete_activity',{p_external_subject:learner.subjectId,p_activity_id:firstActivity,p_state:{},p_idempotency_key:`${runId}:prerequisite`}), 'complete media prerequisite');
  const access=await service.access(learner,assetId);assert.equal(access.expiresIn,900);
  const downloaded=await fetch(access.url);assert.ok(downloaded.ok);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
  const publicUrl=client.storage.from(uploaded.asset.bucket).getPublicUrl(uploaded.asset.object_path).data.publicUrl;assert.equal((await fetch(publicUrl)).ok,false,'Private media was publicly downloadable');
  const anonymous=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});assert.ok((await anonymous.from('hub_media_assets').select('id')).error,'Anonymous database role read media metadata');
  checked(await client.rpc('hub_start_activity_attempt',{p_external_subject:learner.subjectId,p_activity_id:secondActivity,p_state:{},p_idempotency_key:`${runId}:capture`}), 'capture lesson asset version');
  await service.transition(author,assetId,'retire',{reason:'Retire this fixture from new learning delivery',idempotencyKey:`${runId}:retire`});
  assert.ok((await service.access(learner,assetId)).url,'Owned historical lesson lost its pinned asset');
  assert.ok((await service.access(trainer,assetId)).url,'Staff could not review a retired asset');
  checked(await client.from('hub_enrolments').insert({identity_id:other.id,course_id:course}),'second learner assignment');
  checked(await client.rpc('hub_complete_activity',{p_external_subject:other.subjectId,p_activity_id:firstActivity,p_state:{},p_idempotency_key:`${runId}:other-prerequisite`}), 'second learner prerequisite');
  await assert.rejects(()=>service.access(other,assetId),error=>error.statusCode===403);
  const cleanup=createHubMediaCleanup({client});
  const registered=[];
  async function registration(label,withFile=false){
    const body={key:`cleanup-${label}-${runId}`,title:`Cleanup ${label}`,fileName:'pixel.png',mimeType:'image/png',size:png.length,altText:'Cleanup test pixel',source:'Generated isolated cleanup fixture',idempotencyKey:`${runId}:${label}`};
    const upload=await service.beginUpload(author,body);registered.push(upload.asset.id);
    const token=new URL(upload.uploadUrl).searchParams.get('token');
    assert.ok(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).exp*1000<=new Date(upload.asset.upload_valid_until).getTime());
    if(withFile)assert.ok((await fetch(upload.uploadUrl,{method:'PUT',headers:{'content-type':'image/png','x-upsert':'false'},body:png})).ok);
    return {...upload,body};
  }
  const abandoned=await registration('abandoned',true),missing=await registration('missing'),recent=await registration('recent'),liveLink=await registration('live-link'),draft=await registration('draft'),snapshot=await registration('snapshot'),lesson=await registration('lesson'),pending=await registration('pending',true);
  await service.transition(author,pending.asset.id,'complete',{idempotencyKey:`${runId}:pending-complete`});
  const resumed=await service.beginUpload(author,pending.body);assert.equal(resumed.alreadyUploaded,true);assert.equal(resumed.uploadUrl,undefined,'Completed upload retry issued another upload token');
  checked(await client.from('hub_activities').update({content:{mediaAssetIds:[lesson.asset.id]}}).eq('id',firstActivity),'protected current lesson');
  // Keep each reference category independent, including a snapshot whose current lesson no longer references it.
  checked(await client.rpc('hub_create_content_version',{p_external_subject:author.subjectId,p_definition_kind:'activity',p_definition_id:firstActivity,p_locale:'en',p_content:{title:'Protected draft',instruction:{mediaAssetIds:[draft.asset.id]}},p_change_rationale:'Preserve an unfinished linked draft'}),'protected draft');
  const snapshotActivity=randomUUID();
  localSql(`INSERT INTO hub_activities(id,module_id,stable_code,position,activity_type,title,content) VALUES('${snapshotActivity}','${secondModule}','snapshot-only',2,'article','Historical snapshot',jsonb_build_object('mediaAssetIds',jsonb_build_array('${snapshot.asset.id}')));`);
  checked(await client.rpc('hub_start_activity_attempt',{p_external_subject:learner.subjectId,p_activity_id:snapshotActivity,p_state:{},p_idempotency_key:`${runId}:protected-snapshot`}), 'capture protected snapshot');
  localSql(`UPDATE hub_activities SET content='{}' WHERE id='${snapshotActivity}';
BEGIN;SET LOCAL session_replication_role=replica;
UPDATE hub_media_assets SET created_at=now()-interval '4 days',upload_valid_until=now()-interval '1 hour' WHERE id IN('${abandoned.asset.id}','${missing.asset.id}','${draft.asset.id}','${snapshot.asset.id}','${lesson.asset.id}','${pending.asset.id}');
UPDATE hub_media_assets SET created_at=now()-interval '4 days' WHERE id='${liveLink.asset.id}';COMMIT;`);
  const preview=await cleanup.run();assert.equal(preview.mode,'preview');
  const candidates=checked(await client.rpc('hub_media_cleanup',{p_mode:'preview',p_limit:100}),'preview');
  assert.deepEqual(candidates.filter(row=>registered.includes(row.assetId)).map(row=>row.assetId).sort(),[abandoned.asset.id,missing.asset.id].sort());
  assert.ok((await client.storage.from(abandoned.asset.bucket).download(abandoned.asset.object_path)).data,'Preview deleted bytes');
  assert.equal(checked(await client.from('hub_media_assets').select('status').eq('id',abandoned.asset.id).single(),'preview state').status,'awaiting_upload');
  // Concurrent workers cannot both lease the same job.
  const claimed=await Promise.all([client.rpc('hub_media_cleanup',{p_mode:'claim',p_limit:1}),client.rpc('hub_media_cleanup',{p_mode:'claim',p_limit:1})]);
  const jobs=claimed.flatMap(result=>checked(result,'concurrent claim'));assert.equal(new Set(jobs.map(job=>job.assetId)).size,2);
  const oldJob=jobs.find(job=>job.assetId===abandoned.asset.id);
  // Simulate a process dying after deletion but before its completion receipt.
  checked(await client.storage.from(abandoned.asset.bucket).remove([abandoned.asset.object_path]),'simulated crash removal');
  localSql(`UPDATE hub_media_cleanup_jobs SET lease_until=now()-interval '1 second' WHERE asset_id IN('${abandoned.asset.id}','${missing.asset.id}');`);
  const failing=createHubMediaCleanup({client:{rpc:(...args)=>client.rpc(...args),storage:{from:()=>({remove:async()=>({error:{message:'Injected Storage outage'}})})}}});
  const failure=await failing.run({apply:true});assert.equal(failure.failed,2);assert.equal(failure.removed,0);
  assert.equal(localSql(`SELECT count(*) FROM hub_media_cleanup_jobs WHERE asset_id IN('${abandoned.asset.id}','${missing.asset.id}') AND completed_at IS NOT NULL;`),'0');
  assert.equal(checked(await client.rpc('hub_media_cleanup',{p_mode:'claim',p_limit:100}),'backoff claim').length,0);
  localSql(`UPDATE hub_media_cleanup_jobs SET lease_until=now()-interval '1 second' WHERE asset_id IN('${abandoned.asset.id}','${missing.asset.id}');`);
  const removed=await cleanup.run({apply:true});assert.equal(removed.removed,2);assert.equal(removed.failed,0);
  assert.equal((await cleanup.run({apply:true})).claimed,0,'Completed jobs were processed again');
  assert.ok((await client.rpc('hub_media_cleanup',{p_mode:'complete',p_limit:1,p_asset_id:oldJob.assetId,p_claim_token:oldJob.claimToken})).error?.message.includes('HUB_MEDIA_CLEANUP_CONFLICT'));
  await assert.rejects(()=>service.beginUpload(author,abandoned.body),error=>error.statusCode===410);
  await assert.rejects(()=>service.transition(author,abandoned.asset.id,'complete',{idempotencyKey:`${runId}:expired-complete`}),error=>error.statusCode===410);
  const expiredReference=await client.rpc('hub_create_content_version',{p_external_subject:author.subjectId,p_definition_kind:'activity',p_definition_id:firstActivity,p_locale:'en',p_content:{title:'Expired link',instruction:{mediaAssetIds:[abandoned.asset.id]}},p_change_rationale:'Cannot link an expired registration'});assert.ok(expiredReference.error?.message.includes('HUB_MEDIA_UPLOAD_EXPIRED'));
  assert.ok((await anonymous.rpc('hub_media_cleanup',{p_mode:'claim',p_limit:100})).error,'Anonymous role invoked cleanup');
  assert.equal(localSql(`SELECT has_function_privilege('authenticated','public.hub_media_cleanup(text,integer,uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','public.hub_media_command_original(text,text,uuid,jsonb,text)','EXECUTE');`),'f');
  assert.ok((await service.access(learner,assetId)).url,'Cleanup removed retired historical media');
  for(const protectedAsset of [recent,liveLink,draft,snapshot,lesson,pending])assert.notEqual(checked(await client.from('hub_media_assets').select('status').eq('id',protectedAsset.asset.id).single(),'protected registration').status,'expired');
  const race=await registration('complete-race',true);
  localSql(`BEGIN;SET LOCAL session_replication_role=replica;UPDATE hub_media_assets SET created_at=now()-interval '4 days',upload_valid_until=now()-interval '1 hour' WHERE id='${race.asset.id}';COMMIT;`);
  const [completion,claimRace]=await Promise.allSettled([service.transition(author,race.asset.id,'complete',{idempotencyKey:`${runId}:complete-race`}),client.rpc('hub_media_cleanup',{p_mode:'claim',p_limit:100}).then(result=>checked(result,'completion race claim'))]);
  assert.equal(claimRace.status,'fulfilled');
  if(claimRace.value.length){assert.equal(claimRace.value[0].assetId,race.asset.id);assert.equal(completion.status,'rejected');assert.equal(completion.reason.statusCode,410);checked(await client.storage.from(race.asset.bucket).remove([race.asset.object_path]),'race fixture removal');checked(await client.rpc('hub_media_cleanup',{p_mode:'complete',p_limit:1,p_asset_id:race.asset.id,p_claim_token:claimRace.value[0].claimToken}),'race receipt');}
  else{assert.equal(completion.status,'fulfilled');assert.equal(completion.value.asset.status,'pending_review');assert.ok((await client.storage.from(race.asset.bucket).download(race.asset.object_path)).data);}
  console.log('Abandoned media cleanup passed: read-only preview, 72h age and live-link grace, draft/snapshot/pending/retired protection, concurrent leases, crash recovery, Storage-failure backoff, exact retry, expired upload/reference denial and service-role-only maintenance.');
}finally{
  const assets=checked(await client.from('hub_media_assets').select('id,bucket,object_path').eq('author_id',author.id),'media cleanup inventory');
  if(assets.length)checked(await client.storage.from('trez-hub-training-assets').remove(assets.map(asset=>asset.object_path)),'remove exact fixture objects');
  const sql=`BEGIN;SET LOCAL session_replication_role=replica;
DELETE FROM hub_media_cleanup_events WHERE asset_id IN(SELECT id FROM hub_media_assets WHERE author_id='${author.id}');DELETE FROM hub_media_cleanup_jobs WHERE asset_id IN(SELECT id FROM hub_media_assets WHERE author_id='${author.id}');
DELETE FROM hub_media_review_events WHERE asset_id IN(SELECT id FROM hub_media_assets WHERE author_id='${author.id}');DELETE FROM hub_media_assets WHERE author_id='${author.id}';
DELETE FROM hub_content_review_events WHERE content_version_id IN(SELECT id FROM hub_content_versions WHERE author_identity_id='${author.id}');DELETE FROM hub_content_versions WHERE author_identity_id='${author.id}';
DELETE FROM hub_evidence_events WHERE attempt_id IN(SELECT a.id FROM hub_attempts a JOIN hub_module_progress p ON p.id=a.module_progress_id WHERE p.course_id='${course}');DELETE FROM hub_activity_attempts WHERE module_id IN('${firstModule}','${secondModule}');DELETE FROM hub_attempts WHERE module_id IN('${firstModule}','${secondModule}');DELETE FROM hub_module_progress WHERE course_id='${course}';DELETE FROM hub_enrolments WHERE course_id='${course}';DELETE FROM hub_module_prerequisites WHERE course_id='${course}';DELETE FROM hub_activities WHERE module_id IN('${firstModule}','${secondModule}');DELETE FROM hub_modules WHERE course_id='${course}';DELETE FROM hub_courses WHERE id='${course}';DELETE FROM hub_idempotency_keys WHERE identity_id IN(${ids});DELETE FROM hub_role_assignments WHERE identity_id IN(${ids});DELETE FROM hub_identities WHERE id IN(${ids});COMMIT;`;
  const cleanup=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});
  if(cleanup.status!==0)throw new Error(`Exact local media fixture cleanup failed: ${cleanup.stderr}`);
}
console.log('Local private media passed: signed upload/download, immutable file, separate-admin publication, lesson publication dependency, module/identity access, private bucket, and historical-version access. Exact fixtures removed.');
