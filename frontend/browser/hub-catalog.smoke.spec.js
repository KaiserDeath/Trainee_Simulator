import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
fs.mkdirSync(new URL('../../outputs/hub-navigation-2026-11-05/',import.meta.url),{recursive:true});
async function fixture(page,{empty=false}={}){
 const writes=[];
 await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
 await page.route('**/api/hub/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='POST')writes.push(path);
  let result={};
  if(path.endsWith('/context'))result={subject:{id:'catalog-person',displayName:'Catalog fixture',roles:['POSTULANTE']}};
  if(path.endsWith('/csrf'))result={csrfToken:'fixture'};
  if(path.endsWith('/learning-path'))result={enrolments:empty?[]:[
   {id:'enrolment-a',course:{id:'a',title:'Course Alpha'},modules:[{id:'a1',title:'First skill',status:'completed',available:true,activities:[{id:'article-a',type:'article',title:'First lesson',status:'completed',content:{paragraphs:['Completed foundation.']}}]}]},
   {id:'enrolment-b',course:{id:'b',title:'Course Beta'},modules:[{id:'b1',title:'Understanding the Work',position:1,available:true,activities:[{id:'article-b',type:'article',title:'Current lesson',content:{paragraphs:['Current authorized lesson.']}},{id:'ack-b',type:'acknowledgement',title:'Verification acknowledgement',content:{statement:'I checked the exact customer.'}}]},{id:'b2',title:'Locked practice',position:2,available:false,prerequisiteModuleIds:['b1'],activities:[{id:'article-locked',type:'article',title:'Restricted lesson',content:{paragraphs:['Do not display this until available.']}}]}]},
   {id:'withdrawn',status:'withdrawn',course:{id:'w',title:'Withdrawn course'},modules:[{id:'w1',title:'Withdrawn module'}]},
  ],displayTranslations:{es:{'Understanding the Work':'Comprender el trabajo'}}};
  if(path.endsWith('/scored-evaluations'))result={evaluations:[]};
  return route.fulfill({json:result});
 });return writes;
}
test('learner home resumes the next available module across courses and preserves direct links',async({page})=>{
 const writes=await fixture(page);await page.goto('/hub');
 await expect(page.getByRole('heading',{name:'A clear next step.',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Course Alpha',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Course Beta',exact:true})).toBeVisible();
 await expect(page.getByText('Withdrawn course',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Continue module',exact:true}).click();await expect(page).toHaveURL(/#\/courses\/b\/modules\/b1$/);
 await expect(page.getByText('Current authorized lesson.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Current authorized lesson.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Back to catalog',exact:true}).click();await expect(page.getByRole('heading',{name:'Module catalog',exact:true})).toBeFocused();
 await page.goBack();await expect(page.getByText('Current authorized lesson.',{exact:true})).toBeVisible();
 expect(writes).toEqual([]);
});
test('localized catalog filters survive reload and language switching without changing IDs',async({page})=>{
 await fixture(page);await page.goto('/hub#/catalog?course=b');await page.getByRole('button',{name:'Español',exact:true}).click();
 await page.getByLabel('Buscar módulos',{exact:true}).fill('Comprender');
 await expect(page.locator('.hub-catalog-card')).toHaveCount(1);await expect(page.getByRole('link',{name:'Ver módulo',exact:true})).toHaveAttribute('href','#/courses/b/modules/b1');
 await page.reload();await expect(page.getByLabel('Buscar módulos',{exact:true})).toHaveValue('Comprender');
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByLabel('Search modules',{exact:true})).toHaveValue('Comprender');
 await expect(page.getByRole('heading',{name:'No matching modules',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Reset filters',exact:true}).click();await expect(page.locator('.hub-catalog-card')).toHaveCount(3);
 await page.getByRole('combobox',{name:'Availability',exact:true}).selectOption('locked');await expect(page.locator('.hub-catalog-card')).toHaveCount(1);
 await page.getByRole('link',{name:'View module',exact:true}).click();await expect(page.getByText('Complete the listed prerequisites to open this module.',{exact:true})).toBeVisible();
 await expect(page.getByText('Do not display this until available.',{exact:true})).toHaveCount(0);
});
test('foreign and malformed module URLs show an unavailable state rather than another module',async({page})=>{
 await fixture(page);await page.goto('/hub#/courses/foreign/modules/b1');await expect(page.getByRole('heading',{name:'Module unavailable',exact:true})).toBeVisible();
 await expect(page.getByText('Current authorized lesson.',{exact:true})).toBeHidden();
 await page.goto('/hub#/courses/%zz/modules/b1');await expect(page.getByRole('heading',{name:'Module unavailable',exact:true})).toBeVisible();
});
test('canceling navigation keeps unsaved practice values and returning to the workspace preserves them',async({page})=>{
 await fixture(page);await page.goto('/hub#/courses/b/modules/b1');const checkbox=page.getByRole('checkbox',{name:'I checked the exact customer.',exact:true});await checkbox.check();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'Module catalog',exact:true}).click();
 await expect(page).toHaveURL(/#\/courses\/b\/modules\/b1$/);await expect(checkbox).toBeChecked();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Module catalog',exact:true}).click();await expect(page.getByRole('heading',{name:'Module catalog',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Learning workspace',exact:true}).click();await expect(checkbox).toBeChecked();
});
test('an empty learner assignment has useful home and catalog states',async({page})=>{
 await fixture(page,{empty:true});await page.goto('/hub');await expect(page.getByRole('heading',{name:'No training assigned yet',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Continue module',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Browse modules',exact:true}).click();await expect(page.getByRole('heading',{name:'No matching modules',exact:true})).toBeVisible();
});
test('new learner views remain accessible in Spanish at 320px and retain readable screenshots',async({page})=>{
 await fixture(page);await page.goto('/hub');await page.getByRole('button',{name:'Español',exact:true}).click();
 for(const [hash,name] of [['/home','home'],['/catalog','catalog'],['/courses/b/modules/b1','module']]){
  await page.goto(`/hub#${hash}`);await page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
  for(const width of [1440,320]){
   await page.setViewportSize({width,height:1000});
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
   expect(result.violations.map(({id,nodes})=>({id,targets:nodes.map(node=>node.target)}))).toEqual([]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`../outputs/hub-navigation-2026-11-05/${name}-es-${width}.png`,fullPage:true});
  }
 }
});
test('Capacitador home refreshes only on request and keeps the earlier snapshot on failure',async({page})=>{
 let reads=0;await fixture(page);
 await page.route('**/api/hub/context',route=>route.fulfill({json:{subject:{id:'catalog-trainer',displayName:'Trainer fixture',roles:['TRAINER']}}}));
 await page.route('**/api/hub/trainer/postulantes',route=>{reads++;return reads===1?route.fulfill({json:{postulantes:[{id:'person',displayName:'Example learner',enrolments:[]}]}}):route.fulfill({status:503,json:{error:{message:'unavailable'}}});});
 // The current client uses the staff endpoint for both TRAINER and RRHH.
 await page.route('**/api/hub/staff/postulantes*',route=>{reads++;return reads===1?route.fulfill({json:{postulantes:[{id:'person',displayName:'Example learner',enrolments:[]}]}}):route.fulfill({status:503,json:{error:{message:'unavailable'}}});});
 await page.goto('/hub');await expect(page.getByRole('heading',{name:'Turn progress into guidance.',exact:true})).toBeVisible();
 await expect(page.locator('.hub-staff-metrics')).toContainText('1');expect(reads).toBe(1);
 await page.getByRole('button',{name:'Update snapshot',exact:true}).click();await expect(page.getByText('The snapshot could not be updated. Previously loaded records remain visible; retry Update.',{exact:true})).toBeVisible();
 await expect(page.locator('.hub-staff-metrics')).toContainText('1');expect(reads).toBe(2);
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.setViewportSize({width:320,height:1000});
 const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations.map(({id})=>id)).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'../outputs/hub-navigation-2026-11-05/trainer-es-320.png',fullPage:true});
});
