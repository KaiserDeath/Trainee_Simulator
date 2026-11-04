import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
fs.mkdirSync(new URL('../../outputs/hub-language-2026-11-04/',import.meta.url),{recursive:true});
const respond=(route,data)=>route.fulfill({json:data});
const paragraph="A customer's general balance and each individual game balance are separate records.";
const title='Understanding the Work';
const translations={
 [title]:'Comprender el trabajo',
 [paragraph]:'El saldo general del cliente y el saldo de cada juego son registros independientes.',
 'What must be verified before changing customer credits?':'¿Qué se debe verificar antes de modificar los créditos del cliente?',
 'The exact customer, licensed game access, amount and relevant histories':'El cliente exacto, el acceso al juego con licencia, el importe y los historiales relevantes',
};
async function fixture(page,role){
 await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
 await page.route('**/api/hub/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/context'))return respond(route,{subject:{id:`language-${role}`,displayName:'Language fixture',roles:[role],preferredLocale:'en'}});
  if(path.endsWith('/csrf'))return respond(route,{csrfToken:'fixture'});
  if(path.endsWith('/learning-path'))return respond(route,{displayTranslations:{es:translations},enrolments:[{id:'enrolment',course:{title},modules:[{id:'module',position:1,title,available:true,status:'in_progress',activities:[{id:'10000000-0000-4000-8000-000000001101',title,type:'article',status:'not_started',content:{paragraphs:[paragraph]}}]}]}]});
  if(path.endsWith('/scored-evaluations'))return respond(route,{evaluations:[]});
  if(path.endsWith('/admin/accounts'))return respond(route,{accounts:[]});
  if(path.endsWith('/admin/profile'))return respond(route,{firstName:'Maria',surname:'Fixture',username:'MariaFixture'});
  if(path.endsWith('/postulantes'))return respond(route,{postulantes:[]});
  if(path.endsWith('/courses'))return respond(route,{courses:[]});
  if(path.endsWith('/assessment/settings'))return respond(route,{settings:{duration_minutes:30,minimum_operations:2,maximum_operations:6,operation_types:[],revision:1}});
  if(path.endsWith('/assessment/report'))return respond(route,{attempts:[],statistics:{}});
  if(path.endsWith('/assessment/evaluations'))return respond(route,{evaluations:[],gameFamilies:[],attemptSets:[],attempts:[],reopenEvents:[]});
  if(path.endsWith('/workspace/catalog'))return respond(route,{modules:[],activities:[]});
  if(path.endsWith('/account-policies'))return respond(route,{policies:[],proposals:[]});
  if(path.endsWith('/media'))return respond(route,{assets:[]});
  if(path.endsWith('/questions'))return respond(route,{questions:[]});
  return respond(route,{});
 });
}
for(const role of ['ADMIN','TRAINER','RRHH','POSTULANTE'])test(`${role} uses a consistent Spanish Hub and retains the selection after reload`,async({page})=>{
 await fixture(page,role);await page.goto('/hub');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 await page.getByRole('button',{name:'Español',exact:true}).click();await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
 await expect(page.locator('.hub-app-shell')).toHaveAttribute('lang','es');
 if(role==='ADMIN'){
  await expect(page.getByRole('heading',{name:'Configuración del administrador',exact:true})).toBeVisible();
  await page.getByLabel('Nombre',{exact:true}).last().fill('Employee');
  await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByLabel('First name',{exact:true}).last()).toHaveValue('Employee');
  await page.getByRole('button',{name:'Español',exact:true}).click();
  for(const id of ['policies','curriculum','media','profile'])await page.locator(`a[href="#hub-${id}"]`).click();
  await page.screenshot({path:new URL('../../outputs/hub-language-2026-11-04/spanish-admin.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
 }else if(role==='POSTULANTE'){
  await expect(page.getByRole('heading',{name:'Comprender el trabajo',exact:true}).first()).toBeVisible();
  await expect(page.getByText(translations[paragraph],{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Marcar artículo como completado',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../../outputs/hub-language-2026-11-04/spanish-learner-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
 }else{
  await expect(page.getByRole('heading',{name:'Espacio del capacitador',exact:true})).toBeVisible();
  await page.locator('button[aria-controls="hub-workspace-reports"]').click();await expect(page.getByRole('button',{name:'Aplicar filtros',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Estado',exact:true}).selectOption('in_progress');
  const filtered=page.waitForRequest(request=>request.url().includes('/api/hub/assessment/report')&&new URL(request.url()).searchParams.get('status')==='in_progress');
  await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await filtered;
  await expect(page.getByRole('combobox',{name:'Estado',exact:true})).toHaveValue('in_progress');
  await page.locator('button[aria-controls="hub-workspace-evaluations"]').click();await expect(page.getByRole('heading',{name:'Cuatro evaluaciones con control de versiones',exact:true})).toBeVisible();
 }
 await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations.map(issue=>issue.id)).toEqual([]);
 await page.reload();await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Español',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
});

test('Spanish login validation and server errors stay readable when the language changes',async({page})=>{
 await page.route('**/api/hub/**',route=>route.fulfill({status:401,json:{error:{message:'Invalid username or password.'}}}));
 await page.goto('/hub');await page.getByRole('button',{name:'Español',exact:true}).click();
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByLabel('Usuario',{exact:true})).toBeFocused();
 expect(await page.getByLabel('Usuario',{exact:true}).evaluate(input=>input.validationMessage)).toBe('Complete este campo.');
 await page.getByLabel('Usuario',{exact:true}).fill('ExistingEmployee');await page.getByLabel('Contraseña',{exact:true}).fill('fixture-only');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('status')).toHaveText('El usuario o la contraseña son incorrectos.');
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByLabel('Username',{exact:true})).toHaveValue('ExistingEmployee');await expect(page.getByRole('status')).toHaveText('Invalid username or password.');
});

test('assessment language switching preserves answer IDs, entered values and the open attempt',async({page})=>{
 await fixture(page,'POSTULANTE');const attempt='10000000-0000-4000-8000-000000000499';let starts=0;const writes=[];
 const view={status:'in_progress',expiresAt:new Date(Date.now()+1800000).toISOString(),theorySubmitted:false,questions:[{code:'verification-first',question:'What must be verified before changing customer credits?',choices:[{id:'safe-choice',label:'The exact customer, licensed game access, amount and relevant histories'}]}],completedActions:0,totalActions:7,task:{action:'CREATE_ACCOUNT',game:'Orion Stars',customerUsername:'ExistingEmployee',identifier:'OS_Locale123',credit:100,availableBalance:1000},displayTranslations:{es:translations}};
 await page.route('**/api/hub/scored-evaluations',route=>respond(route,{evaluations:[{id:'evaluation',title:'Assessment fixture',position:1,publication_status:'published',is_provisional:false,attemptsRemaining:2,attempts:[{id:attempt,status:'in_progress',attempt_in_set:1}]}]}));
 await page.route(`**/api/hub/scored-evaluations/attempts/${attempt}/runtime/*`,route=>{
  const operation=route.request().url().split('/').at(-1);if(operation==='start'){starts++;return respond(route,view);}
  writes.push({operation,body:route.request().postDataJSON()});
  if(operation==='theory'){view.theorySubmitted=true;return respond(route,view);}
  return route.fulfill({status:503,json:{error:{message:'The action could not be recorded. Retry this action.'}}});
 });
 await page.goto('/hub');await page.getByRole('button',{name:'Open assessment',exact:true}).click();await page.getByRole('heading',{name:'Formal assessment',exact:true}).waitFor();
 await page.getByRole('button',{name:'Español',exact:true}).click();const radio=page.getByRole('radio',{name:translations[view.questions[0].choices[0].label],exact:true});await radio.check();
 await page.getByLabel('ID de juego',{exact:true}).fill('OS_Locale123');await page.getByLabel('Contraseña del juego',{exact:true}).fill('not-stored-fixture');const opened=starts;
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByRole('radio',{name:view.questions[0].choices[0].label,exact:true})).toBeChecked();expect(starts).toBe(opened);
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.getByRole('button',{name:'Registrar respuestas teóricas',exact:true}).click();await expect(page.getByText('Respuestas teóricas registradas.',{exact:true})).toBeVisible();
 expect(writes[0].body.answers).toEqual({'verification-first':'safe-choice'});
 await page.getByRole('button',{name:'Registrar acción',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('No se pudo registrar la acción. Reinténtela.');await expect(page.getByRole('alert')).toBeFocused();
 await expect(page.getByLabel('ID de juego',{exact:true})).toHaveValue('OS_Locale123');expect(writes[1].body.identifier).toBe('OS_Locale123');expect(writes[1].body.actionCode).toBe('CREATE_ACCOUNT');
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('The action could not be recorded. Retry this action.');
});
