import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
fs.mkdirSync(new URL('../../outputs/hub-bilingual-authoring-2026-11-05/',import.meta.url),{recursive:true});
const activity='10000000-0000-4000-8000-000000000001';
const sourceId='10000000-0000-4000-8000-000000000002';
const translationId='10000000-0000-4000-8000-000000000003';
async function fixture(page,role='POSTULANTE'){
 const state={writes:[],translationFailure:false,failedSave:false,completed:false,versions:[{id:sourceId,locale:'en',version_number:1,status:'draft',change_rationale:'Fixture source',content:{title:'Draft lesson',instruction:{paragraphs:['New instructions.'],items:[{id:'private-id',label:'Verify exact ID.'}]}}}]};
 await page.routeWebSocket('**/socket.io/**',socket=>socket.close());
 await page.route('**/api/hub/**',route=>{
  const path=new URL(route.request().url()).pathname;let result={};const method=route.request().method();
  if(path.endsWith('/context'))result={subject:{id:'bilingual-'+role,displayName:'Authoring fixture',roles:[role]}};
  if(path.endsWith('/csrf'))result={csrfToken:'fixture'};
  if(path.endsWith('/postulantes'))result={postulantes:[]};
  if(path.endsWith('/admin/profile'))result={firstName:'Author',surname:'Fixture',username:'AuthorFixture'};
  if(path.endsWith('/admin/accounts'))result={accounts:[]};
  if(path.endsWith('/learning-path'))result={displayTranslationStatus:state.translationFailure?'unavailable':'ready',enrolments:[{id:'enrolment',course:{id:'course',title:'Course'},modules:[{id:'module',title:'Verification',activities:[{id:activity,title:'New lesson',type:'article',status:state.completed?'completed':'not_started',content:{paragraphs:['Mark article complete']},displayTranslation:state.translationFailure?null:{es:{'New lesson':'Lección revisada','Mark article complete':'Lea la instrucción revisada.'}}},{id:'acknowledgment',title:'Read agreement',type:'acknowledgement',content:{statement:'Keep my draft selection'},displayTranslation:state.translationFailure?null:{es:{'Keep my draft selection':'Conservar mi selección sin guardar'}}}]}]}]};
  if(path.endsWith('/scored-evaluations'))result={evaluations:[],displayTranslationStatus:'ready'};
  if(path.endsWith('/workspace/catalog'))result={courses:[],modules:[{id:'module',title:'Foundations'}],activities:[{id:activity,module_id:'module',title:'Original lesson',activity_type:'article',content:{paragraphs:['Original source']}}]};
  if(path.endsWith(`/activities/${activity}/versions`))result={versions:state.versions};
  if(method==='POST'){
   const body=route.request().postDataJSON();state.writes.push({path,body});
   if(path.endsWith('/translations')){
    if(state.failedSave){state.failedSave=false;return route.fulfill({status:503,json:{error:{message:'Content translations are temporarily unavailable.'}}});}
    const version={id:translationId,locale:'es',version_number:1,status:'draft',change_rationale:body.rationale,content:{displayTranslation:{sourceVersionId:body.sourceVersionId,sourceFingerprint:'fixture',es:body.translations}}};state.versions=[version,...state.versions];result={contentVersion:version};
   }
   if(path.endsWith(`/${translationId}/submit`)){state.versions[0].status='pending_review';result={contentVersion:state.versions[0]};}
   if(path.endsWith(`/activities/${activity}/complete`)){state.completed=true;result={saved:true};}
  }
  return route.fulfill({json:result});
 });return state;
}
test('ADMIN creates an exact-source Spanish draft, retains failed-save entries and submits it for separate review',async({page})=>{
 const state=await fixture(page,'ADMIN');state.failedSave=true;await page.goto('/hub');await page.getByRole('link',{name:'Training content',exact:true}).click();
 await page.getByRole('button',{name:'Open content catalog',exact:true}).click();await page.getByRole('combobox',{name:'Activity',exact:true}).selectOption(activity);
 await page.getByRole('button',{name:'Open translation editor',exact:true}).click();
 for(const [index,value] of ['Lección en borrador','Instrucciones nuevas.','Verifique el identificador exacto.'].entries())await page.getByRole('textbox',{name:`Spanish translation ${index+1}`,exact:true}).fill(value);
 await page.getByRole('textbox',{name:'Translation change reason',exact:true}).fill('Review the source and Spanish text together');
 await page.getByRole('button',{name:'Create Spanish translation draft',exact:true}).click();await expect(page.getByText('Content translations are temporarily unavailable.',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Spanish translation 1',exact:true})).toHaveValue('Lección en borrador');
 await page.getByRole('button',{name:'Create Spanish translation draft',exact:true}).click();await expect(page.getByText('Spanish draft created. Submit it for independent review before publishing the English version.',{exact:true})).toBeVisible();
 const submitted=state.writes.filter(row=>row.path.endsWith('/translations')).at(-1).body;
 expect(submitted.sourceVersionId).toBe(sourceId);expect(submitted.translations).toEqual({'Draft lesson':'Lección en borrador','New instructions.':'Instrucciones nuevas.','Verify exact ID.':'Verifique el identificador exacto.'});expect(submitted.translations).not.toHaveProperty('private-id');expect(submitted).not.toHaveProperty('sourceFingerprint');
 const spanish=page.locator('.hub-version-list > li').filter({hasText:'Spanish translation · v1'});await spanish.getByRole('button',{name:'Submit for review',exact:true}).click();await expect(spanish).toContainText('Pending review');
 expect(state.writes.some(row=>row.path.endsWith('/review'))).toBe(false);
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.setViewportSize({width:320,height:1000});
 await expect(page.getByRole('textbox',{name:'Traducción al español 1',exact:true})).toHaveValue('Lección en borrador');
 const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations.map(({id})=>id)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'../outputs/hub-bilingual-authoring-2026-11-05/spanish-authoring-mobile.png',fullPage:true});
});
test('scoped lesson text does not override interface actions and saved notices follow the pinned locale',async({page})=>{
 await fixture(page);await page.goto('/hub#/learn');await page.getByRole('button',{name:'Español',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Lección revisada',exact:true})).toBeVisible();await expect(page.getByText('Lea la instrucción revisada.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Marcar artículo como completado',exact:true}).click();await expect(page.getByText('Se guardó el progreso de Lección revisada.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByText('New lesson progress was saved.',{exact:true})).toBeVisible();
});
test('a translation read failure remains visible until that view refreshes and never misreports a saved action',async({page})=>{
 const state=await fixture(page);state.translationFailure=true;await page.goto('/hub#/learn');await page.getByRole('checkbox',{name:'Keep my draft selection',exact:true}).check();await page.getByRole('button',{name:'Español',exact:true}).click();
 const warning=page.getByText('Parte del contenido puede aparecer en su idioma original porque no se pudieron cargar las traducciones. Las acciones guardadas no se ven afectadas. Actualice la vista correspondiente para reintentar.',{exact:true});await expect(warning).toBeVisible();
 await expect(page.getByText('Mark article complete',{exact:true})).toBeHidden();
 // A ready response from the evaluation/bank scope must not clear the lesson failure.
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Evaluaciones',exact:true}).click();await expect(warning).toBeVisible();await page.getByRole('link',{name:'Espacio de aprendizaje',exact:true}).click();
 state.translationFailure=false;await page.getByRole('button',{name:'Actualizar traducciones del contenido',exact:true}).click();await expect(warning).toHaveCount(0);expect(state.writes).toHaveLength(0);
 await expect(page.getByRole('checkbox',{name:'Conservar mi selección sin guardar',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Marcar artículo como completado',exact:true}).click();await expect(page.getByText('Se guardó el progreso de Lección revisada.',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'Catálogo de módulos',exact:true}).click();await expect(page).toHaveURL(/#\/learn$/);
 expect(state.writes.filter(row=>row.path.endsWith('/complete'))).toHaveLength(1);
});
test('private question metadata distinguishes stem from identically worded choices while preserving answers',async({page})=>{
 await fixture(page);const attempt='10000000-0000-4000-8000-000000000099';let starts=0;const writes=[];const startKeys=[];
 await page.route('**/api/hub/scored-evaluations',route=>route.fulfill({json:{evaluations:[{id:'evaluation',title:'Fixture checkpoint',publicationStatus:'published',attemptsRemaining:2,attemptSet:{status:'open'},attempts:[{id:attempt,status:'in_progress',attempt_in_set:1}]}]}}));
 const view={status:'in_progress',expiresAt:new Date(Date.now()+3600000).toISOString(),completedActions:0,totalActions:1,theorySubmitted:false,questions:[{code:'same-wording',question:'Continue',choices:[{id:'one',label:'Continue'},{id:'two',label:'Stop'}],displayTranslation:{es:{question:'¿Cómo desea continuar?',choices:{one:'Continuar',two:'Detenerse'}}}}]};
 await page.route(`**/api/hub/scored-evaluations/attempts/${attempt}/runtime/*`,route=>{if(route.request().url().endsWith('/start')){starts++;startKeys.push(route.request().postDataJSON().idempotencyKey);}else{writes.push(route.request().postDataJSON());view.theorySubmitted=true;}return route.fulfill({json:view});});
 await page.goto('/hub#/evaluations');await page.getByRole('button',{name:'Open assessment',exact:true}).click();await page.getByRole('button',{name:'Español',exact:true}).click();
 await expect(page.getByText('¿Cómo desea continuar?',{exact:true})).toBeVisible();await page.getByRole('radio',{name:'Continuar',exact:true}).check();
 const opened=starts;await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByRole('radio',{name:'Continue',exact:true})).toBeChecked();expect(starts).toBe(opened);expect(new Set(startKeys).size).toBe(1);
 const recorded=page.waitForResponse(response=>response.url().endsWith('/runtime/theory'));await page.getByRole('button',{name:'Record theory responses',exact:true}).click();await recorded;expect(writes[0].answers).toEqual({'same-wording':'one'});expect(writes[0]).not.toHaveProperty('correctOption');
});
test('editing English question text invalidates only the affected Spanish draft and the review attestation',async({page})=>{
 const state=await fixture(page,'TRAINER');
 await page.route('**/api/hub/assessment/settings',route=>route.fulfill({json:{settings:{duration_minutes:30,minimum_operations:2,maximum_operations:6,operation_types:[],revision:1}}}));
 await page.route('**/api/hub/assessment/questions',route=>route.fulfill({json:{questions:[{id:'question',stable_code:'sample-question',version:1,question:'Original English question',choices:[{id:'one',label:'First answer'},{id:'two',label:'Second answer'}],correct_option:'one',source:'Fixture source',display_es:{question:'Pregunta original en español',choices:{one:'Primera respuesta',two:'Segunda respuesta'}}}]}}));
 await page.goto('/hub#hub-management');await page.getByRole('button',{name:'Evaluations Rules & attempt reopening',exact:true}).click();await page.getByRole('button',{name:'Open question bank',exact:true}).click();await page.getByRole('combobox',{name:'Question version',exact:true}).selectOption('question');
 const review=page.getByRole('checkbox',{name:'I reviewed both language versions against the authoritative source.',exact:true});await review.check();
 await page.getByRole('textbox',{name:'English question text',exact:true}).fill('Changed English question');await expect(page.getByRole('textbox',{name:'Spanish question text',exact:true})).toHaveValue('');await expect(review).not.toBeChecked();
 await page.getByRole('textbox',{name:'English choice 1',exact:true}).fill('Changed first answer');await expect(page.getByRole('textbox',{name:'Spanish choice 1',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Spanish choice 2',exact:true})).toHaveValue('Segunda respuesta');
 await page.getByRole('button',{name:'Publish question version',exact:true}).click();expect(state.writes).toHaveLength(0);
});
