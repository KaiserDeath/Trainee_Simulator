import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {assertLocalE2EBackendEnvironment} from '../../src/config/localE2EGuard.js';
import {createApp} from '../../src/app.js';
import {supabase} from '../../src/config/supabase.js';

// This gate never accepts a hosted target, credentials file or configurable container.
const urls=assertLocalE2EBackendEnvironment();
const root=fileURLToPath(new URL('../../../',import.meta.url));
const origin=urls.frontend.origin;const apiOrigin=urls.backend.origin;
const evaluationId='10000000-0000-4000-8000-000000000401';
const runId=randomUUID();const tag=runId.replaceAll('-','').slice(0,10);
const courseId=randomUUID(),moduleId=randomUUID(),activityId=randomUUID();
const people=['trainer','rrhh','postulante','postulante','postulante','trainer','admin','admin'].map((role,i)=>({id:randomUUID(),role,username:`F${tag}${i}`,displayName:`Formal fixture ${tag} ${i}`,password:randomBytes(24).toString('base64url')}));
const questionCode=`formal-${tag}-question`;
const contexts=[];let browser,server,vite,original,changed=false;let viteLog='';
const report={target:'isolated loopback Supabase and actual Express/Vite/browser',checks:[],runId};
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.message}`);return result.data;};
function sql(input){const result=spawnSync('docker',['exec','-i','supabase_db_simulador-dos-local','psql','-At','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr||'Local SQL failed');return result.stdout;}
function sqlJson(input){return JSON.parse(sql(input).trim());}
function record(message){report.checks.push(message);console.log(message);}
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Local frontend did not start');}
async function login(person,{spanish=false}={}){
 const context=await browser.newContext({viewport:{width:1365,height:900}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(12000);
 await page.goto(`${origin}/hub`);await page.getByLabel('Username',{exact:true}).fill(person.username);await page.getByLabel('Password',{exact:true}).fill(person.password);
 if(spanish)await page.getByRole('button',{name:'Español',exact:true}).click();
 const response=page.waitForResponse(r=>r.url().endsWith('/auth/login'));await page.getByRole('button',{name:spanish?'Iniciar sesión':'Sign in',exact:true}).click();assert.equal((await response).status(),200);
 await page.getByRole('button',{name:spanish||person.role==='rrhh'?'Cerrar sesión':'Sign out',exact:true}).waitFor();
 if(person.role==='postulante')await page.goto(`${origin}/hub#/learn`);
 else await page.goto(`${origin}/hub#hub-management`);
 return {page,context};
}
async function post(context,route,data={}){const cookie=(await context.cookies(`${apiOrigin}/api/hub`)).find(c=>c.name==='trez_hub_csrf');return context.request.post(`${apiOrigin}/api/hub/${route}`,{headers:{origin,'x-trez-csrf':cookie?.value||''},data});}
async function get(context,route){const result=await context.request.get(`${apiOrigin}/api/hub/${route}`);assert.equal(result.status(),200,route);return result.json();}
async function completePrerequisite(session){await session.page.getByRole('button',{name:'Mark article complete',exact:true}).click();await session.page.getByText('Formal prerequisite progress was saved.',{exact:true}).waitFor();}
async function start(session){await session.page.getByRole('link',{name:'Evaluations',exact:true}).click();const pending=session.page.waitForResponse(r=>r.url().endsWith(`/scored-evaluations/${evaluationId}/attempts`)&&r.request().method()==='POST');await session.page.getByRole('button',{name:'Start next attempt',exact:true}).click();const response=await pending;assert.equal(response.status(),201);const data=(await response.json()).attempt;const replay=await post(session.context,`scored-evaluations/${evaluationId}/attempts`,response.request().postDataJSON());assert.equal(replay.status(),201);assert.equal((await replay.json()).attempt.attemptId,data.attemptId);return data;}
async function runAttempt(session,correctTheory){
 const {page,context}=session;const started=await start(session);const attemptId=started.attemptId;
 const opened=page.waitForResponse(r=>r.url().endsWith(`/attempts/${attemptId}/runtime/start`));await page.getByRole('button',{name:'Open assessment',exact:true}).click();const startResponse=await opened;assert.equal(startResponse.status(),200);let view=await startResponse.json();
 assert.ok(!JSON.stringify(view).includes('correctOption'));const question=view.questions[0];const option=question.choices.find(c=>c.id===(correctTheory?'verify':'name'));assert.ok(option);
 const translated=question.displayTranslation?.es;assert.ok(translated?.question);assert.ok(translated?.choices?.[option.id]);
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.getByRole('radio',{name:translated.choices[option.id],exact:true}).check();
 await page.getByRole('button',{name:'English',exact:true}).click();assert.equal(await page.getByRole('radio',{name:option.label,exact:true}).isChecked(),true,'Changing language preserves the captured answer ID');
 await page.getByRole('radio',{name:option.label,exact:true}).check();const theory=page.waitForResponse(r=>r.url().endsWith(`/attempts/${attemptId}/runtime/theory`));await page.getByRole('button',{name:'Record theory responses',exact:true}).click();assert.equal((await theory).status(),200);
 const password=randomBytes(15).toString('base64url');let actions=0;
 while(view.task){
  const response=await get(context,`scored-evaluations/attempts/${attemptId}/runtime`);view=response;if(view.status!=='in_progress'||!view.task)break;
  const task=view.task;const form=page.locator('form').filter({has:page.getByRole('button',{name:'Record action',exact:true})});
  if(await form.getByLabel('Game ID',{exact:true}).count())await form.getByLabel('Game ID',{exact:true}).fill(task.identifier||'OS_Assess123');
  if(await form.getByLabel('Game password',{exact:true}).count())await form.getByLabel('Game password',{exact:true}).fill(password);
  if(await form.getByLabel('Credits',{exact:true}).count())await form.getByLabel('Credits',{exact:true}).fill(String(task.amount));
  if(await form.getByLabel('Observed game credit',{exact:true}).count())await form.getByLabel('Observed game credit',{exact:true}).fill(String(task.credit));
  if(task.action==='REVIEW_TRANSACTION_RECORDS'){
   const read=page.waitForResponse(r=>r.url().endsWith(`/attempts/${attemptId}/runtime/history`));await form.getByRole('button',{name:'Game history',exact:true}).click();assert.equal((await read).status(),200);await form.getByRole('checkbox').first().waitFor();for(const checkbox of await form.getByRole('checkbox').all())await checkbox.check();
  }
  const pending=page.waitForResponse(r=>r.url().endsWith(`/attempts/${attemptId}/runtime/action`)&&r.request().method()==='POST');await form.getByRole('button',{name:'Record action',exact:true}).click();const action=await pending;assert.equal(action.status(),200,await action.text());view=await action.json();
  const replay=await post(context,`scored-evaluations/attempts/${attemptId}/runtime/action`,{...action.request().postDataJSON(),isCorrect:true,validation:{correct:true}});assert.equal(replay.status(),200);assert.deepEqual(await replay.json(),view);
  if(view.status==='in_progress'){assert.ok(!JSON.stringify(view).includes('correctOption'));assert.ok(!JSON.stringify(view).includes('isCorrect'));}
  actions++;assert.ok(actions<=7,'Unexpected action loop');
 }
 assert.equal(actions,7);assert.equal(view.score,correctTheory?100:80);assert.equal(view.result,correctTheory?'successful':'unsuccessful');assert.ok(!JSON.stringify(view).includes(password));
 await page.getByRole('button',{name:'Return to checkpoint results',exact:true}).click();return {attemptId,view};
}
try{
 original=checked(await supabase.from('hub_scored_evaluations').select('*').eq('id',evaluationId).single(),'baseline evaluation');assert.equal(original.publication_status,'draft','Use the isolated seeded draft catalog');
 assert.equal(sqlJson(`SELECT count(*) FROM hub_evaluation_policy_heads WHERE evaluation_id='${evaluationId}';`),0,'Existing policy heads must be preserved');
 const roles=checked(await supabase.from('hub_roles').select('id,code'),'roles');
 for(const person of people){const email=`${person.username.toLowerCase()}@auth.trez.invalid`;const auth=checked(await supabase.auth.admin.createUser({email,password:person.password,email_confirm:true,user_metadata:{username:person.username}}),'Auth fixture');person.authId=auth.user.id;
  checked(await supabase.from('hub_identities').insert({id:person.id,auth_user_id:person.authId,external_subject_reference:person.authId,email,username:person.username,first_name:'Formal',surname:tag,display_name:person.displayName,preferred_locale:person.role==='rrhh'?'es':'en'}),'identity');checked(await supabase.from('hub_role_assignments').insert({identity_id:person.id,role_id:roles.find(r=>r.code===person.role).id}),'role');}
 checked(await supabase.from('hub_courses').insert({id:courseId,stable_code:`formal-browser-${tag}`,title:'Formal browser fixture'}),'course');checked(await supabase.from('hub_modules').insert({id:moduleId,course_id:courseId,stable_code:'prerequisite',position:1,title:'Formal prerequisite'}),'module');checked(await supabase.from('hub_activities').insert({id:activityId,module_id:moduleId,stable_code:'article',position:1,activity_type:'article',title:'Formal prerequisite',content:{paragraphs:["A customer's general balance and each individual game balance are separate records."]}}),'activity');
 checked(await supabase.from('hub_enrolments').insert(people.filter(p=>p.role==='postulante').map(p=>({identity_id:p.id,course_id:courseId}))),'enrolments');
 server=http.createServer(createApp());await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(urls.backend.port),'127.0.0.1',resolve);});
 vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',urls.frontend.port,'--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_URL:apiOrigin,VITE_TREZ_HUB_ENABLED:'true',VITE_TREZ_AUTH_REQUIRED:'true'},windowsHide:true,stdio:['ignore','pipe','pipe']});vite.stdout.on('data',chunk=>{viteLog+=chunk;});vite.stderr.on('data',chunk=>{viteLog+=chunk;});await ready(origin);
 browser=await chromium.launch({headless:true});
 const manual=await login(people[2],{spanish:true});
 await manual.page.getByText('El saldo general del cliente y el saldo de cada juego son registros independientes.',{exact:true}).waitFor();
 await manual.page.reload();await manual.page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
 const learning=await get(manual.context,'learning-path');const {displayTranslations,...canonicalLearning}=learning;
 assert.ok(displayTranslations?.es);assert.ok(!JSON.stringify(displayTranslations).includes('What must be verified before changing customer credits?'));
 report.fixtureLearningPayloadBytes={canonical:Buffer.byteLength(JSON.stringify(canonicalLearning)),withTranslations:Buffer.byteLength(JSON.stringify(learning))};
 record('Real guest Spanish selection survives login/reload; authorized lesson translations arrive without exposing the private question bank');
 await manual.page.getByRole('button',{name:'English',exact:true}).click();
 const author=await login(people[6]);const contentReviewer=await login(people[7]);
 async function publishLesson(english,spanish){
  const created=await post(author.context,`workspace/activities/${activityId}/versions`,{title:'Formal prerequisite',instruction:{paragraphs:[english]},changeRationale:'Bilingual source snapshot verification'});assert.equal(created.status(),200);const source=(await created.json()).contentVersion;
  assert.equal((await post(author.context,`admin/content-versions/${source.id}/submit`)).status(),200);
  const premature=await post(contentReviewer.context,`admin/content-versions/${source.id}/review`,{decision:'approve',rationale:'Companion required before source publication'});assert.equal(premature.status(),409);assert.equal((await premature.json()).error.code,'HUB_TRANSLATION_REQUIRED');
  const translated=await post(author.context,`workspace/activities/${activityId}/translations`,{sourceVersionId:source.id,translations:{'Formal prerequisite':'Requisito formal',[english]:spanish},rationale:'Spanish counterpart of the exact English version'});assert.equal(translated.status(),200,await translated.text());const companion=(await translated.json()).contentVersion;
  assert.equal((await post(author.context,`admin/content-versions/${companion.id}/submit`)).status(),200);
  assert.equal((await post(author.context,`admin/content-versions/${companion.id}/review`,{decision:'approve',rationale:'Self approval must remain blocked'})).status(),409);
  assert.equal((await post(contentReviewer.context,`admin/content-versions/${companion.id}/review`,{decision:'approve',rationale:'Spanish counterpart reviewed independently'})).status(),200);
  assert.equal((await post(contentReviewer.context,`admin/content-versions/${source.id}/review`,{decision:'approve',rationale:'Matching English source reviewed independently'})).status(),200);
  return source.id;
 }
 const firstEnglish='A current bilingual instruction is tied to this exact version.';
 const firstSpanish='Una instrucción bilingüe actual está vinculada a esta versión exacta.';
 await publishLesson(firstEnglish,firstSpanish);
 await manual.page.reload();await manual.page.getByRole('button',{name:'Español',exact:true}).click();await manual.page.getByText(firstSpanish,{exact:true}).waitFor();await manual.page.getByRole('heading',{name:'Requisito formal',exact:true}).waitFor();await manual.page.getByRole('button',{name:'English',exact:true}).click();
 record('Actual ADMIN author and separate reviewer published paired lesson versions; missing Spanish and self approval were denied; learner received scoped Spanish content');
 const questionAuthor=await login(people[0]);
 const publishedQuestion=await post(questionAuthor.context,'assessment/questions',{code:questionCode,expectedVersion:0,question:'Which exact customer record belongs to this training attempt?',choices:[{id:'verify',label:'The customer verified for this assigned attempt'},{id:'name',label:'A similar customer name'}],correctOption:'verify',source:'Isolated verification-first fixture',rationale:'Bind English and Spanish without changing answer IDs',spanish:{question:'¿Qué registro exacto del cliente corresponde a este intento de formación?',choices:{verify:'El cliente verificado para este intento asignado',name:'Un nombre de cliente parecido'}},reviewedLanguages:true});assert.equal(publishedQuestion.status(),201,await publishedQuestion.text());
 sql(`UPDATE hub_scored_evaluations SET publication_status='published',is_provisional=FALSE,selected_game_family_keys=ARRAY['orion-stars'],prerequisite_module_ids=ARRAY['${moduleId}'::uuid],prerequisite_evaluation_ids='{}',theory_item_codes=ARRAY['${questionCode}'],required_action_codes=ARRAY['CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','ADD_CREDITS','WITHDRAW_CREDITS','REVIEW_TRANSACTION_RECORDS','RESET_PASSWORD_EDIT_INFORMATION'],practical_item_weights='{"CREATE_ACCOUNT":15,"SEARCH_USER":10,"VERIFY_BALANCE":10,"ADD_CREDITS":15,"WITHDRAW_CREDITS":15,"REVIEW_TRANSACTION_RECORDS":10,"RESET_PASSWORD_EDIT_INFORMATION":5}' WHERE id='${evaluationId}';`);changed=true;
 await manual.page.reload();
 const blocked=await post(manual.context,`scored-evaluations/${evaluationId}/attempts`,{idempotencyKey:randomUUID()});assert.equal(blocked.status(),409);assert.equal((await blocked.json()).error.code,'HUB_EVALUATION_PREREQUISITE_INCOMPLETE');await completePrerequisite(manual);
 await publishLesson('The next published source must not replace a completed lesson.','La siguiente versión publicada no debe reemplazar una lección completada.');
 await manual.page.reload();await manual.page.getByRole('button',{name:'Español',exact:true}).click();await manual.page.getByText(firstSpanish,{exact:true}).waitFor();assert.equal(await manual.page.getByText('La siguiente versión publicada no debe reemplazar una lección completada.',{exact:true}).count(),0);await manual.page.getByRole('button',{name:'English',exact:true}).click();
 record('Completed lesson retained its pinned Spanish counterpart after a later bilingual publication; new private question versions carry Spanish text with unchanged choice IDs');
 const successful=await runAttempt(manual,true);assert.equal(successful.view.status,'scored');await manual.page.getByRole('button',{name:'Start next attempt',exact:true}).waitFor();
 const submitted=manual.page.waitForResponse(r=>r.url().endsWith(`/attempts/${successful.attemptId}/submit`));manual.page.once('dialog',dialog=>dialog.accept());await manual.page.getByRole('button',{name:'Send latest result',exact:true}).click();assert.equal((await submitted).status(),200);
 const manualStatus=(await get(manual.context,'scored-evaluations')).evaluations.find(e=>e.id===evaluationId);assert.equal(manualStatus.attemptSet.status,'closed');assert.equal(manualStatus.attempts[0].status,'submitted');assert.equal(manualStatus.attemptsRemaining,2);
 record('Prerequisites enforced; 100% manual submission closes unused attempts; start/action retries are idempotent');
 const limited=await login(people[3]);await completePrerequisite(limited);const attempts=[];
 for(let number=1;number<=3;number++){
  const attempt=await runAttempt(limited,false);attempts.push(attempt);assert.equal(attempt.view.status,number===3?'submitted':'scored');
  if(number===2){const stale=await post(limited.context,`scored-evaluations/attempts/${attempts[0].attemptId}/submit`);assert.equal(stale.status(),409);assert.equal((await stale.json()).error.code,'HUB_ONLY_LATEST_ATTEMPT_SUBMITTABLE');}
 }
 const fourth=await post(limited.context,`scored-evaluations/${evaluationId}/attempts`,{idempotencyKey:randomUUID()});assert.equal(fourth.status(),409);assert.equal((await fourth.json()).error.code,'HUB_EVALUATION_REOPEN_REQUIRED');
 assert.equal(await limited.page.getByRole('button',{name:'Start next attempt',exact:true}).count(),0);
 assert.equal((await limited.context.request.get(`${apiOrigin}/api/hub/assessment/attempts/${attempts[0].attemptId}/evidence`)).status(),403);
 record('Learner can retry after attempts one/two; only latest submission allowed; third failed result auto-submits and fourth start is denied');
 const trainer=await login(people[0]);const auditor=await login(people[1]);const reopenPath=`assessment/evaluations/${evaluationId}/postulantes/${people[3].id}/reopen`;
 assert.equal((await post(auditor.context,reopenPath,{reason:'RRHH cannot reopen'})).status(),403);assert.equal((await post(trainer.context,reopenPath,{})).status(),400);
 await trainer.page.getByRole('link',{name:'Evaluations',exact:true}).click();
 const row=trainer.page.getByRole('row').filter({hasText:people[3].displayName}).filter({has:trainer.page.getByRole('button',{name:'Reopen with reason',exact:true})});
 trainer.page.once('dialog',dialog=>dialog.accept('Verified remediation and additional practice completed.'));const reopened=trainer.page.waitForResponse(r=>r.url().endsWith('/reopen')&&r.request().method()==='POST');await row.getByRole('button',{name:'Reopen with reason',exact:true}).click();assert.equal((await reopened).status(),201);
 await limited.page.reload();const next=await start(limited);assert.equal(next.attemptInSet,1);assert.equal(next.attemptSetNumber,2);assert.equal(checked(await supabase.from('hub_scored_evaluation_attempts').select('id').in('id',attempts.map(a=>a.attemptId)),'old attempts').length,3);
 record('Only TRAINER can reopen with a reason; a fresh three-attempt set opens and original results remain');
 for(const staff of [trainer,auditor]){const evidence=await get(staff.context,`assessment/attempts/${successful.attemptId}/evidence`);assert.equal(evidence.questions[0].correctOption,'verify');assert.equal(evidence.actions.length,7);const reportRows=await get(staff.context,`assessment/report?postulanteId=${people[3].id}`);assert.ok(reportRows.attempts.length>=3);}
 const outsider=await login(people[4]);assert.equal((await outsider.context.request.get(`${apiOrigin}/api/hub/scored-evaluations/attempts/${successful.attemptId}/runtime`)).status(),403);
 record('TRAINER/RRHH can review formal evidence and reports; learner/private evidence and foreign-attempt reads are denied');
 const retentionPath=`assessment/attempts/${successful.attemptId}/retention`;
 sql(fs.readFileSync(path.join(root,'backend/test/integration/formalRetentionAgeFixture.sql'),'utf8')+`\nSELECT pg_temp.age_formal('${successful.attemptId}');`);
 const retainedRoot=checked(await supabase.from('hub_scored_evaluation_attempts').select('*').eq('id',successful.attemptId).single(),'retention root');
 const proposal={command:'request',expectedRevision:0,reason:'Closed aged native packet reviewed for disposal',idempotencyKey:randomUUID()};
 assert.equal((await post(manual.context,retentionPath,proposal)).status(),403);assert.equal((await post(auditor.context,retentionPath,proposal)).status(),403);
 const proposed=await post(trainer.context,retentionPath,proposal);assert.equal(proposed.status(),200,await proposed.text());
 assert.equal((await post(trainer.context,retentionPath,{command:'approve',expectedRevision:1,reason:'Cannot approve my own request',idempotencyKey:randomUUID()})).status(),409);
 const reviewer=await login(people[5]);await reviewer.page.getByRole('link',{name:'Evaluations',exact:true}).click();await reviewer.page.getByText('Private recorded assessment actions',{exact:true}).click();
 const packet=reviewer.page.locator(`[data-attempt-id="${successful.attemptId}"]`);await packet.getByRole('button',{name:'Review recorded evidence',exact:true}).click();await packet.getByRole('button',{name:'Open evidence retention',exact:true}).click();
 await packet.getByRole('button',{name:'Review evidence disposal',exact:true}).click();await packet.getByLabel('Brief evidence retention reason (omit private evidence)',{exact:true}).fill('Independent age and dependency review completed');
 const disposing=reviewer.page.waitForResponse(r=>r.url().endsWith(`/attempts/${successful.attemptId}/retention`)&&r.request().method()==='POST');await packet.getByRole('button',{name:'Approve evidence disposal',exact:true}).click();const disposed=await disposing;assert.equal(disposed.status(),200,await disposed.text());
 const receipt=await disposed.json();assert.equal(receipt.state,'disposed');assert.equal(receipt.removed_counts.actions,7);
 const repeat=await post(reviewer.context,retentionPath,disposed.request().postDataJSON());assert.equal(repeat.status(),200);assert.deepEqual(await repeat.json(),receipt);
 const empty=await get(trainer.context,`assessment/attempts/${successful.attemptId}/evidence`);assert.equal(empty.evidenceRetention.state,'disposed');assert.equal(empty.questions.length,0);assert.equal(empty.actions.length,0);
 assert.deepEqual(checked(await supabase.from('hub_scored_evaluation_attempts').select('*').eq('id',successful.attemptId).single(),'retained result after disposal'),retainedRoot);
 assert.equal((await manual.context.request.get(`${apiOrigin}/api/hub/scored-evaluations/attempts/${successful.attemptId}/runtime`)).status(),410);
 assert.equal((await post(manual.context,`scored-evaluations/${evaluationId}/attempts`,{idempotencyKey:randomUUID()})).status(),409);
 record('Independent TRAINER browser review disposed an aged packet; detail and cached copies were removed while score, closed budget and result remain; learner runtime replay denied');
 fs.mkdirSync(path.join(root,'outputs'),{recursive:true});await trainer.page.screenshot({path:path.join(root,'outputs/hub-formal-browser-trainer.png'),fullPage:true});report.passed=true;
}catch(error){report.passed=false;report.failure=error.message;console.error(error);if(viteLog&&!browser)console.error(viteLog);process.exitCode=1;}
finally{
 for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close();if(vite){vite.kill();await new Promise(resolve=>{if(vite.exitCode!==null)resolve();else{vite.once('exit',resolve);setTimeout(resolve,2000);}});}if(server)await new Promise(resolve=>server.close(resolve));
 const ids=people.map(p=>`'${p.id}'::uuid`).join(',');const attempts=`SELECT id FROM hub_scored_evaluation_attempts WHERE identity_id IN(${ids})`;
 try{
  let restore='';if(changed){const keys=Object.keys(original);const json=JSON.stringify(original).replaceAll("'","''");restore=`UPDATE hub_scored_evaluations SET (${keys.map(k=>'"'+k+'"').join(',')})=(SELECT ${keys.map(k=>'r."'+k+'"').join(',')} FROM jsonb_populate_record(NULL::hub_scored_evaluations,'${json}'::jsonb)r) WHERE id='${evaluationId}';`;}
  sql(`BEGIN;SET LOCAL session_replication_role=replica;${restore}
CREATE TEMP TABLE formal_fixture_sessions ON COMMIT DROP AS SELECT session_id AS id FROM hub_evaluation_worlds WHERE attempt_id IN(${attempts});
DELETE FROM hub_formal_retention_events WHERE attempt_id IN(${attempts});DELETE FROM hub_formal_retention_cases WHERE attempt_id IN(${attempts});DELETE FROM hub_formal_retry_lineage WHERE identity_id IN(${ids});
DELETE FROM hub_evaluation_action_evidence WHERE attempt_id IN(${attempts});DELETE FROM hub_evaluation_worlds WHERE attempt_id IN(${attempts});DELETE FROM hub_evaluation_runtime WHERE attempt_id IN(${attempts});DELETE FROM hub_scored_evaluation_item_results WHERE attempt_id IN(${attempts});DELETE FROM hub_evaluation_reopen_events WHERE identity_id IN(${ids});DELETE FROM hub_scored_evaluation_attempts WHERE identity_id IN(${ids});DELETE FROM hub_evaluation_attempt_sets WHERE identity_id IN(${ids});
DELETE FROM hub_content_review_events WHERE content_version_id IN(SELECT id FROM hub_content_versions WHERE definition_kind='activity' AND definition_id='${activityId}');DELETE FROM hub_content_versions WHERE definition_kind='activity' AND definition_id='${activityId}';
DELETE FROM hub_theory_question_versions WHERE stable_code='${questionCode}' AND author_id IN(${ids});
DELETE FROM hub_evidence_events WHERE attempt_id IN(SELECT id FROM hub_attempts WHERE module_progress_id IN(SELECT id FROM hub_module_progress WHERE course_id='${courseId}'));DELETE FROM hub_activity_attempts WHERE module_id='${moduleId}';DELETE FROM hub_attempts WHERE module_id='${moduleId}';DELETE FROM hub_module_progress WHERE course_id='${courseId}';DELETE FROM hub_enrolments WHERE course_id='${courseId}';DELETE FROM hub_activities WHERE module_id='${moduleId}';DELETE FROM hub_modules WHERE course_id='${courseId}';DELETE FROM hub_courses WHERE id='${courseId}';
DO $$ DECLARE r RECORD;BEGIN FOR r IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND c.column_name='session_id' AND t.table_type='BASE TABLE' LOOP EXECUTE format('DELETE FROM public.%I WHERE session_id IN(SELECT id FROM formal_fixture_sessions)',r.table_name);END LOOP;END;$$;
DELETE FROM trainee_sessions WHERE id IN(SELECT id FROM formal_fixture_sessions);DELETE FROM hub_idempotency_keys WHERE identity_id IN(${ids});DELETE FROM hub_role_assignments WHERE identity_id IN(${ids});DELETE FROM hub_identities WHERE id IN(${ids});COMMIT;`);
  for(const person of people)if(person.authId)checked(await supabase.auth.admin.deleteUser(person.authId),'Auth cleanup');
  if(original)assert.deepEqual(checked(await supabase.from('hub_scored_evaluations').select('*').eq('id',evaluationId).single(),'restored policy'),original);
  assert.equal(checked(await supabase.from('hub_identities').select('id').in('id',people.map(p=>p.id)),'fixture cleanup').length,0);report.cleanupPassed=true;
 }catch(error){report.cleanupPassed=false;report.cleanupFailure=error.message;console.error('Formal browser fixture cleanup failed:',error);process.exitCode=1;}
 fs.mkdirSync(path.join(root,'outputs'),{recursive:true});fs.writeFileSync(path.join(root,'outputs/hub-formal-browser-local.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
