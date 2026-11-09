import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '../../frontend/node_modules/playwright/index.mjs';

const args=process.argv.slice(2),option=name=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
assert.ok(args.includes('--confirm-fixtures'));
const project=option('project'),configFile=option('config'),revision=option('revision');
assert.match(project||'',/^[a-z]{20}$/);assert.ok(path.isAbsolute(configFile||''));assert.match(revision||'',/^[a-f0-9]{40}$/);
const config=dotenv.parse(fs.readFileSync(configFile));assert.equal(new URL(config.SUPABASE_URL).hostname,`${project}.supabase.co`);
const client=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const origin='https://trainee-simulator.vercel.app',token=randomUUID().replaceAll('-','').slice(0,16),password=randomBytes(24).toString('base64url');
const prefix=`A${token}`,created=[],contexts=[];
const report={generatedAt:new Date().toISOString(),revision,project,checks:[]};
const output=option('report')||'outputs/ui-ux-2026-11-08/hosted.json';
const checked=(result,label)=>{if(result.error)throw new Error(label);return result.data;};
let browser,phase='deployment readiness';
async function login(username,secret,temporary=false){
 const context=await browser.newContext();contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(20000);
 const violations=[];await page.addInitScript(()=>{window.__cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.__cspViolations.push(event.violatedDirective));});
 await page.goto(`${origin}/hub`);await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(secret);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 if(temporary){
  await page.getByRole('heading',{name:'Choose your own password'}).waitFor();
  assert.equal((await context.request.get(`${origin}/api/hub/learning-path`)).status(),403);
  await page.getByLabel('Current password',{exact:true}).fill(secret);await page.getByLabel('New password',{exact:true}).fill(randomBytes(24).toString('base64url'));
  const changed=page.waitForResponse(response=>response.url().endsWith('/api/hub/auth/password')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Change password',exact:true}).click();
  assert.equal((await changed).status(),200,'Password replacement request failed');
  await page.getByRole('heading',{name:'Choose your own password'}).waitFor({state:'hidden'});
 }
 await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 violations.push(...await page.evaluate(()=>window.__cspViolations));assert.equal(violations.length,0,'CSP blocked application resources');
 return {context,page};
}
async function post(session,url,body){
 const csrf=await session.context.request.get(`${origin}/api/hub/auth/csrf`);assert.equal(csrf.status(),200);
 return session.context.request.post(`${origin}/api/hub${url}`,{headers:{origin,'x-trez-csrf':(await csrf.json()).csrfToken},data:body});
}
try{
 const ready=await fetch(`${origin}/api/ready`);assert.equal(ready.status,200);const state=await ready.json();assert.equal(state.revision,revision);report.readiness=state;
 const html=await fetch(`${origin}/hub`);assert.ok(html.headers.get('content-security-policy')?.includes("script-src 'self'"));report.checks.push('Exact backend revision ready; CSP enforced');
 phase='controlled bootstrap';
 const auth=checked(await client.auth.admin.createUser({email:`${prefix.toLowerCase()}admin@auth.trez.invalid`,password,email_confirm:true}),'Create fixture Auth');created.push({authId:auth.user.id});
 const identity=checked(await client.from('hub_identities').insert({auth_user_id:auth.user.id,external_subject_reference:auth.user.id,username:`${prefix}admin`,email:`${prefix.toLowerCase()}admin@auth.trez.invalid`,first_name:'Audit',surname:`${token}admin`,display_name:`Audit ${token}admin`}).select('id').single(),'Create fixture identity');created[0].id=identity.id;
 const role=checked(await client.from('hub_roles').select('id').eq('code','admin').single(),'Read role');checked(await client.from('hub_role_assignments').insert({identity_id:identity.id,role_id:role.id}),'Assign fixture role');
 browser=await chromium.launch({headless:true});const admin=await login(`${prefix}admin`,password);
 phase='new staff account';
 const staffResponse=await post(admin,'/admin/accounts',{firstName:'Audit',surname:`${token}staff`,roles:['trainer'],preferredLocale:'en'});assert.equal(staffResponse.status(),201);
 const staff=await staffResponse.json();assert.ok(staff.initialPassword?.length>=24);assert.notEqual(staff.initialPassword,staff.identity.username);
 const trainer=await login(staff.identity.username,staff.initialPassword,true);report.checks.push('New staff random temporary credential; mandatory replacement; persisted login');
 phase='new learner account';
 const learnerResponse=await post(trainer,'/staff/postulantes',{firstName:'Audit',surname:`${token}learner`});assert.equal(learnerResponse.status(),201,`Learner creation HTTP ${learnerResponse.status()}`);const learner=await learnerResponse.json();
 const learnerSession=await login(learner.identity.username,learner.initialPassword,true);report.checks.push('Learner temporary password replacement and reload');
 phase='directory and diagnostics';
 const directory=await trainer.context.request.get(`${origin}/api/hub/trainer/postulantes?search=${token}&limit=1`);assert.equal(directory.status(),200);assert.match(directory.headers()['cache-control'],/no-store/);
 const data=await directory.json();assert.equal(data.page.total,1);assert.equal(data.postulantes[0].id,learner.identity.id);assert.ok(!JSON.stringify(data).includes('initialPassword'));report.directoryBytes=Buffer.byteLength(JSON.stringify(data));
 assert.equal((await learnerSession.context.request.get(`${origin}/api/hub/trainer/postulantes`)).status(),403);
 assert.equal((await trainer.context.request.get(`${origin}/api/hub/admin/runtime-metrics`)).status(),403);
 const metrics=await admin.context.request.get(`${origin}/api/hub/admin/runtime-metrics`);assert.equal(metrics.status(),200);const diagnostic=await metrics.json();assert.ok(diagnostic.queue);report.queue=diagnostic.queue;
 report.checks.push('Bounded filtered directory, private no-store responses, learner/staff role denials, ADMIN queue diagnostics');
 phase='task workspaces';
 await trainer.page.setViewportSize({width:390,height:844});await trainer.page.goto(origin+'/hub#hub-management');
 await trainer.page.getByRole('searchbox',{name:'Search Participants',exact:true}).fill(token);
 await trainer.page.getByRole('button',{name:'Search directory',exact:true}).click();
 const person=trainer.page.getByRole('button',{name:'Audit '+token+'learner',exact:true});await person.waitFor();
 assert.ok((await person.boundingBox()).y<844,'Learner action should be visible on mobile');
 await person.click();await trainer.page.getByRole('heading',{name:'Audit '+token+'learner',exact:true}).waitFor();
 await trainer.page.getByRole('link',{name:'Coaching',exact:true}).last().click();await trainer.page.getByLabel('Coaching note',{exact:true}).waitFor();
 await trainer.page.getByRole('button',{name:'Back to learners',exact:true}).click();assert.equal(await trainer.page.getByRole('searchbox',{name:'Search Participants',exact:true}).inputValue(),token);
 fs.mkdirSync(path.dirname(output),{recursive:true});await trainer.page.screenshot({path:path.join(path.dirname(output),'hosted-trainer-mobile.png'),fullPage:true});
 await learnerSession.page.goto(origin+'/hub#/results');await learnerSession.page.getByRole('heading',{name:'My results',exact:true}).waitFor();
 await learnerSession.page.getByRole('link',{name:'My account',exact:true}).click();await learnerSession.page.getByText('Change my password',{exact:true}).click();await learnerSession.page.getByLabel('Current password',{exact:true}).waitFor();
 report.checks.push('Mobile directory search and visible learner action, real learner detail and scoped coaching, return filter preserved, learner results and account settings');
 phase='staff reset';
 const reset=await post(admin,`/admin/identities/${staff.identity.id}/password-reset`,{});assert.equal(reset.status(),200);const resetData=await reset.json();assert.notEqual(resetData.initialPassword,staff.initialPassword);await login(staff.identity.username,resetData.initialPassword,true);
 report.checks.push('Staff reset issues a new random credential and requires replacement');
 report.passed=true;
}catch(error){report.passed=false;report.failedPhase=phase;report.failure=error.message.split('\n')[0].slice(0,200);process.exitCode=1;}
finally{
 for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close();
 try{
  // Exact generated usernames also recover a committed creation whose response was lost.
  const fixtures=checked(await client.from('hub_identities').select('id,auth_user_id,username,surname').in('username',[`${prefix}admin`,`${prefix}staff`,`${prefix}learner`]),'Read fixture cleanup inventory');
  for(const item of fixtures){assert.ok(item.surname.startsWith(token));checked(await client.from('hub_role_assignments').delete().eq('identity_id',item.id),'Remove fixture role');checked(await client.from('hub_identities').delete().eq('id',item.id).eq('surname',item.surname),'Remove fixture identity');checked(await client.auth.admin.deleteUser(item.auth_user_id),'Remove fixture Auth');}
  for(const item of created)if(!fixtures.some(row=>row.auth_user_id===item.authId))await client.auth.admin.deleteUser(item.authId);
  const remaining=checked(await client.from('hub_identities').select('id').in('username',[`${prefix}admin`,`${prefix}staff`,`${prefix}learner`]),'Verify cleanup');assert.equal(remaining.length,0);report.cleanupPassed=true;
 }catch{report.cleanupPassed=false;process.exitCode=1;}
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
