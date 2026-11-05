import {test,expect} from '@playwright/test';
const learner='10000000-0000-4000-8000-000000000001';
const module='10000000-0000-4000-8000-000000000002';
const assignment='10000000-0000-4000-8000-000000000003';
const row={id:assignment,learner_id:learner,module_id:module,courseId:'course',moduleTitle:'Verification',purpose:'reinforcement',reason:'Review exact customer verification',status:'assigned',revision:1,created_at:'2026-11-05T12:00:00Z'};
async function fixture(page,role){
 const state={rows:[],writes:[],failOnce:false};
 await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
 await page.route('**/api/hub/**',route=>{
  const url=new URL(route.request().url());const path=url.pathname;let result={};
  if(path.endsWith('/context'))result={subject:{id:role==='POSTULANTE'?learner:'trainer',roles:[role],displayName:'Assignment fixture'}};
  if(path.endsWith('/csrf'))result={csrfToken:'fixture'};
  if(path.endsWith('/learning-path'))result={course:{id:'course',title:'Training'},modules:[{id:module,title:'Verification',activities:[]}]};
  if(path.endsWith('/scored-evaluations'))result={evaluations:[]};
  if(path.endsWith('/postulantes'))result={postulantes:[{id:learner,displayName:'Example learner',enrolments:[]}]};
  if(path.endsWith('/notes'))result={notes:[],nextCursor:null};
  if(path.endsWith('/evidence'))result={attempts:[]};
  if(path.endsWith('/training-assignments')&&route.request().method()==='GET')result={assignments:state.rows,moduleOptions:[{id:module,title:'Verification',courseTitle:'Training'}],nextCursor:null};
  if(path.includes('/training-assignments')&&route.request().method()==='POST'){
   const body=route.request().postDataJSON();state.writes.push({path,body});
   if(state.failOnce){state.failOnce=false;return route.fulfill({status:503,json:{error:{message:'Training assignments are temporarily unavailable.'}}});}
   if(path.endsWith('/acknowledge'))state.rows=state.rows.map(item=>({...item,status:'acknowledged',revision:2}));else state.rows=[{...row,reason:body.reason}];
   result={assignment:state.rows[0]};
  }
  return route.fulfill({json:result});
 });return state;
}
test('Capacitador assigns reinforcement with a visible reason and safely retries an uncertain save',async({page})=>{
 const state=await fixture(page,'TRAINER');state.failOnce=true;await page.goto('/hub#hub-coaching');
 await page.getByRole('button',{name:'Open coaching workspace',exact:true}).click();await page.getByRole('combobox',{name:'Participant',exact:true}).selectOption(learner);
 await page.getByRole('button',{name:'Open targeted training',exact:true}).click();
 await page.getByRole('combobox',{name:'Assigned module',exact:true}).selectOption(module);
 await page.getByRole('textbox',{name:'Reason visible to the learner (omit private credentials)',exact:true}).fill('Review exact customer verification');
 await page.getByRole('button',{name:'Create training assignment',exact:true}).click();await expect(page.getByText('Training assignments are temporarily unavailable.',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Reason visible to the learner (omit private credentials)',exact:true})).toHaveValue('Review exact customer verification');
 await page.getByRole('button',{name:'Create training assignment',exact:true}).click();await expect(page.getByText('Training assignment saved. Earlier learning and results were preserved.',{exact:true})).toBeVisible();
 expect(state.writes[0].body.idempotencyKey).toBe(state.writes[1].body.idempotencyKey);expect(state.writes[1].body.purpose).toBe('reinforcement');expect(state.writes[1].body.learnerId).toBe(learner);
 await expect(page.getByRole('button',{name:'Verify with later evidence',exact:true})).toBeDisabled();
});
test('learner acknowledgment stays distinct from competency and exposes no assignment administration',async({page})=>{
 const state=await fixture(page,'POSTULANTE');state.rows=[row];await page.goto('/hub');await page.getByRole('button',{name:'Open targeted training',exact:true}).click();
 await expect(page.getByRole('button',{name:'Create training assignment',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Confirm I reviewed this assignment',exact:true}).click();await expect(page.getByText('Review recorded. Competency has not been verified by this acknowledgment.',{exact:true})).toBeVisible();
 expect(state.writes).toHaveLength(1);expect(state.writes[0].path).toBe(`/api/hub/training-assignments/${assignment}/acknowledge`);expect(state.writes[0].body.expectedRevision).toBe(1);
 await page.getByRole('button',{name:'Español',exact:true}).click();await expect(page.getByText('Revisión registrada. Esta confirmación no verifica competencia.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Verificar con evidencia posterior',exact:true})).toHaveCount(0);
});
test('HR can read targeted assignments without trainer controls',async({page})=>{
 const state=await fixture(page,'RRHH');state.rows=[row];await page.goto('/hub#hub-coaching');
 await page.getByRole('button',{name:'Open coaching workspace',exact:true}).click();await page.getByRole('combobox',{name:'Participant',exact:true}).selectOption(learner);await page.getByRole('button',{name:'Open targeted training',exact:true}).click();
 await expect(page.getByText('Review exact customer verification',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create training assignment',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Cancel training assignment',exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(0);
});
