import {expect,test} from '@playwright/test';

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
