import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const answer=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
const activity='10000000-0000-4000-8000-000000001101';
async function fixture(page,role){
  await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
  await page.route('**/api/hub/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/context'))return answer(route,{subject:{id:'accessibility-staff',roles:[role],displayName:'Accessibility fixture'}});
    if(path.endsWith('/csrf'))return answer(route,{csrfToken:'fixture'});
    if(path.endsWith('/learning-path'))return answer(route,{enrolments:[{id:'enrolment',course:{title:'Operator foundations'},modules:[{id:'module',position:1,title:'Verification',available:true,status:'in_progress',activities:[{id:activity,type:'article',title:'Verify the player',status:'not_started',content:{paragraphs:['Check the exact player before changing a balance.']}}]}]}]});
    if(path.endsWith('/scored-evaluations'))return answer(route,{evaluations:[]});
    if(path.endsWith('/admin/accounts'))return answer(route,{accounts:[]});
    if(path.endsWith('/admin/profile'))return answer(route,{firstName:'Access',surname:'Review',username:'Access'});
    if(path.endsWith('/staff/postulantes')||path.endsWith('/trainer/postulantes'))return answer(route,{postulantes:[]});
    if(path.endsWith('/staff/courses'))return answer(route,{courses:[]});
    if(path.endsWith('/assessment/settings'))return answer(route,{settings:{duration_minutes:30,minimum_operations:2,maximum_operations:6,operation_types:[],revision:1}});
    if(path.endsWith('/assessment/report'))return answer(route,{attempts:[],statistics:{}});
    if(path.endsWith('/assessment/evaluations'))return answer(route,{evaluations:[],gameFamilies:[],attemptSets:[],attempts:[],reopenEvents:[]});
    return answer(route,{});
  });
}
async function scan(page){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  expect(result.violations.map(({id,nodes})=>({id,targets:nodes.map(node=>node.target)}))).toEqual([]);
}
for(const role of ['ADMIN','TRAINER','RRHH','POSTULANTE'])test(`${role} Hub accessibility and 400-percent-equivalent reflow`,async({page})=>{
  await fixture(page,role);await page.goto('/hub#/learn');await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await scan(page);
  await page.setViewportSize({width:320,height:900});await scan(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(role!=='POSTULANTE'){
    const links=page.getByRole('navigation',{name:'Hub tools',exact:true}).getByRole('link');
    const names=await links.allTextContents();
    for(const name of names){await page.getByRole('link',{name:name.trim(),exact:true}).press('Enter');await scan(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  }
});

test('keyboard skip link reaches the workspace and hidden tools do not receive focus',async({page})=>{
  await fixture(page,'TRAINER');await page.goto('/hub#/learn');
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to workspace',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.locator('#hub-main-content')).toBeFocused();
  const curriculum=page.getByRole('link',{name:'Training content',exact:true});await curriculum.focus();await page.keyboard.press('Enter');
  for(let i=0;i<20;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement.closest('[hidden]')))).toBe(false);}
});

test('Hub remains usable with doubled text and reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await fixture(page,'ADMIN');await page.goto('/hub#/learn');
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
  await page.evaluate(()=>{const sizes=[...document.querySelectorAll('.hub-light-theme, .hub-light-theme *')].map(element=>[element,parseFloat(getComputedStyle(element).fontSize)]);for(const [element,size] of sizes)element.style.fontSize=`${size*2}px`;});
  await page.setViewportSize({width:1280,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();await scan(page);
});

const attemptId='10000000-0000-4000-8000-000000000499';
async function assessment(page,start){
  await fixture(page,'POSTULANTE');
  await page.route('**/api/hub/scored-evaluations',route=>answer(route,{evaluations:[{id:'evaluation',title:'Keyboard checkpoint',position:1,publication_status:'published',is_provisional:false,attemptsRemaining:2,attempts:[{id:attemptId,status:'in_progress',attempt_in_set:1}]}]}));
  return {status:'in_progress',expiresAt:new Date(start.getTime()+1800000).toISOString(),theorySubmitted:false,questions:[{code:'player',question:'Which player?',choices:[{id:'exact',label:'Exact assigned player'}]}],completedActions:0,totalActions:7,task:{action:'SEARCH_USER',game:'Orion Stars',customerUsername:'Practice player',identifier:'OS_Assess123',credit:100,availableBalance:1000}};
}
test('assessment keyboard transitions and readable retry errors retain entered data',async({page})=>{
  const view=await assessment(page,new Date());let failures=0;const writes=[];
  await page.route(`**/api/hub/scored-evaluations/attempts/${attemptId}/runtime/*`,route=>{
    const command=route.request().url().split('/').at(-1);
    if(command==='start')return answer(route,view);
    if(command==='theory'){view.theorySubmitted=true;return answer(route,view);}
    writes.push(route.request().postDataJSON());
    if(failures++===0)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'The action was not saved. Retry the same action.'}})});
    return answer(route,{...view,completedActions:1,task:{...view.task,action:'VERIFY_BALANCE'}});
  });
  await page.goto('/hub#/evaluations');await page.getByRole('button',{name:'Open assessment',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Formal assessment',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('radio',{name:'Exact assigned player',exact:true})).toBeFocused();await page.keyboard.press('Space');
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Record theory responses',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Formal assessment',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByLabel('Game ID',{exact:true})).toBeFocused();
  await page.keyboard.type('OS_Assess123');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeFocused();await expect(page.getByRole('alert')).toHaveText('The action was not saved. Retry the same action.');await expect(page.getByLabel('Game ID',{exact:true})).toHaveValue('OS_Assess123');
  await scan(page);await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Formal assessment',exact:true})).toBeFocused();await expect(page.getByText('Practical actions recorded: 1 / 7')).toBeVisible();expect(writes[0].idempotencyKey).toBe(writes[1].idempotencyKey);
});

test('deadline warnings are announced at milestones and expiry cannot submit extra actions',async({page})=>{
  const start=new Date('2026-11-04T12:00:00Z');await page.clock.install({time:start});const view=await assessment(page,start);let writes=0;
  await page.route(`**/api/hub/scored-evaluations/attempts/${attemptId}/runtime/*`,route=>{if(!route.request().url().endsWith('/start'))writes++;return answer(route,view);});
  await page.goto('/hub#/evaluations');await page.getByRole('button',{name:'Open assessment',exact:true}).click();await expect(page.getByRole('timer')).toHaveAttribute('aria-live','off');
  await page.clock.fastForward('25:01');await expect(page.getByText('Five minutes or less remain in this assessment.',{exact:true})).toBeVisible();
  await page.clock.fastForward('04:00');await expect(page.getByText('One minute or less remains in this assessment.',{exact:true})).toBeVisible();
  await page.clock.fastForward('01:00');await expect(page.getByText('Time has expired. Return to checkpoint results.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Record theory responses',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Record action',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Return to checkpoint results',exact:true})).toBeFocused();expect(writes).toBe(0);
  const refreshed=page.waitForResponse(response=>response.url().endsWith('/api/hub/scored-evaluations'));await page.keyboard.press('Enter');await refreshed;await page.clock.runFor(50);await expect(page.getByRole('heading',{name:'Checkpoint and readiness results',exact:true})).toBeFocused();
});
