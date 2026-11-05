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
const reportPath=option('report')||path.join(root,'outputs/hub-training-assignments-2026-11-05/hosted.json');
const queryFile=path.join(root,'backend/.cache',`language-query-${token}.sql`);const manifestFile=path.join(root,'backend/.cache',`language-fixtures-${token}.json`);
const people=['postulante','admin','trainer','rrhh'].map((role,index)=>({id:randomUUID(),role,username:`L${token.slice(0,10)}${index}`,password:randomBytes(28).toString('base64url')}));
const contexts=[];let browser;let baseline=[];let baselineAssignments=[];let phase='initialization';
const checked=(result,label)=>{if(result.error)throw new Error(label);return result.data;};
const quoted=ids=>ids.map(id=>{assert.match(id,/^[a-f0-9-]{36}$/);return `'${id}'::uuid`;}).join(',');
const report={project,origin,generatedAt:new Date().toISOString(),checks:[],scope:'Disposable hosted roles; create one targeted assignment for the owned learner, acknowledge review and verify HR read-only access. No activity completion, competency verification, policy publication or assessment start.'};
function sql(query){fs.mkdirSync(path.dirname(queryFile),{recursive:true});fs.writeFileSync(queryFile,query);const result=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',project,'--file',queryFile],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});if(result.status!==0)throw new Error('Scoped hosted SQL failed');return JSON.parse(result.stdout).rows;}
function manifest(){fs.mkdirSync(path.dirname(manifestFile),{recursive:true});fs.writeFileSync(manifestFile,JSON.stringify({runId,project,people:people.map(({id,authId,role})=>({id,authId,role}))}));}
try{
 baseline=checked(await client.from('hub_identities').select('id'),'Baseline identities').map(row=>row.id);
 baselineAssignments=sql('SELECT id FROM hub_training_assignments;').map(row=>row.id);
 const roles=checked(await client.from('hub_roles').select('id,code'),'Roles');
 const course=checked(await client.from('hub_courses').select('id').eq('stable_code','trez-operator-foundations').single(),'Assigned curriculum');
 browser=await chromium.launch({headless:true});
 for(const person of people){
  phase=`create controlled ${person.role} fixture`;
  const email=`${person.username.toLowerCase()}@auth.trez.invalid`;
  const auth=checked(await client.auth.admin.createUser({email,password:person.password,email_confirm:true}),'Temporary Auth');person.authId=auth.user.id;manifest();
  checked(await client.from('hub_identities').insert({id:person.id,auth_user_id:person.authId,external_subject_reference:person.authId,email,username:person.username,first_name:'Language',surname:token,display_name:'Temporary language verification',preferred_locale:'en'}),'Temporary identity');
  checked(await client.from('hub_role_assignments').insert({identity_id:person.id,role_id:roles.find(role=>role.code===person.role).id}),'Temporary role');
  if(person.role==='postulante')checked(await client.from('hub_enrolments').insert({identity_id:person.id,course_id:course.id}),'Temporary course enrollment');
  const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(20000);
  phase=`real ${person.role} login`;
  await page.goto(`${origin}/hub`);await page.getByLabel('Username',{exact:true}).fill(person.username);await page.getByLabel('Password',{exact:true}).fill(person.password);
  await page.getByRole('button',{name:'Español',exact:true}).click();
  const loggedIn=page.waitForResponse(response=>response.url().endsWith('/api/hub/auth/login')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();assert.equal((await loggedIn).status(),200);
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
  assert.equal(await page.locator('.hub-app-shell').getAttribute('lang'),'es');
  if(person.role==='postulante'){
   await page.getByRole('heading',{name:'El siguiente paso, claro.',exact:true}).waitFor();
   await page.getByRole('link',{name:'Catálogo de módulos',exact:true}).click();
   await page.getByRole('heading',{name:'Catálogo de módulos',exact:true}).waitFor();
   await page.getByRole('link',{name:'Espacio de aprendizaje',exact:true}).click();
   phase='wait for deployed private display companions';let learning;
   for(let attempt=0;attempt<40;attempt++){
    const response=await context.request.get(`${origin}/api/hub/learning-path`);if(response.ok())learning=await response.json();
    if(learning?.displayTranslations?.revision==='2026-11-04.1')break;
    await new Promise(resolve=>setTimeout(resolve,5000));
   }
   assert.equal(learning?.displayTranslations?.revision,'2026-11-04.1','Deployed backend did not provide the new companion pack');
   const {displayTranslations,...canonical}=learning;report.learningPayloadBytes={canonical:Buffer.byteLength(JSON.stringify(canonical)),withTranslations:Buffer.byteLength(JSON.stringify(learning))};
   assert.ok(!JSON.stringify(displayTranslations).includes('What must be verified before changing customer credits?'));
   await page.reload();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
   await page.getByText('El saldo general del cliente y el saldo de cada juego son registros independientes.',{exact:true}).waitFor();
   await page.getByRole('link',{name:'Evaluaciones',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Iniciar siguiente intento',exact:true}).count(),0,'Real evaluation policies must remain draft');
   await page.getByRole('link',{name:'Espacio de aprendizaje',exact:true}).click();
   await page.setViewportSize({width:390,height:844});
   const imagePath=path.join(path.dirname(reportPath),'hosted-spanish-learner-mobile.png');fs.mkdirSync(path.dirname(imagePath),{recursive:true});await page.screenshot({path:imagePath,fullPage:true});
   report.checks.push('Hosted learner receives authorized Spanish curriculum, no private question bank, and no formal-start controls while policies are draft');
   report.checks.push('Hosted Spanish learner home, catalog and learning workspace navigation passed');
  }else{
   await page.locator('a[href="#hub-profile"]').click();await page.getByText('Cambiar mi contraseña',{exact:true}).waitFor();
  }
  if(person.role==='trainer'){
   phase='deployed targeted-assignment API';
   for(let attempt=0;attempt<40;attempt++){
    const ready=await context.request.get(`${origin}/api/hub/training-assignments?learnerId=${people[0].id}`);
    if(ready.ok()&&Array.isArray((await ready.json()).assignments))break;
    if(attempt===39)throw new Error('Deployed assignment API did not become available');
    await new Promise(resolve=>setTimeout(resolve,5000));
   }
   const modules=checked(await client.from('hub_modules').select('id').eq('course_id',course.id).order('position').limit(1),'Owned course module');assert.equal(modules.length,1);
   const csrf=(await context.cookies(origin)).find(cookie=>cookie.name==='trez_hub_csrf');assert.ok(csrf);
   const reason=`Temporary reinforcement verification ${token}`;
   const created=await context.request.post(`${origin}/api/hub/training-assignments`,{headers:{origin,'x-trez-csrf':csrf.value},data:{learnerId:people[0].id,moduleId:modules[0].id,purpose:'reinforcement',reason,expectedRevision:0,idempotencyKey:`assign-${token}`}});
   assert.equal(created.status(),200);const assigned=(await created.json()).assignment;assert.equal(assigned.status,'assigned');
   const learnerPage=contexts[0].pages()[0];await learnerPage.getByRole('link',{name:'My training',exact:true}).click();await learnerPage.getByRole('button',{name:'Open targeted training',exact:true}).click();
   await learnerPage.getByText(reason,{exact:true}).waitFor();const acknowledged=learnerPage.waitForResponse(response=>response.url().endsWith(`/training-assignments/${assigned.id}/acknowledge`));
   await learnerPage.getByRole('button',{name:'Confirm I reviewed this assignment',exact:true}).click();const acknowledgment=await acknowledged;assert.equal(acknowledgment.status(),200);
   const saved=(await acknowledgment.json()).assignment;assert.equal(saved.status,'acknowledged');assert.equal(saved.verification_attempt_id,null);
   await learnerPage.reload();await learnerPage.getByRole('button',{name:'Open targeted training',exact:true}).click();await learnerPage.getByText('Review recorded. Competency has not been verified by this acknowledgment.',{exact:true}).waitFor();
   report.checks.push('Hosted TRAINER created an owned reinforcement assignment; learner saw it, acknowledged review and recovered the acknowledgment after reload without competency verification');
  }
  if(person.role==='rrhh'){
   const visible=await context.request.get(`${origin}/api/hub/training-assignments?learnerId=${people[0].id}`);assert.equal(visible.status(),200);assert.equal((await visible.json()).assignments[0].status,'acknowledged');
   const csrf=(await context.cookies(origin)).find(cookie=>cookie.name==='trez_hub_csrf');assert.ok(csrf);
   const denied=await context.request.post(`${origin}/api/hub/training-assignments`,{headers:{origin,'x-trez-csrf':csrf.value},data:{}});assert.equal(denied.status(),403);
   report.checks.push('Hosted HR read the fixture assignment and was denied assignment creation');
  }
  await page.reload();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
  await page.getByRole('button',{name:'English',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  report.checks.push(`Real ${person.role} Spanish login/reload and English switch passed`);
 }
 report.passed=true;
}catch(error){report.passed=false;report.failedPhase=phase;report.failure=error.message.split('\n')[0].slice(0,200);process.exitCode=1;}
finally{
 for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
 const errors=[];const created=people.filter(person=>person.authId);const ids=quoted(created.map(person=>person.id));
 if(created.length){
  try{
   sql(`BEGIN;DO $$ DECLARE ref RECORD;n BIGINT;owned_assignments UUID[];owned_events UUID[];BEGIN
    IF EXISTS(SELECT 1 FROM hub_identities WHERE id IN (${ids}) AND (surname<>'${token}' OR display_name<>'Temporary language verification')) THEN RAISE EXCEPTION 'Fixture provenance mismatch';END IF;
    IF EXISTS(SELECT 1 FROM hub_training_assignments WHERE (learner_id IN (${ids}) OR assigned_by IN (${ids})) AND
     (learner_id<>'${people[0].id}'::uuid OR assigned_by<>'${people[2].id}'::uuid OR reason<>'Temporary reinforcement verification ${token}' OR status NOT IN('assigned','acknowledged') OR verification_attempt_id IS NOT NULL)) THEN RAISE EXCEPTION 'Assignment provenance mismatch';END IF;
    IF EXISTS(SELECT 1 FROM hub_training_assignment_events e WHERE e.actor_id IN (${ids}) AND NOT EXISTS(
     SELECT 1 FROM hub_training_assignments a WHERE a.id=e.assignment_id AND a.learner_id='${people[0].id}'::uuid AND a.assigned_by='${people[2].id}'::uuid AND a.reason='Temporary reinforcement verification ${token}')) THEN RAISE EXCEPTION 'External assignment event reference';END IF;
    SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO owned_assignments FROM hub_training_assignments WHERE learner_id='${people[0].id}'::uuid AND assigned_by='${people[2].id}'::uuid AND reason='Temporary reinforcement verification ${token}';
    SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO owned_events FROM hub_training_assignment_events WHERE assignment_id=ANY(owned_assignments);
    IF EXISTS(SELECT 1 FROM hub_training_assignment_events WHERE id=ANY(owned_events) AND (actor_id NOT IN(${ids}) OR command NOT IN('assign','acknowledge'))) THEN RAISE EXCEPTION 'External actor in fixture assignment history';END IF;
    FOR ref IN SELECT c.conrelid::regclass AS relation,a.attname,c.confrelid='hub_training_assignments'::regclass AS assignment_root FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid IN('hub_training_assignments'::regclass,'hub_training_assignment_events'::regclass) LOOP
     IF NOT(ref.assignment_root AND ref.relation='hub_training_assignment_events'::regclass AND ref.attname='assignment_id') THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE %I=ANY($1)',ref.relation,ref.attname) INTO n USING CASE WHEN ref.assignment_root THEN owned_assignments ELSE owned_events END;
      IF n>0 THEN RAISE EXCEPTION 'External fixture assignment dependency';END IF;
     END IF;
    END LOOP;
    FOR ref IN SELECT c.conrelid::regclass AS relation,a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid='hub_identities'::regclass LOOP
     IF ref.relation::text||'.'||ref.attname NOT IN ('hub_identities.id','hub_role_assignments.identity_id','hub_enrolments.identity_id','hub_idempotency_keys.identity_id','hub_training_assignments.learner_id','hub_training_assignments.assigned_by','hub_training_assignment_events.actor_id') THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE %I=ANY($1)',ref.relation,ref.attname) INTO n USING ARRAY[${ids}];
      IF n>0 THEN RAISE EXCEPTION 'Fixture acquired an external reference; preserve provenance';END IF;
     END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM hub_attempts WHERE module_progress_id IN(SELECT p.id FROM hub_module_progress p JOIN hub_enrolments e ON e.id=p.enrolment_id WHERE e.identity_id IN (${ids}))) THEN RAISE EXCEPTION 'Unexpected learning attempt; preserve evidence';END IF;
   END $$;
   SET LOCAL session_replication_role=replica;
   DELETE FROM hub_training_assignment_events WHERE assignment_id IN(SELECT id FROM hub_training_assignments WHERE learner_id='${people[0].id}'::uuid AND assigned_by='${people[2].id}'::uuid AND reason='Temporary reinforcement verification ${token}');
   DELETE FROM hub_training_assignments WHERE learner_id='${people[0].id}'::uuid AND assigned_by='${people[2].id}'::uuid AND reason='Temporary reinforcement verification ${token}';
   DELETE FROM hub_module_progress WHERE enrolment_id IN(SELECT id FROM hub_enrolments WHERE identity_id IN (${ids}));
   DELETE FROM hub_enrolments WHERE identity_id IN (${ids});DELETE FROM hub_idempotency_keys WHERE identity_id IN (${ids});DELETE FROM hub_role_assignments WHERE identity_id IN (${ids});DELETE FROM hub_identities WHERE id IN (${ids}) AND surname='${token}';COMMIT;`);
  }catch{errors.push('Fixture database cleanup');}
  for(const person of created){try{const deleted=await client.auth.admin.deleteUser(person.authId);if(deleted.error){const exists=sql(`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id='${person.authId}') AS exists;`)[0].exists;assert.equal(exists,false);}}catch{errors.push(`Fixture ${person.role} Auth cleanup`);await client.auth.admin.updateUserById(person.authId,{ban_duration:'876000h'});await client.from('hub_identities').update({status:'deactivated',deactivated_at:new Date().toISOString()}).eq('id',person.id);}}
 }
 try{const remaining=sql('SELECT id FROM hub_identities;').map(row=>row.id);assert.ok(baseline.every(id=>remaining.includes(id)));assert.ok(people.every(person=>!remaining.includes(person.id)));report.originalIdentitiesPreserved=baseline.length;}catch{errors.push('Identity preservation verification');}
 try{const remaining=sql('SELECT id,learner_id,assigned_by FROM hub_training_assignments;');assert.ok(baselineAssignments.every(id=>remaining.some(row=>row.id===id)));assert.ok(remaining.every(row=>!people.some(person=>[row.learner_id,row.assigned_by].includes(person.id))));report.originalAssignmentsPreserved=baselineAssignments.length;}catch{errors.push('Assignment preservation verification');}
 report.cleanupPassed=errors.length===0;if(errors.length){report.cleanupFailures=errors;process.exitCode=1;}
 if(!errors.length&&fs.existsSync(manifestFile))fs.unlinkSync(manifestFile);if(fs.existsSync(queryFile))fs.unlinkSync(queryFile);
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
