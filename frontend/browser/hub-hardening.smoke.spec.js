import {test,expect} from '@playwright/test';
const answer=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
test('temporary password screen blocks learning and retains entries on a rejected change',async({page})=>{
 let learningCalls=0;
 await page.route('**/api/hub/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/context'))return answer(route,{subject:{id:'fixture',roles:['POSTULANTE'],username:'Learner',mustChangePassword:true}});
  if(path.endsWith('/csrf'))return answer(route,{csrfToken:'fixture'});
  if(path.endsWith('/auth/password'))return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'Password could not be changed.'}})});
  if(path.endsWith('/learning-path'))learningCalls++;
  return answer(route,{});
 });
 await page.goto('/hub');await expect(page.getByRole('heading',{name:'Choose your own password'})).toBeVisible();
 await page.getByLabel('Current password',{exact:true}).fill('Fixture-temporary');
 await page.getByLabel('New password',{exact:true}).fill('Fixture-new-password');
 await page.getByRole('button',{name:'Change password',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('Password could not be changed.');
 await expect(page.getByLabel('New password',{exact:true})).toHaveValue('Fixture-new-password');expect(learningCalls).toBe(0);
});
test('trainer directory loads the next bounded page and searches beyond the loaded page',async({page})=>{
 const requests=[];
 await page.route('**/api/hub/**',route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path.endsWith('/context'))return answer(route,{subject:{id:'fixture',roles:['TRAINER'],displayName:'Trainer'}});
  if(path.endsWith('/trainer/postulantes')){
   requests.push(Object.fromEntries(url.searchParams));
   const searched=url.searchParams.get('search')==='Distant';
   const next=Boolean(url.searchParams.get('cursor'));
   return answer(route,{postulantes:[{id:searched?'3':next?'2':'1',displayName:searched?'Distant learner':next?'Second learner':'First learner',enrolments:[]}],page:{total:searched?1:2,nextCursor:searched||next?null:'00000000-0000-4000-8000-000000000001'}});
  }
  return answer(route,{});
 });
 await page.goto('/hub');await page.getByRole('link',{name:'Learner progress',exact:true}).first().click();
 await expect(page.getByText('Loaded 1 of 2 matching learners.')).toBeVisible();await page.getByRole('button',{name:'Load more',exact:true}).click();
 await expect(page.getByText('Loaded 2 of 2 matching learners.')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search learner progress'}).fill('Distant');await page.getByRole('button',{name:'Search directory',exact:true}).click();
 await expect(page.getByRole('rowheader',{name:'Distant learner'})).toBeVisible();expect(requests.at(-1).search).toBe('Distant');expect(requests.at(-1).cursor).toBeUndefined();
});
