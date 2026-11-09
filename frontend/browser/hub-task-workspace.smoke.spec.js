import {test,expect} from '@playwright/test';
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
const learner={id:'learner-1',username:'Alearner',displayName:'Ada Learner',status:'active',roles:['POSTULANTE'],enrolments:[]};
async function fixture(page,role='TRAINER'){
 const calls=[];
 await page.route('**/api/hub/**',route=>{const url=new URL(route.request().url()),path=url.pathname;calls.push(path+url.search);
 if(path.endsWith('/context'))return json(route,{subject:{id:'actor',displayName:'Staff member',roles:[role]}});
 if(path.endsWith('/csrf'))return json(route,{csrfToken:'fixture'});
 if(path.endsWith('/learning-path'))return json(route,{enrolments:[]});
 if(path.endsWith('/scored-evaluations'))return json(route,{evaluations:[{id:'eval',title:'Checkpoint',attempts:[{id:'attempt',attempt_in_set:1,status:'scored',score:100}]}]});
 if(path.endsWith('/trainer/postulantes/learner-1'))return json(route,{postulante:learner});
 if(path.endsWith('/staff/postulantes')||path.endsWith('/trainer/postulantes'))return json(route,{postulantes:url.searchParams.get('search')==='missing'?[]:[learner],page:{total:url.searchParams.get('search')==='missing'?0:1,nextCursor:null,retrievedAt:'2026-11-08T12:00:00Z'}});
 if(path.endsWith('/staff/courses'))return json(route,{courses:[]});
 if(path.endsWith('/assessment/settings'))return json(route,{settings:{operation_types:[]}});
 if(path.endsWith('/assessment/report'))return json(route,{attempts:[],statistics:{}});
 if(path.endsWith('/notes'))return json(route,{notes:[],nextCursor:null});
 if(path.endsWith('/evidence'))return json(route,{attempts:[]});
 return json(route,{});
 });return calls;
}
test('mobile learner directory submits search, preserves return context and opens scoped coaching',async({page})=>{
 const calls=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/hub#hub-management');
 const search=page.getByRole('searchbox',{name:'Search Participants',exact:true});await expect(search).toBeVisible();
 const row=page.getByRole('button',{name:'Ada Learner',exact:true});await expect(row).toBeVisible();expect((await row.boundingBox()).y).toBeLessThan(844);
 await expect(page.getByLabel('First name',{exact:true})).toHaveCount(0);
 await search.fill('Ada');await expect(page.getByText('Search changes are not applied yet.')).toBeVisible();await expect(row).toBeVisible();await search.press('Enter');
 await expect.poll(()=>calls.some(value=>value.includes('search=Ada'))).toBe(true);
 await row.click();await expect(page.getByRole('heading',{name:'Ada Learner'})).toBeVisible();await page.getByRole('link',{name:'Coaching',exact:true}).last().click();
 await expect(page.getByLabel('Coaching note')).toBeVisible();await page.getByLabel('Coaching note').fill('Retain this coaching draft.');
 await page.getByRole('link',{name:'Overview',exact:true}).click();await page.getByRole('link',{name:'Coaching',exact:true}).last().click();await expect(page.getByLabel('Coaching note')).toHaveValue('Retain this coaching draft.');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Back to learners'}).click();await expect(search).toHaveValue('Ada');await expect(row).toBeVisible();
 await page.screenshot({path:'../outputs/ui-ux-2026-11-08/trainer-mobile.png',fullPage:true});
 await search.fill('missing');await search.press('Enter');await expect(row).toHaveCount(0);await expect(page.getByText('Loaded 0 of 0 matching accounts.')).toBeVisible();
});
test('learner account and result routes never start an evaluation and keep scored separate from submitted',async({page})=>{
 const calls=await fixture(page,'POSTULANTE');await page.goto('/hub#/results');await expect(page.getByRole('heading',{name:'My results'})).toBeVisible();await expect(page.getByText(/Not yet submitted/)).toBeVisible();
 await page.getByRole('link',{name:'My account',exact:true}).click();await page.getByText('Change my password',{exact:true}).click();await expect(page.getByLabel('Current password',{exact:true})).toBeVisible();
 expect(calls.some(value=>/\/attempts/.test(value))).toBe(false);
 await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed manual refresh retains the previous attention snapshot',async({page})=>{
 await fixture(page);await page.goto('/hub');await expect(page.getByRole('heading',{name:'Needs attention'})).toBeVisible();
 await page.route('**/api/hub/trainer/postulantes',route=>json(route,{error:{}},503));await page.getByRole('button',{name:'Update snapshot',exact:true}).click();await expect(page.getByText('The snapshot could not be updated. Previously loaded records remain visible; retry Update.')).toBeVisible();await expect(page.locator('.hub-attention-list').getByText('Ada Learner',{exact:true})).toBeVisible();
});
