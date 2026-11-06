import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '../../frontend/node_modules/playwright/index.mjs';

const args=process.argv.slice(2);const option=name=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
assert.ok(args.includes('--confirm-fixtures'),'Explicit controlled hosted-fixture confirmation required.');
const project=option('project');assert.match(project||'',/^[a-z]{20}$/);
const configFile=option('config');assert.ok(configFile&&path.isAbsolute(configFile));
const config=dotenv.parse(fs.readFileSync(configFile));assert.equal(new URL(config.SUPABASE_URL).hostname,`${project}.supabase.co`);
const origin='https://trainee-simulator.vercel.app';
const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(30000)});
const client=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:request}});
const root=fileURLToPath(new URL('../../',import.meta.url));const runId=randomUUID();const token=runId.replaceAll('-','');
const reportPath=option('report')||path.join(root,'outputs/hub-bilingual-authoring-2026-11-05/hosted.json');
const queryFile=path.join(root,'backend/.cache',`bilingual-query-${token}.sql`);const manifestFile=path.join(root,'backend/.cache',`bilingual-fixtures-${token}.json`);
const people=['postulante','admin','admin','trainer'].map((role,index)=>({id:randomUUID(),role,username:`L${token.slice(0,10)}${index}`,password:randomBytes(28).toString('base64url')}));
const contexts=[];let browser;let phase='preflight';const courseId=randomUUID(),moduleId=randomUUID(),activityId=randomUUID();
const questionCode=`bilingual-question-${token.slice(0,12)}`;let baselineIdentities=[],baseline;
const title='Temporary bilingual verification lesson',english='Read the instruction assigned to this exact training version.',spanish='Lea la instrucción asignada a esta versión exacta de formación.';
const report={project,origin,generatedAt:new Date().toISOString(),runId,checks:[],scope:'Own disposable lesson, question and identities only. No existing curriculum edits, activity completion, evaluation publication, assessment starts or competency acceptance.'};
const checked=(result,label)=>{if(result.error)throw new Error(`${label}: ${result.error.code||'database error'}`);return result.data;};
const quoted=ids=>ids.map(id=>{assert.match(id,/^[a-f0-9-]{36}$/);return `'${id}'::uuid`;}).join(',');
function sql(query){fs.mkdirSync(path.dirname(queryFile),{recursive:true});fs.writeFileSync(queryFile,query);const result=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',project,'--file',queryFile],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});if(result.status!==0)throw new Error('Scoped hosted SQL failed');return JSON.parse(result.stdout).rows;}
function manifest(){fs.mkdirSync(path.dirname(manifestFile),{recursive:true});fs.writeFileSync(manifestFile,JSON.stringify({runId,project,courseId,moduleId,activityId,questionCode,people:people.map(({id,authId,role})=>({id,authId,role}))}));}
function protectedRecords(){return sql(`SELECT 'content' AS kind,id,md5(to_jsonb(v)::text) AS hash FROM hub_content_versions v WHERE definition_id<>'${activityId}' UNION ALL SELECT 'question',id,md5(to_jsonb(q)::text) FROM hub_theory_question_versions q WHERE stable_code<>'${questionCode}' UNION ALL SELECT 'policy',evaluation_id,md5(to_jsonb(p)::text) FROM hub_evaluation_policy_heads p UNION ALL SELECT 'evaluation',id,md5(to_jsonb(e)::text) FROM hub_scored_evaluations e ORDER BY kind,id;`);}
async function post(context,route,data={}){const cookie=(await context.cookies(`${origin}/api/hub`)).find(c=>c.name==='trez_hub_csrf');assert.ok(cookie);return context.request.post(`${origin}/api/hub/${route}`,{headers:{origin,'x-trez-csrf':cookie.value},data});}
async function accepted(response,status=200){assert.equal(response.status(),status);return response.json();}
try{
 baselineIdentities=checked(await client.from('hub_identities').select('id'),'baseline identities').map(row=>row.id);baseline=protectedRecords();
 const roles=checked(await client.from('hub_roles').select('id,code'),'roles');
 browser=await chromium.launch({headless:true});
 for(const person of people){phase=`create/login own ${person.role} fixture`;const email=`${person.username.toLowerCase()}@auth.trez.invalid`;
  const auth=checked(await client.auth.admin.createUser({email,password:person.password,email_confirm:true}),'Auth fixture');person.authId=auth.user.id;manifest();
  checked(await client.from('hub_identities').insert({id:person.id,auth_user_id:person.authId,external_subject_reference:person.authId,email,username:person.username,first_name:'Bilingual',surname:token,display_name:'Temporary bilingual verification',preferred_locale:'en'}),'identity fixture');
  checked(await client.from('hub_role_assignments').insert({identity_id:person.id,role_id:roles.find(role=>role.code===person.role).id}),'role fixture');
  const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(20000);
  await page.goto(`${origin}/hub`);await page.getByLabel('Username',{exact:true}).fill(person.username);await page.getByLabel('Password',{exact:true}).fill(person.password);
  const pending=page.waitForResponse(r=>r.url().endsWith('/auth/login'));await page.getByRole('button',{name:'Sign in',exact:true}).click();assert.equal((await pending).status(),200);await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 }
 phase='owned lesson setup';
 checked(await client.from('hub_courses').insert({id:courseId,stable_code:`bilingual-${token}`,title:'Temporary bilingual verification course'}),'course fixture');
 checked(await client.from('hub_modules').insert({id:moduleId,course_id:courseId,stable_code:'bilingual',position:1,title:'Temporary bilingual verification module'}),'module fixture');
 checked(await client.from('hub_activities').insert({id:activityId,module_id:moduleId,stable_code:'lesson',position:1,activity_type:'article',title,content:{paragraphs:['Initial temporary source']}}),'activity fixture');
 checked(await client.from('hub_enrolments').insert({identity_id:people[0].id,course_id:courseId}),'enrollment fixture');
 phase='deployed translation helpers';
 for(let i=0;i<60;i++){const response=await contexts[0].request.get(`${origin}/api/hub/learning-path`);const body=response.ok()?await response.json():{};if(body.displayTranslationStatus==='ready')break;if(i===59)throw new Error('Deployed bilingual enrichment did not become ready');await new Promise(r=>setTimeout(r,5000));}
 const author=contexts[1],reviewer=contexts[2],learner=contexts[0],trainer=contexts[3];
 phase='paired lesson publication through actual API';
 const source=(await accepted(await post(author,`workspace/activities/${activityId}/versions`,{title,instruction:{paragraphs:[english]},changeRationale:'Disposable bilingual delivery verification'}))).contentVersion;
 await accepted(await post(author,`admin/content-versions/${source.id}/submit`));
 const blocked=await post(reviewer,`admin/content-versions/${source.id}/review`,{decision:'approve',rationale:'Missing required Spanish must block publication'});assert.equal(blocked.status(),409);assert.equal((await blocked.json()).error.code,'HUB_TRANSLATION_REQUIRED');
 const draft=(await accepted(await post(author,`workspace/activities/${activityId}/translations`,{sourceVersionId:source.id,translations:{[title]:'Lección temporal de verificación bilingüe',[english]:spanish},rationale:'Exact Spanish counterpart for disposable delivery verification'}))).contentVersion;
 await accepted(await post(author,`admin/content-versions/${draft.id}/submit`));
 assert.equal((await post(author,`admin/content-versions/${draft.id}/review`,{decision:'approve',rationale:'Self approval must remain denied'})).status(),409);
 await accepted(await post(reviewer,`admin/content-versions/${draft.id}/review`,{decision:'approve',rationale:'Independently reviewed owned Spanish fixture'}));
 await accepted(await post(reviewer,`admin/content-versions/${source.id}/review`,{decision:'approve',rationale:'Independently reviewed matching owned English fixture'}));
 report.checks.push('Actual hosted author and separate administrator published an owned bilingual lesson; missing Spanish and self approval were denied');
 phase='hosted learner translation and isolation';
 const diagnostic=await accepted(await learner.request.get(`${origin}/api/hub/learning-path`));const projected=(diagnostic.enrolments||[]).flatMap(e=>e.modules||[]).flatMap(m=>m.activities||[]).find(a=>a.id===activityId);report.ownedLearningProjection={found:Boolean(projected),sourceMatches:projected?.content?.paragraphs?.includes(english),spanishMatches:projected?.displayTranslation?.es?.[english]===spanish,status:diagnostic.displayTranslationStatus};assert.ok(projected);assert.ok(report.ownedLearningProjection.sourceMatches);assert.ok(report.ownedLearningProjection.spanishMatches);

 const page=learner.pages()[0];await page.goto(`${origin}/hub#/courses/${courseId}/modules/${moduleId}`);await page.reload();await page.getByRole('button',{name:'Español',exact:true}).click();phase='Spanish lesson rendering';await page.getByText(spanish,{exact:true}).waitFor();
 phase='Spanish lesson after reload';await page.reload();await page.getByText(spanish,{exact:true}).waitFor();
 const learning=await accepted(await learner.request.get(`${origin}/api/hub/learning-path`));assert.equal(learning.displayTranslationStatus,'ready');
 assert.equal((await learner.request.get(`${origin}/api/hub/assessment/questions`)).status(),403);
 assert.equal((await post(learner,`workspace/activities/${activityId}/translations`,{})).status(),403);
 await page.setViewportSize({width:390,height:844});fs.mkdirSync(path.dirname(reportPath),{recursive:true});await page.screenshot({path:path.join(path.dirname(reportPath),'hosted-spanish-owned-lesson.png'),fullPage:true});
 await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText(english,{exact:true}).waitFor();
 report.checks.push('Learner saw owned Spanish lesson after reload and English after switching; private bank and author writes were denied');
 phase='private bilingual question publication';
 const question={code:questionCode,expectedVersion:0,question:'Which instruction belongs to this assigned training version?',choices:[{id:'exact',label:'The instruction from this exact version'},{id:'other',label:'An instruction from a different version'}],correctOption:'exact',source:'Disposable delivery verification',rationale:'Keep English and Spanish on the same immutable private version',spanish:{question:'¿Qué instrucción corresponde a esta versión de formación asignada?',choices:{exact:'La instrucción de esta versión exacta',other:'Una instrucción de otra versión'}},reviewedLanguages:true};
 const published=await accepted(await post(trainer,'assessment/questions',question),201);assert.ok(published);
 const bank=await accepted(await trainer.request.get(`${origin}/api/hub/assessment/questions`));const own=bank.questions.find(q=>q.code===questionCode||q.stable_code===questionCode);assert.ok(own);assert.deepEqual(own.displayTranslation.es.choices,question.spanish.choices);assert.equal(own.displayTranslation.es.question,question.spanish.question);
 const learnerAfterQuestion=await accepted(await learner.request.get(`${origin}/api/hub/learning-path`));assert.ok(!JSON.stringify(learnerAfterQuestion).includes(question.question));assert.ok(!JSON.stringify(learnerAfterQuestion).includes(question.spanish.question));
 report.checks.push('Actual hosted TRAINER published an owned English/Spanish private question version with identical answer IDs; authorized bank returned the Spanish companion');
 report.passed=true;
}catch(error){if(contexts[0]?.pages()[0]){try{fs.mkdirSync(path.dirname(reportPath),{recursive:true});await contexts[0].pages()[0].screenshot({path:path.join(path.dirname(reportPath),'hosted-owned-lesson-diagnostic.png'),fullPage:true});}catch{}}report.passed=false;report.failedPhase=phase;report.failure=error.message.split('\n')[0].slice(0,200);process.exitCode=1;}
finally{
 for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
 const errors=[];const ids=quoted(people.filter(p=>p.authId).map(p=>p.id));
 if(ids){try{sql(`BEGIN;DO $$ DECLARE ref RECORD;root_record RECORD;n BIGINT;owned_versions UUID[];root_ids UUID[];BEGIN
 IF EXISTS(SELECT 1 FROM hub_identities WHERE id IN(${ids}) AND (surname<>'${token}' OR display_name<>'Temporary bilingual verification')) THEN RAISE EXCEPTION 'Identity provenance mismatch';END IF;
 IF EXISTS(SELECT 1 FROM hub_courses WHERE id='${courseId}' AND stable_code<>'bilingual-${token}') OR EXISTS(SELECT 1 FROM hub_modules WHERE id='${moduleId}' AND course_id<>'${courseId}') OR EXISTS(SELECT 1 FROM hub_activities WHERE id='${activityId}' AND module_id<>'${moduleId}') THEN RAISE EXCEPTION 'Content provenance mismatch';END IF;
 IF EXISTS(SELECT 1 FROM hub_content_versions WHERE definition_id='${activityId}' AND (definition_kind<>'activity' OR author_identity_id NOT IN(${ids}) OR (reviewed_by_identity_id IS NOT NULL AND reviewed_by_identity_id NOT IN(${ids})))) THEN RAISE EXCEPTION 'External content author';END IF;
 IF EXISTS(SELECT 1 FROM hub_enrolments WHERE course_id='${courseId}' AND identity_id NOT IN(${ids})) OR EXISTS(SELECT 1 FROM hub_modules WHERE course_id='${courseId}' AND id<>'${moduleId}') OR EXISTS(SELECT 1 FROM hub_activities WHERE module_id='${moduleId}' AND id<>'${activityId}') THEN RAISE EXCEPTION 'External fixture content dependency';END IF;
 IF EXISTS(SELECT 1 FROM hub_activity_attempts WHERE activity_id='${activityId}') OR EXISTS(SELECT 1 FROM hub_attempts WHERE module_progress_id IN(SELECT p.id FROM hub_module_progress p JOIN hub_enrolments e ON e.id=p.enrolment_id WHERE e.course_id='${courseId}')) THEN RAISE EXCEPTION 'Unexpected attempt; preserve evidence';END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO owned_versions FROM hub_content_versions WHERE definition_id='${activityId}';
 IF EXISTS(SELECT 1 FROM hub_content_review_events WHERE content_version_id=ANY(owned_versions) AND actor_identity_id NOT IN(${ids})) THEN RAISE EXCEPTION 'External reviewer';END IF;
 FOR ref IN SELECT c.conrelid::regclass AS relation,a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid='hub_identities'::regclass LOOP
 IF ref.relation::text||'.'||ref.attname NOT IN('hub_identities.id','hub_role_assignments.identity_id','hub_enrolments.identity_id','hub_idempotency_keys.identity_id','hub_content_versions.author_identity_id','hub_content_versions.reviewed_by_identity_id','hub_content_review_events.actor_identity_id','hub_theory_question_versions.author_id') THEN EXECUTE format('SELECT count(*) FROM %s WHERE %I=ANY($1)',ref.relation,ref.attname) INTO n USING ARRAY[${ids}];IF n>0 THEN RAISE EXCEPTION 'External identity dependency';END IF;END IF;END LOOP;
 FOR root_record IN SELECT * FROM (VALUES
 ('hub_courses','${courseId}'),('hub_modules','${moduleId}'),('hub_activities','${activityId}')) AS roots(relation,id) LOOP
 root_ids:=ARRAY[root_record.id::uuid];
 FOR ref IN SELECT c.conrelid::regclass AS relation,a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid=to_regclass('public.'||root_record.relation) LOOP
 IF ref.relation::text||'.'||ref.attname NOT IN('hub_modules.course_id','hub_activities.module_id','hub_enrolments.course_id','hub_module_progress.course_id','hub_module_progress.module_id') THEN
 EXECUTE format('SELECT count(*) FROM %s WHERE %I=ANY($1)',ref.relation,ref.attname) INTO n USING root_ids;
 IF n>0 THEN RAISE EXCEPTION 'External content dependency';END IF;END IF;END LOOP;END LOOP;
 IF EXISTS(SELECT 1 FROM hub_module_progress WHERE (course_id='${courseId}' OR module_id='${moduleId}') AND enrolment_id NOT IN(SELECT id FROM hub_enrolments WHERE course_id='${courseId}' AND identity_id IN(${ids}))) THEN RAISE EXCEPTION 'External progress';END IF;
 IF EXISTS(SELECT 1 FROM hub_content_versions WHERE (author_identity_id IN(${ids}) OR reviewed_by_identity_id IN(${ids})) AND definition_id<>'${activityId}') OR EXISTS(SELECT 1 FROM hub_theory_question_versions WHERE author_id IN(${ids}) AND stable_code<>'${questionCode}') THEN RAISE EXCEPTION 'External authored content';END IF;
 END $$;
 SET LOCAL session_replication_role=replica;
 DELETE FROM hub_content_review_events WHERE content_version_id IN(SELECT id FROM hub_content_versions WHERE definition_id='${activityId}');
 DELETE FROM hub_content_versions WHERE definition_id='${activityId}' AND author_identity_id IN(${ids});
 DELETE FROM hub_theory_question_versions WHERE stable_code='${questionCode}' AND author_id IN(${ids});
 DELETE FROM hub_module_progress WHERE enrolment_id IN(SELECT id FROM hub_enrolments WHERE course_id='${courseId}' AND identity_id IN(${ids}));
 DELETE FROM hub_enrolments WHERE course_id='${courseId}' AND identity_id IN(${ids});
 DELETE FROM hub_activities WHERE id='${activityId}' AND module_id='${moduleId}';DELETE FROM hub_modules WHERE id='${moduleId}' AND course_id='${courseId}';DELETE FROM hub_courses WHERE id='${courseId}' AND stable_code='bilingual-${token}';
 DELETE FROM hub_idempotency_keys WHERE identity_id IN(${ids});DELETE FROM hub_role_assignments WHERE identity_id IN(${ids});DELETE FROM hub_identities WHERE id IN(${ids}) AND surname='${token}';COMMIT;`);}catch{errors.push('Owned database cleanup');}
 if(!errors.length)for(const person of people.filter(p=>p.authId)){try{checked(await client.auth.admin.deleteUser(person.authId),'Auth cleanup');}catch{errors.push('Owned Auth cleanup');}}
 }
 try{const remaining=checked(await client.from('hub_identities').select('id'),'preservation').map(r=>r.id);assert.ok(baselineIdentities.every(id=>remaining.includes(id)));assert.ok(people.every(p=>!remaining.includes(p.id)));assert.deepEqual(protectedRecords(),baseline);report.originalIdentitiesPreserved=baselineIdentities.length;report.originalProtectedRecordsPreserved=baseline.length;}catch{errors.push('Original record preservation');}
 report.cleanupPassed=!errors.length;if(errors.length){report.cleanupFailures=errors;process.exitCode=1;}else if(fs.existsSync(manifestFile))fs.unlinkSync(manifestFile);
 if(fs.existsSync(queryFile))fs.unlinkSync(queryFile);fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
