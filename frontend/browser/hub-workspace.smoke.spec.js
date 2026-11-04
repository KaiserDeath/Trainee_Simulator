import {expect,test} from '@playwright/test';
import {Buffer} from 'node:buffer';

const activityId='10000000-0000-4000-8000-000000001101';
const learnerId='10000000-0000-4000-8000-000000009001';
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});

async function staff(page,role){
  await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
  await page.route('**/api/hub/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/context'))return json(route,{subject:{id:'workspace-staff',roles:[role],displayName:'Workspace staff'}});
    if(path.endsWith('/csrf'))return json(route,{csrfToken:'fixture-csrf'});
    if(path.endsWith('/admin/accounts'))return json(route,{accounts:[]});
    if(path.endsWith('/trainer/postulantes'))return json(route,{postulantes:[]});
    if(path.endsWith('/staff/postulantes'))return json(route,{postulantes:[{id:learnerId,username:'Jfixture',displayName:'Fixture learner'}]});
    if(path.endsWith('/staff/courses'))return json(route,{courses:[]});
    if(path.endsWith('/assessment/settings'))return json(route,{settings:{duration_minutes:30,minimum_operations:2,maximum_operations:6,operation_types:[],revision:1}});
    if(path.endsWith('/assessment/report'))return json(route,{attempts:[],statistics:{attempts:0,progressOverTime:[]}});
    if(path.endsWith('/assessment/evaluations'))return json(route,{evaluations:[],gameFamilies:[],attemptSets:[],attempts:[],reopenEvents:[]});
    return json(route,{error:{message:'Unexpected fixture request'}},404);
  });
}

async function expectReadableWorkspace(page){
  const failures=await page.evaluate(()=>{
    const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
    const luminance=channels=>channels.slice(0,3).map(c=>{const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('.hub-main h2,.hub-main h3,.hub-main label,.hub-main input,.hub-main select,.hub-trainer-table th,.hub-trainer-table td,.hub-workspace-panel p,.hub-prose,.hub-sidebar a')].filter(el=>el.getClientRects().length&&!el.disabled).flatMap(el=>{
      const foreground=rgb(getComputedStyle(el).color);let node=el;let background=[255,255,255];
      while(node){const channels=rgb(getComputedStyle(node).backgroundColor);if(channels.length===3||channels[3]===1){background=channels;break;}node=node.parentElement;}
      const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      return ratio<4.5?[{text:(el.textContent||el.value||el.tagName).slice(0,50),ratio:ratio.toFixed(2)}]:[];
    });
  });
  expect(failures,'Workspace text must maintain at least 4.5:1 contrast').toEqual([]);
}

for(const role of ['ADMIN','TRAINER'])test(`${role} workspace uses readable light surfaces and role-specific section navigation`,async({page})=>{
  await staff(page,role);
  await page.route('**/api/hub/admin/accounts',route=>json(route,{accounts:[{id:'staff',username:'Admin',displayName:'Admin account',roles:['ADMIN'],status:'active'}]}));
  await page.route('**/api/hub/admin/profile',route=>json(route,{firstName:'Admin',surname:'Account',username:'Admin'}));
  await page.goto('/hub');
  await expect(page.getByRole('navigation',{name:'Hub tools',exact:true})).toBeVisible();
  const target=role==='ADMIN'?'People & access':'People, evaluations & reports';
  await page.getByRole('link',{name:target,exact:true}).click();
  await expect(page.getByRole('link',{name:target,exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('button',{name:'Open content catalog',exact:true})).toBeHidden();
  await expectReadableWorkspace(page);
  await page.screenshot({path:`../outputs/hub-light-${role.toLowerCase()}-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expectReadableWorkspace(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`../outputs/hub-light-${role.toLowerCase()}-mobile.png`,fullPage:true});
  await page.getByRole('link',{name:'Training content',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open content catalog',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link',{name:'Training content',exact:true})).toHaveAttribute('aria-current','page');
  await page.goBack();
  await expect(page.getByRole('link',{name:target,exact:true})).toHaveAttribute('aria-current','page');
  const skip=page.getByRole('link',{name:'Skip to workspace',exact:true});
  await skip.focus();await skip.press('Enter');
  await expect(page.getByRole('link',{name:target,exact:true})).toHaveAttribute('aria-current','page');
});

test('learner lessons use readable surfaces on desktop and mobile',async({page})=>{
  await staff(page,'POSTULANTE');
  await page.route('**/api/hub/learning-path',route=>json(route,{enrolments:[{id:'enrolment',status:'assigned',course:{title:'Operator foundations',description:'Learn, practise and prepare for your evaluation.'},modules:[{id:'module',title:'Understanding the work',position:1,status:'in_progress',available:true,activities:[{id:activityId,type:'article',title:'Verification comes first',status:'not_started',content:{paragraphs:['Confirm the exact customer and account before changing a balance.']}}]}]}]}));
  await page.goto('/hub');
  await expect(page.getByRole('heading',{name:'Verification comes first'})).toBeVisible();
  await expectReadableWorkspace(page);
  await page.screenshot({path:'../outputs/hub-light-learner-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expectReadableWorkspace(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../outputs/hub-light-learner-mobile.png',fullPage:true});
});

test('mobile administrator can reach staff password controls without horizontal scrolling',async({page})=>{
  await staff(page,'ADMIN');let reset=false;
  await page.route('**/api/hub/admin/accounts',route=>json(route,{accounts:[{id:learnerId,username:'Ttrainer',displayName:'Training supervisor',roles:['TRAINER'],status:'active'}]}));
  await page.route(`**/api/hub/admin/identities/${learnerId}/password-reset`,route=>{reset=true;return json(route,{});});
  await page.setViewportSize({width:390,height:844});await page.goto('/hub');
  const directory=page.locator('#hub-people .hub-mobile-directory');
  await expect(directory.getByText('Training supervisor',{exact:true})).toBeVisible();
  expect(await directory.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await directory.getByRole('button',{name:'Reset to username',exact:true}).click();
  await expect(page.getByText("Ttrainer's password was reset to Ttrainer.")).toBeVisible();expect(reset).toBe(true);
  await page.screenshot({path:'../outputs/hub-mobile-admin-account-cards.png',fullPage:true});
});

test('mobile trainer assigns a course and retries an inline name edit without losing the form',async({page})=>{
  await staff(page,'TRAINER');let patched;let fail=true;let assignment;
  let account={id:learnerId,username:'Flearner',firstName:'Fixture',surname:'Learner',displayName:'Fixture Learner',status:'active'};
  await page.route('**/api/hub/staff/postulantes',route=>json(route,{postulantes:[account]}));
  await page.route('**/api/hub/staff/courses',route=>json(route,{courses:[{id:activityId,title:'Operator foundations'}]}));
  await page.route(`**/api/hub/trainer/postulantes/${learnerId}/enrolments`,route=>{assignment=route.request().postDataJSON();return json(route,{enrolment:{}});});
  await page.route(`**/api/hub/staff/postulantes/${learnerId}`,route=>{
    patched=route.request().postDataJSON();if(fail){fail=false;return json(route,{error:{message:'Try saving again.'}},503);}
    account={...account,...patched,displayName:`${patched.firstName} ${patched.surname}`};return json(route,{identity:account});
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/hub');
  const directory=page.locator('.hub-assessment-admin .hub-mobile-directory');
  await expect(directory.getByText('Fixture Learner',{exact:true})).toBeVisible();
  expect(await directory.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await directory.getByRole('button',{name:'Assign',exact:true}).click();
  await expect(page.getByText('Course assigned to Fixture Learner.')).toBeVisible();expect(assignment.courseId).toBe(activityId);
  await directory.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Edit first name',{exact:true})).toBeFocused();
  await page.getByLabel('Edit first name',{exact:true}).fill('Revised');
  await page.getByRole('button',{name:'Save learner name',exact:true}).click();
  await expect(page.getByText('Try saving again.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Edit first name',{exact:true})).toHaveValue('Revised');
  await page.getByRole('button',{name:'Save learner name',exact:true}).click();
  await expect(page.getByText('Participant updated.',{exact:true})).toBeVisible();
  await expect(directory.getByText('Revised Learner',{exact:true})).toBeVisible();
  expect(patched).toEqual({firstName:'Revised',surname:'Learner'});
  await page.screenshot({path:'../outputs/hub-mobile-learner-account-cards.png',fullPage:true});
});

test('TRAINER creates a cohort and safely revises its date after reload',async({page})=>{
  await staff(page,'TRAINER');let cohorts=[];const submissions=[];
  const courseId='10000000-0000-4000-8000-000000000002';
  const cohortId='10000000-0000-4000-8000-000000000003';
  await page.route('**/api/hub/staff/courses',route=>json(route,{courses:[{id:courseId,title:'Operator foundations'}]}));
  await page.route('**/api/hub/cohorts**',route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();submissions.push(body);
      cohorts=[{id:cohortId,title:body.title,courseId,courseTitle:'Operator foundations',dueOn:body.dueOn,revision:body.expectedRevision+1,members:[{id:learnerId,displayName:'Fixture learner',status:'in_progress'}]}];
      return json(route,{cohort:cohorts[0]});
    }return json(route,{cohorts,nextCursor:null});
  });
  await page.goto('/hub');
  expect(submissions).toHaveLength(0);
  await page.getByRole('link',{name:'Cohorts & dates',exact:true}).click();await page.getByRole('button',{name:'Open cohorts',exact:true}).click();
  await page.getByLabel('Cohort name', {exact:true}).fill('November operators');
  await page.getByRole('combobox',{name:'Cohort course',exact:true}).selectOption(courseId);
  await page.getByLabel('Target date',{exact:true}).fill('2026-11-30');
  await page.getByRole('checkbox',{name:'Fixture learner',exact:true}).check();
  await page.getByRole('button',{name:'Save cohort',exact:true}).click();
  await expect(page.getByText('November operators',{exact:true})).toBeVisible();
  expect(submissions[0].learnerIds).toEqual([learnerId]);expect(submissions[0].idempotencyKey).toBeTruthy();
  await page.reload();await page.getByRole('button',{name:'Open cohorts',exact:true}).click();
  await page.getByRole('button',{name:'Edit November operators',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Cohort course',exact:true})).toBeDisabled();
  await page.getByLabel('Target date',{exact:true}).fill('2026-12-15');
  await page.getByRole('button',{name:'Save cohort',exact:true}).click();
  await expect(page.getByText(/December 15, 2026/)).toBeVisible();
  expect(submissions[1].expectedRevision).toBe(1);expect(submissions[1].learnerIds).toEqual([]);
  await page.getByRole('region',{name:'Cohort management',exact:true}).screenshot({path:'../outputs/hub-cohorts-desktop.png'});
});

test('learner sees own cohort date on mobile without membership or assignment controls',async({page})=>{
  await staff(page,'POSTULANTE');
  await page.route('**/api/hub/learning-path',route=>json(route,{course:{title:'Operator foundations'},modules:[]}));
  await page.route('**/api/hub/cohorts',route=>json(route,{cohorts:[{id:'cohort',title:'November operators',courseTitle:'Operator foundations',dueOn:'2026-11-30',members:null}],nextCursor:null}));
  await page.setViewportSize({width:390,height:844});await page.goto('/hub');
  await page.getByRole('button',{name:'Open cohorts',exact:true}).click();
  await expect(page.getByText('November operators',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save cohort',exact:true})).toHaveCount(0);
  await expect(page.getByText('View cohort members',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('region',{name:'My training groups',exact:true}).screenshot({path:'../outputs/hub-cohorts-mobile.png'});
});

test('cohort dates follow the selected Hub language across browser locale and time zone',async({browser})=>{
  const context=await browser.newContext({locale:'es-PE',timezoneId:'America/Los_Angeles'});
  try{
    const page=await context.newPage();await staff(page,'TRAINER');
    await page.route('**/api/hub/cohorts',route=>json(route,{cohorts:[{id:'date-fixture',title:'December group',courseTitle:'Foundations',dueOn:'2026-12-15',revision:1,members:[]}],nextCursor:null}));
    await page.goto('/hub');await page.getByRole('link',{name:'Cohorts & dates',exact:true}).click();await page.getByRole('button',{name:'Open cohorts',exact:true}).click();
    await expect(page.getByText(/December 15, 2026/)).toBeVisible();
    await page.getByRole('button',{name:'Español',exact:true}).click();
    await expect(page.getByText(/15 de diciembre de 2026/)).toBeVisible();
  }finally{await context.close();}
});

test('ADMIN edits an instruction draft and submits it through the publication workflow',async({page})=>{
  await staff(page,'ADMIN');let draft;let versions=[];
  await page.route('**/api/hub/workspace/catalog',route=>json(route,{courses:[],modules:[{id:'module',title:'Foundations'}],activities:[{id:activityId,module_id:'module',title:'Original lesson',activity_type:'article',content:{summary:'Original summary',paragraphs:['Original body'],surface:'protected'}}]}));
  await page.route(`**/api/hub/workspace/activities/${activityId}/versions`,route=>{
    if(route.request().method()==='POST'){draft=route.request().postDataJSON();versions=[{id:'version-fixture',version_number:1,status:'draft',content:{title:draft.title,instruction:draft.instruction},change_rationale:draft.changeRationale}];return json(route,{contentVersion:versions[0]});}
    return json(route,{versions});
  });
  await page.route('**/api/hub/admin/content-versions/version-fixture/submit',route=>{versions[0].status='pending_review';return json(route,{contentVersion:versions[0]});});
  await page.goto('/hub');await page.getByRole('link',{name:'Training content',exact:true}).click();await page.getByRole('button',{name:'Open content catalog'}).click();
  await page.getByRole('combobox',{name:'Activity',exact:true}).selectOption(activityId);
  await page.getByLabel('Lesson title').fill('Revised lesson');await page.getByLabel('Lesson text').fill('First paragraph\n\nSecond paragraph');
  await page.getByLabel('Reason for change').fill('Clarify operational verification');
  await page.getByRole('button',{name:'Create new draft'}).click();
  await expect(page.getByText('v1 · Draft',{exact:true})).toBeVisible();
  expect(draft.instruction.paragraphs).toEqual(['First paragraph','Second paragraph']);expect(draft.instruction).not.toHaveProperty('surface');
  await page.getByRole('button',{name:'Submit for review'}).click();await expect(page.getByText('v1 · Pending review',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve publication'})).toBeDisabled();
});

test('TRAINER saves a private note, reloads it, and starts a versioned revision',async({page})=>{
  await staff(page,'TRAINER');let notes=[];let submitted;
  await page.route(`**/api/hub/workspace/postulantes/${learnerId}/evidence`,route=>json(route,{attempts:[]}));
  await page.route(`**/api/hub/workspace/postulantes/${learnerId}/notes`,route=>{
    if(route.request().method()==='POST'){
      submitted=route.request().postDataJSON();notes=[{id:'note-fixture',attempt_id:null,retention_until:'2028-11-02T12:00:00Z',revisions:[{id:'revision-fixture',revision:1,status:submitted.status,body:submitted.body,created_at:'2026-11-02T12:00:00Z'}]}];return json(route,{note:notes[0]});
    }return json(route,{notes,nextCursor:null});
  });
  await page.goto('/hub');await page.getByRole('link',{name:'Coaching',exact:true}).click();await page.getByRole('button',{name:'Open coaching workspace'}).click();await page.getByRole('combobox',{name:'Participant',exact:true}).selectOption(learnerId);
  await page.getByRole('textbox',{name:'Coaching note',exact:true}).fill('Review the game history before acting.');await page.getByRole('button',{name:'Save private note'}).click();
  await expect(page.getByText('Private note saved.')).toBeVisible();expect(submitted.expectedRevision).toBe(0);expect(submitted.idempotencyKey).toBeTruthy();
  await page.reload();await page.getByRole('link',{name:'Coaching',exact:true}).click();await page.getByRole('button',{name:'Open coaching workspace'}).click();await page.getByRole('combobox',{name:'Participant',exact:true}).selectOption(learnerId);
  await expect(page.getByText('Review the game history before acting.').first()).toBeVisible();await page.getByRole('button',{name:'Add revision'}).click();await expect(page.getByRole('textbox',{name:'Coaching note',exact:true})).toHaveValue('Review the game history before acting.');
});

for(const own of [true,false])test(`coaching retention ${own?'prevents self-approval':'retries disposal safely and removes disposed text'}`,async({page})=>{
  await staff(page,'TRAINER');
  if(!own)await page.setViewportSize({width:390,height:844});
  const noteId='10000000-0000-4000-8000-000000007701',requestId='10000000-0000-4000-8000-000000007702';
  const author='10000000-0000-4000-8000-000000007703',reviewer='10000000-0000-4000-8000-000000007704';
  let disposed=false;const writes=[];
  await page.route(`**/api/hub/workspace/postulantes/${learnerId}/evidence`,route=>json(route,{attempts:[]}));
  await page.route(`**/api/hub/workspace/postulantes/${learnerId}/notes`,route=>json(route,{notes:[{id:noteId,retention_until:'2025-01-01T12:00:00Z',revisions:[{id:'revision',revision:1,status:'closed',body:'Old private coaching text',created_at:'2023-01-01T12:00:00Z'}]}],nextCursor:null}));
  await page.route(`**/api/hub/workspace/postulantes/${learnerId}/retention`,route=>{
    if(route.request().method()==='POST'){
      writes.push(route.request().postDataJSON());disposed=true;
      if(writes.length===1)return route.abort('failed');
      return json(route,{id:requestId,note_id:noteId,status:'disposed',disposed_revisions:1});
    }
    return json(route,{viewerId:own?author:reviewer,notes:disposed?[]:[{noteId,latestRevision:1,retainUntil:'2025-01-01T12:00:00Z',eligible:true,blockers:[]}],holds:[],requests:disposed?[]:[{id:requestId,note_id:noteId,requested_by:author,reason:'Closed note beyond retention'}],receipts:disposed?[{id:requestId,note_id:noteId,status:'disposed',disposed_revisions:1}]:[],nextCursor:null});
  });
  await page.goto('/hub');await page.getByRole('link',{name:'Coaching',exact:true}).click();await page.getByRole('button',{name:'Open coaching workspace'}).click();await page.getByRole('combobox',{name:'Participant',exact:true}).selectOption(learnerId);
  await page.getByRole('button',{name:'Open retention preview',exact:true}).click();
  if(own){await expect(page.getByRole('button',{name:'Review disposal',exact:true})).toBeDisabled();await expect(page.getByText('Another TRAINER must approve this request.',{exact:true})).toBeVisible();return;}
  await page.getByRole('button',{name:'Review disposal',exact:true}).click();
  const reason=page.getByRole('textbox',{name:'Brief reason (do not copy coaching text)',exact:true});await expect(reason).toBeFocused();await reason.fill('Independent review of eligibility completed');
  await expectReadableWorkspace(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'../outputs/hub-coaching-retention-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Approve and dispose',exact:true}).click();await expect(page.getByText('The retention action could not be recorded. Retry.',{exact:true})).toBeVisible();
  await expect(reason).toHaveValue('Independent review of eligibility completed');
  await page.getByRole('button',{name:'Approve and dispose',exact:true}).click();await expect(page.getByText('Retention action recorded.',{exact:true})).toBeVisible();
  expect(writes).toHaveLength(2);expect(writes[0].idempotencyKey).toBe(writes[1].idempotencyKey);expect(writes[1].command).toBe('approve');
  await expect(page.getByText('Old private coaching text',{exact:true})).toHaveCount(0);
});

test('TRAINER publishes a replacement evaluation policy with a reason and revision check',async({page})=>{
  await staff(page,'TRAINER');let submitted;
  const policy={id:'10000000-0000-4000-8000-000000000401',title:'Orion checkpoint',position:1,revision:3,publication_status:'published',duration_minutes:30,theory_weight:20,practical_weight:80,history_review_days:7,history_record_limit:null,selected_game_family_keys:['orion-stars'],theory_item_codes:['verification-first'],required_action_codes:['CREATE_ACCOUNT'],practical_item_weights:{CREATE_ACCOUNT:80}};
  await page.route('**/api/hub/assessment/evaluations',route=>json(route,{evaluations:[policy],gameFamilies:[{stable_key:'orion-stars',display_name:'Orion Stars',adapter_status:'verified'}],attemptSets:[],attempts:[],itemResults:[],reopenEvents:[]}));
  await page.route('**/api/hub/assessment/evaluations/*/publish-version',route=>{submitted=route.request().postDataJSON();return json(route,{evaluation:{...policy,revision:4,duration_minutes:45}},201);});
  await page.goto('/hub');await page.getByRole('button',{name:'Evaluations Rules & attempt reopening',exact:true}).click();
  await page.getByRole('button',{name:'Create policy version'}).click();
  await page.getByRole('spinbutton',{name:'Duration in minutes',exact:true}).fill('45');
  await page.getByRole('textbox',{name:'Publication reason',exact:true}).fill('Allow additional time for future attempts');
  await page.getByRole('button',{name:'Publish new policy version'}).click();
  await expect(page.getByText('Policy version 4 published. Existing attempts keep their original rules.')).toBeVisible();
  expect(submitted.expectedRevision).toBe(3);expect(submitted.configuration.duration_minutes).toBe(45);expect(submitted.configuration).not.toHaveProperty('max_attempts_per_set');
});

test('TRAINER edits a question by publishing a new version',async({page})=>{
  await staff(page,'TRAINER');let submitted;
  const question={id:'question-fixture',stable_code:'verification-first',version:1,question:'What must be checked before acting?',choices:[{id:'verify',label:'The exact evidence'},{id:'guess',label:'Guess from the name'}],correct_option:'verify',source:'Existing operator requirements'};
  await page.route('**/api/hub/assessment/questions',route=>{
    if(route.request().method()==='POST'){submitted=route.request().postDataJSON();return json(route,{question:{...question,id:'question-version-2',version:2,question:submitted.question}},201);}
    return json(route,{questions:[question]});
  });
  await page.goto('/hub');await page.getByRole('button',{name:'Evaluations Rules & attempt reopening',exact:true}).click();
  await page.getByRole('button',{name:'Open question bank'}).click();await page.getByRole('combobox',{name:'Question version',exact:true}).selectOption('question-fixture');
  await page.getByRole('textbox',{name:'Question text',exact:true}).fill('Which verified evidence must be checked before acting?');
  await page.getByRole('textbox',{name:'Question change reason',exact:true}).fill('Clarify the required verification');
  await page.getByRole('button',{name:'Publish question version'}).click();
  await expect(page.getByText('Question verification-first version 2 published. Opened assessments keep their captured question.')).toBeVisible();
  expect(submitted.expectedVersion).toBe(1);expect(submitted.correctOption).toBe('verify');expect(submitted.choices).toHaveLength(2);
});

test('ADMIN uploads a private training asset and cannot approve their own upload',async({page})=>{
  await staff(page,'ADMIN');let assets=[];let registration;let uploaded=false;let expiredKey;
  const assetId='10000000-0000-4000-8000-000000008801';
  await page.route('**/api/hub/media',route=>json(route,{assets}));
  await page.route('**/api/hub/media/uploads',route=>{registration=route.request().postDataJSON();if(!expiredKey){expiredKey=registration.idempotencyKey;return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({error:{message:'This upload registration expired. Upload a new asset version.'}})});}return json(route,{asset:{id:assetId},uploadUrl:`${new URL(route.request().url()).origin}/fixture-media-upload`});});
  await page.route('**/fixture-media-upload',route=>{uploaded=route.request().method()==='PUT';return json(route,{Key:'private-fixture'});});
  await page.route(`**/api/hub/media/${assetId}/complete`,route=>{assets=[{id:assetId,title:'Account verification guide',version:1,status:'pending_review',file_name:'sample.png',expected_size:13,source_reference:'Approved operator training guide',canReview:false}];return json(route,{asset:assets[0]});});
  await page.goto('/hub');await page.getByRole('link',{name:'Media library',exact:true}).click();await page.getByRole('button',{name:'Open media library',exact:true}).click();
  await page.getByRole('textbox',{name:'Resource code',exact:true}).fill('account-verification');await page.getByRole('textbox',{name:'Asset title',exact:true}).fill('Account verification guide');
  await page.getByLabel('Training file (25 MB maximum)',{exact:true}).setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('fixture-image')});
  await page.getByRole('textbox',{name:'Alternative text for images',exact:true}).fill('A training diagram of account verification');await page.getByRole('textbox',{name:'Source and approval reference',exact:true}).fill('Approved operator training guide');
  await page.getByRole('button',{name:'Upload private asset',exact:true}).click();
  await expect(page.getByText('This upload registration expired. Upload a new asset version.',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Asset title',exact:true})).toHaveValue('Account verification guide');
  await page.getByRole('button',{name:'Upload private asset',exact:true}).click();
  await expect(page.getByText('File stored privately. A different ADMIN must review publication.')).toBeVisible();expect(uploaded).toBe(true);expect(registration.mimeType).toBe('image/png');expect(registration.size).toBe(13);
  expect(registration.idempotencyKey).not.toBe(expiredKey);
  await page.getByRole('textbox',{name:'Media review reason',exact:true}).fill('Reviewed the training diagram');await expect(page.getByRole('button',{name:'Approve media publication',exact:true})).toBeDisabled();
});

test('ADMIN attaches a published media version to a lesson draft',async({page})=>{
  await staff(page,'ADMIN');let draft;
  const assetId='10000000-0000-4000-8000-000000008802';
  await page.route('**/api/hub/workspace/catalog',route=>json(route,{courses:[],modules:[{id:'module',title:'Foundations'}],activities:[{id:activityId,module_id:'module',title:'Media lesson',activity_type:'article',content:{summary:'Lesson'}}]}));
  await page.route(`**/api/hub/workspace/activities/${activityId}/versions`,route=>{if(route.request().method()==='POST'){draft=route.request().postDataJSON();return json(route,{contentVersion:{id:'media-version',status:'draft'}});}return json(route,{versions:[]});});
  await page.route('**/api/hub/media',route=>json(route,{assets:[{id:assetId,title:'Approved guide',version:2,status:'published'}]}));
  await page.goto('/hub');await page.getByRole('link',{name:'Training content',exact:true}).click();await page.getByRole('button',{name:'Open content catalog',exact:true}).click();await page.getByRole('combobox',{name:'Activity',exact:true}).selectOption(activityId);
  await page.getByRole('button',{name:'Choose published training assets',exact:true}).click();await page.getByRole('checkbox',{name:'Approved guide · v2',exact:true}).check();
  await page.getByRole('textbox',{name:'Reason for change',exact:true}).fill('Attach the approved reference guide');await page.getByRole('button',{name:'Create new draft',exact:true}).click();
  await expect(page.getByText('Draft created. Submit it for review.')).toBeVisible();expect(draft.instruction.mediaAssetIds).toEqual([assetId]);
});

test('reports and audit policies load on demand and CSV exports the applied report filters',async({page})=>{
  await staff(page,'TRAINER');let reportCalls=0;let policyCalls=0;let csvQuery;
  await page.route('**/api/hub/assessment/report*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('.csv')){csvQuery=url.searchParams;return route.fulfill({status:200,contentType:'text/csv',body:'Learner,Score\r\nFixture,100\r\n'});}
    reportCalls++;return json(route,{attempts:[],statistics:{attempts:0},filters:{status:'passed'}});
  });
  await page.route('**/api/hub/assessment/evaluations',route=>{policyCalls++;return json(route,{evaluations:[],gameFamilies:[],attemptSets:[],attempts:[],itemResults:[],reopenEvents:[]});});
  await page.goto('/hub');await expect(page.getByRole('heading',{name:'Trainer workspace',exact:true})).toBeVisible();expect(reportCalls).toBe(0);expect(policyCalls).toBe(0);
  await page.getByRole('button',{name:'Reports Results & performance',exact:true}).click();await expect(page.getByRole('button',{name:'Export filtered report CSV',exact:true})).toBeEnabled();expect(reportCalls).toBe(1);expect(policyCalls).toBe(0);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export filtered report CSV',exact:true}).click();expect((await downloaded).suggestedFilename()).toBe('training-assessment-report.csv');expect(csvQuery.get('status')).toBe('passed');
});
