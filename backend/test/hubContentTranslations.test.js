import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import http from 'node:http';
import {createHubContentTranslationService,questionDisplayTranslation} from '../src/hub/hubContentTranslationService.js';
import {createHubDisplayTranslationMiddleware} from '../src/hub/hubDisplayTranslations.js';
import {createHubAssessmentService} from '../src/hub/hubAssessmentService.js';
const id='10000000-0000-4000-8000-000000000001';const historical='10000000-0000-4000-8000-000000000002';
test('question display metadata includes text keyed by choice IDs and excludes reviewer/correctness metadata',()=>{
 const question={question:'Same wording',choices:[{id:'one',label:'Same wording'}]};
 const result=questionDisplayTranslation(question,{question:'Pregunta',choices:{one:'Opción',unknown:'Hidden'},correctOption:'one',reviewedBy:'private-reviewer'});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{question:'Pregunta',choices:{one:'Opción'}});
});
test('current lesson enrichment is bounded to authorized response IDs and never replaces pinned historical translations',async()=>{
 let params;const service=createHubContentTranslationService({client:{async rpc(name,input){assert.equal(name,'hub_instruction_translations');params=input;return {data:[{activityId:id,translation:{es:{Lesson:'Lección nueva'}}}]};}}});
 const pinned={es:{Lesson:'Lección histórica'}};const payload={enrolments:[{modules:[{activities:[{id,title:'Lesson'},{id:historical,title:'Lesson',contentSnapshot:true,displayTranslation:pinned}]}]}]};const before=structuredClone(payload);
 const result=await service.enrich({subjectId:'verified'},'/learning-path',payload);assert.deepEqual(params.p_activity_ids,[id]);assert.deepEqual(payload,before);
 assert.equal(result.payload.enrolments[0].modules[0].activities[0].displayTranslation.es.Lesson,'Lección nueva');assert.deepEqual(result.payload.enrolments[0].modules[0].activities[1].displayTranslation,pinned);
});
test('runtime enrichment uses verified subject and exact assigned stem/choice identity',async()=>{
 let params;const choices=[{id:'one',label:'Assigned choice'}];const service=createHubContentTranslationService({client:{async rpc(name,input){assert.equal(name,'hub_runtime_question_translations');params=input;return {data:[{code:'assigned',question:'Assigned question',choices,displayEs:{question:'Pregunta asignada',choices:{one:'Opción asignada'},correctOption:'secret'}}]};}}});
 const result=await service.enrich({subjectId:'verified-owner'},`/scored-evaluations/attempts/${id}/runtime`,{questions:[{code:'assigned',question:'Assigned question',choices}]});
 assert.equal(params.p_external_subject,'verified-owner');assert.equal(result.payload.questions[0].displayTranslation.es.question,'Pregunta asignada');assert.ok(!JSON.stringify(result).includes('secret'));
 const different=await service.enrich({subjectId:'verified-owner'},`/scored-evaluations/attempts/${id}/runtime`,{questions:[{code:'assigned',question:'Assigned question',choices:[{id:'one',label:'Different version'}]}]});assert.equal(different.payload.questions[0].displayTranslation.es,null);
});
test('unrelated successful echoes cannot query private translation helpers',async()=>{
 const service=createHubContentTranslationService({client:{rpc(){assert.fail('Private helper called by unrelated route');}}});
 const payload={question:'Arbitrary echo'};assert.deepEqual(await service.enrich({subjectId:'verified'},'/activities/echo/complete',payload),{payload,es:{}});
});
test('optional display reads use an abortable deadline rather than delaying a saved action indefinitely',async()=>{
 let signal;const service=createHubContentTranslationService({client:{rpc(){return {abortSignal(value){signal=value;return Promise.resolve({data:[]});}};}}});
 await service.enrich({subjectId:'verified'},'/learning-path',{enrolments:[{modules:[{activities:[{id}]}]}]});assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);
});
test('translation draft creation computes source hash server-side and uses verified author identity',async()=>{
 const calls=[];const source={id:historical,definition_id:id,definition_kind:'activity',locale:'en',content:{title:'Lesson',instruction:{paragraphs:['Read']}}};
 const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:source};}};
 const service=createHubContentTranslationService({client:{from(){return query;},async rpc(name,params){calls.push({name,params});return {data:name==='hub_instruction_source_hash'?'server-fingerprint':{id}};}}});
 await service.create({subjectId:'verified-admin'},id,{sourceVersionId:historical,translations:{Lesson:'Lección',Read:'Lea'},rationale:'Spanish content review',sourceFingerprint:'forged',subjectId:'forged'});
 assert.equal(calls[2].params.p_external_subject,'verified-admin');assert.equal(calls[2].params.p_content.displayTranslation.sourceFingerprint,'server-fingerprint');assert.equal(calls[2].params.p_locale,'es');
});
test('display lookup failure preserves committed response status/result and does not repeat mutation',async()=>{
 let mutations=0;const app=express();app.use((req,_res,next)=>{req.hubIdentity={subjectId:'verified'};next();});app.use(createHubDisplayTranslationMiddleware({service:{async enrich(){throw new Error('Lookup failed');}}}));
 app.post(`/scored-evaluations/attempts/${id}/runtime/action`,(_req,res)=>{mutations++;res.status(201).json({saved:true,score:100});});
 app.get('/learning-path',(_req,res)=>res.status(403).json({error:'denied'}));
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const origin=`http://127.0.0.1:${server.address().port}`;const response=await fetch(`${origin}/scored-evaluations/attempts/${id}/runtime/action`,{method:'POST'});assert.equal(response.status,201);const data=await response.json();assert.equal(data.saved,true);assert.equal(data.score,100);assert.equal(data.displayTranslationStatus,'unavailable');assert.equal(mutations,1);assert.deepEqual(await (await fetch(`${origin}/learning-path`)).json(),{error:'denied'});}finally{await new Promise(resolve=>server.close(resolve));}
});
test('question publication requires bilingual review and preserves canonical choice IDs and correct answer',async()=>{
 const body={code:'new-question',expectedVersion:0,question:'Assigned question',choices:[{id:'one',label:'One'},{id:'two',label:'Two'}],correctOption:'one',source:'Approved source',rationale:'Question review',spanish:{question:'Pregunta asignada',choices:{one:'Uno',two:'Dos'}},reviewedLanguages:true};
 let calls=0;const service=createHubAssessmentService({client:{async rpc(name,params){calls++;assert.equal(name,'hub_publish_bilingual_theory_question');assert.equal(params.p_external_subject,'verified');assert.equal(params.p_correct_option,'one');assert.deepEqual(params.p_choices,body.choices);assert.deepEqual(params.p_spanish,body.spanish);return {data:{id}};}}});
 for(const patch of [{reviewedLanguages:false},{spanish:{question:'Pregunta',choices:{one:'Uno'}}},{spanish:{...body.spanish,correctOption:'one'}},{choices:[null]}])await assert.rejects(()=>service.publishTheoryQuestion({subjectId:'verified'},{...body,...patch}),error=>error.statusCode===400);
 assert.equal(calls,0);await service.publishTheoryQuestion({subjectId:'verified'},body);assert.equal(calls,1);
});
