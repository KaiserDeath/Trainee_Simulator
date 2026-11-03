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

test('ADMIN edits an instruction draft and submits it through the publication workflow',async({page})=>{
  await staff(page,'ADMIN');let draft;let versions=[];
  await page.route('**/api/hub/workspace/catalog',route=>json(route,{courses:[],modules:[{id:'module',title:'Foundations'}],activities:[{id:activityId,module_id:'module',title:'Original lesson',activity_type:'article',content:{summary:'Original summary',paragraphs:['Original body'],surface:'protected'}}]}));
  await page.route(`**/api/hub/workspace/activities/${activityId}/versions`,route=>{
    if(route.request().method()==='POST'){draft=route.request().postDataJSON();versions=[{id:'version-fixture',version_number:1,status:'draft',content:{title:draft.title,instruction:draft.instruction},change_rationale:draft.changeRationale}];return json(route,{contentVersion:versions[0]});}
    return json(route,{versions});
  });
  await page.route('**/api/hub/admin/content-versions/version-fixture/submit',route=>{versions[0].status='pending_review';return json(route,{contentVersion:versions[0]});});
  await page.goto('/hub');await page.getByRole('button',{name:'Open content catalog'}).click();
  await page.getByRole('combobox',{name:'Activity',exact:true}).selectOption(activityId);
  await page.getByLabel('Lesson title').fill('Revised lesson');await page.getByLabel('Lesson text').fill('First paragraph\n\nSecond paragraph');
  await page.getByLabel('Reason for change').fill('Clarify operational verification');
  await page.getByRole('button',{name:'Create new draft'}).click();
  await expect(page.getByText('v1 · draft',{exact:true})).toBeVisible();
  expect(draft.instruction.paragraphs).toEqual(['First paragraph','Second paragraph']);expect(draft.instruction).not.toHaveProperty('surface');
  await page.getByRole('button',{name:'Submit for review'}).click();await expect(page.getByText('v1 · pending_review',{exact:true})).toBeVisible();
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
  await page.goto('/hub');await page.getByRole('button',{name:'Open coaching workspace'}).click();await page.getByRole('combobox',{name:'Postulante',exact:true}).selectOption(learnerId);
  await page.getByRole('textbox',{name:'Coaching note',exact:true}).fill('Review the game history before acting.');await page.getByRole('button',{name:'Save private note'}).click();
  await expect(page.getByText('Private note saved.')).toBeVisible();expect(submitted.expectedRevision).toBe(0);expect(submitted.idempotencyKey).toBeTruthy();
  await page.reload();await page.getByRole('button',{name:'Open coaching workspace'}).click();await page.getByRole('combobox',{name:'Postulante',exact:true}).selectOption(learnerId);
  await expect(page.getByText('Review the game history before acting.').first()).toBeVisible();await page.getByRole('button',{name:'Add revision'}).click();await expect(page.getByRole('textbox',{name:'Coaching note',exact:true})).toHaveValue('Review the game history before acting.');
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
  await staff(page,'ADMIN');let assets=[];let registration;let uploaded=false;
  const assetId='10000000-0000-4000-8000-000000008801';
  await page.route('**/api/hub/media',route=>json(route,{assets}));
  await page.route('**/api/hub/media/uploads',route=>{registration=route.request().postDataJSON();return json(route,{asset:{id:assetId},uploadUrl:`${new URL(route.request().url()).origin}/fixture-media-upload`});});
  await page.route('**/fixture-media-upload',route=>{uploaded=route.request().method()==='PUT';return json(route,{Key:'private-fixture'});});
  await page.route(`**/api/hub/media/${assetId}/complete`,route=>{assets=[{id:assetId,title:'Account verification guide',version:1,status:'pending_review',file_name:'sample.png',expected_size:13,source_reference:'Approved operator training guide',canReview:false}];return json(route,{asset:assets[0]});});
  await page.goto('/hub');await page.getByRole('button',{name:'Open media library',exact:true}).click();
  await page.getByRole('textbox',{name:'Resource code',exact:true}).fill('account-verification');await page.getByRole('textbox',{name:'Asset title',exact:true}).fill('Account verification guide');
  await page.getByLabel('Training file (25 MB maximum)',{exact:true}).setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('fixture-image')});
  await page.getByRole('textbox',{name:'Alternative text for images',exact:true}).fill('A training diagram of account verification');await page.getByRole('textbox',{name:'Source and approval reference',exact:true}).fill('Approved operator training guide');
  await page.getByRole('button',{name:'Upload private asset',exact:true}).click();
  await expect(page.getByText('File stored privately. A different ADMIN must review publication.')).toBeVisible();expect(uploaded).toBe(true);expect(registration.mimeType).toBe('image/png');expect(registration.size).toBe(13);
  await page.getByRole('textbox',{name:'Media review reason',exact:true}).fill('Reviewed the training diagram');await expect(page.getByRole('button',{name:'Approve media publication',exact:true})).toBeDisabled();
});

test('ADMIN attaches a published media version to a lesson draft',async({page})=>{
  await staff(page,'ADMIN');let draft;
  const assetId='10000000-0000-4000-8000-000000008802';
  await page.route('**/api/hub/workspace/catalog',route=>json(route,{courses:[],modules:[{id:'module',title:'Foundations'}],activities:[{id:activityId,module_id:'module',title:'Media lesson',activity_type:'article',content:{summary:'Lesson'}}]}));
  await page.route(`**/api/hub/workspace/activities/${activityId}/versions`,route=>{if(route.request().method()==='POST'){draft=route.request().postDataJSON();return json(route,{contentVersion:{id:'media-version',status:'draft'}});}return json(route,{versions:[]});});
  await page.route('**/api/hub/media',route=>json(route,{assets:[{id:assetId,title:'Approved guide',version:2,status:'published'}]}));
  await page.goto('/hub');await page.getByRole('button',{name:'Open content catalog',exact:true}).click();await page.getByRole('combobox',{name:'Activity',exact:true}).selectOption(activityId);
  await page.getByRole('button',{name:'Choose published training assets',exact:true}).click();await page.getByRole('checkbox',{name:'Approved guide · v2',exact:true}).check();
  await page.getByRole('textbox',{name:'Reason for change',exact:true}).fill('Attach the approved reference guide');await page.getByRole('button',{name:'Create new draft',exact:true}).click();
  await expect(page.getByText('Draft created. Submit it for review.')).toBeVisible();expect(draft.instruction.mediaAssetIds).toEqual([assetId]);
});
