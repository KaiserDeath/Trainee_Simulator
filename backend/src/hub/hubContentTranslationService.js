import {HubError} from './HubError.js';
import {workspaceUuid} from './hubWorkspaceService.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function questionDisplayTranslation(question,spanish){
 if(!spanish||typeof spanish.question!=='string'||!spanish.choices||typeof question.question!=='string')return null;
 const choices=Object.create(null);
 for(const choice of question.choices||[])if(Object.hasOwn(spanish.choices,choice.id)&&typeof spanish.choices[choice.id]==='string')choices[choice.id]=spanish.choices[choice.id];
 return {question:spanish.question,choices};
}
export function createHubContentTranslationService({client}){
 async function rpc(name,params,{displayRead=false}={}){
  let query=client.rpc(name,params);
  if(displayRead&&typeof query?.abortSignal==='function')query=query.abortSignal(AbortSignal.timeout(3000));
  const {data,error}=await query;if(!error)return data;
  const message=String(error.message||'');
  if(message.includes('HUB_TRANSLATION_INVALID'))throw new HubError(400,'HUB_TRANSLATION_INVALID','Provide reviewed Spanish text for every source entry, using the selected English version.');
  if(message.includes('HUB_ACCESS_DENIED'))throw new HubError(403,'HUB_ACCESS_DENIED','Your identity cannot access these translations.');
  throw new HubError(503,'HUB_TRANSLATION_UNAVAILABLE','Content translations are temporarily unavailable.');
 }
 return Object.freeze({
  async create(identity,activityId,body){
   const activity=workspaceUuid(activityId).toLowerCase();const sourceId=workspaceUuid(body.sourceVersionId).toLowerCase();
   if(!body.translations||typeof body.translations!=='object'||Array.isArray(body.translations)||Object.keys(body.translations).length>1000
    ||Object.entries(body.translations).some(([key,value])=>key.length>12000||typeof value!=='string'||!value.trim()||value.length>12000)
    ||typeof body.rationale!=='string'||body.rationale.trim().length<5||body.rationale.length>2000)throw new HubError(400,'HUB_TRANSLATION_INVALID','Provide reviewed Spanish text for every source entry, using the selected English version.');
   await rpc('hub_require_active_role',{p_external_subject:identity.subjectId,p_allowed_roles:['admin']});
   const source=await client.from('hub_content_versions').select('id,definition_id,definition_kind,locale,content').eq('id',sourceId).maybeSingle();
   if(source.error)throw new HubError(503,'HUB_TRANSLATION_UNAVAILABLE','Content translations are temporarily unavailable.');
   if(!source.data||source.data.definition_id!==activity||source.data.definition_kind!=='activity'||source.data.locale!=='en'||!source.data.content?.instruction)throw new HubError(404,'HUB_OBJECT_NOT_FOUND','The English instruction version was not found for this activity.');
   const fingerprint=await rpc('hub_instruction_source_hash',{p_content:source.data.content});
   return {contentVersion:await rpc('hub_create_content_version',{p_external_subject:identity.subjectId,p_definition_kind:'activity',p_definition_id:activity,p_locale:'es',
    p_content:{displayTranslation:{sourceVersionId:sourceId,sourceFingerprint:fingerprint,es:body.translations}},p_change_rationale:body.rationale.trim()})};
  },
  async enrich(identity,path,payload){
   if(path==='/learning-path'){
    const entries=(payload.enrolments||[]).flatMap(enrolment=>(enrolment.modules||[]).flatMap(module=>module.activities||[]));
    const ids=[...new Set(entries.filter(activity=>!activity.contentSnapshot&&uuid.test(activity.id)).map(activity=>activity.id))];
    if(ids.length){
     const values=await rpc('hub_instruction_translations',{p_activity_ids:ids},{displayRead:true});const byId=new Map((values||[]).map(row=>[row.activityId,row.translation]));
     // Clone authorized response projections; never rewrite a source or historical snapshot.
     const result={...payload,enrolments:(payload.enrolments||[]).map(enrolment=>({...enrolment,modules:(enrolment.modules||[]).map(module=>({...module,activities:(module.activities||[]).map(activity=>({...activity,displayTranslation:activity.contentSnapshot?activity.displayTranslation:(byId.get(activity.id)||null)}))}))}))};
     return {payload:result,es:{}};
    }
   }
   const runtime=/^\/scored-evaluations\/attempts\/([0-9a-f-]{36})\/runtime(?:\/[^/]+)?$/i.exec(path);
   const evidence=/^\/assessment\/attempts\/([0-9a-f-]{36})\/evidence$/i.exec(path);
   if(runtime||evidence){
    const values=await rpc('hub_runtime_question_translations',{p_external_subject:identity.subjectId,p_attempt_id:(runtime||evidence)[1]},{displayRead:true});
    const questions=(payload.questions||[]).map(question=>{
     const saved=(values||[]).find(row=>row.code===question.code&&row.question===question.question&&(row.choices||[]).length===(question.choices||[]).length&&(question.choices||[]).every(choice=>row.choices.some(item=>item.id===choice.id&&item.label===choice.label)));
     return {...question,displayTranslation:{es:saved?questionDisplayTranslation(question,saved.displayEs):null}};
    });
    return {payload:{...payload,questions},es:{}};
   }
   if(path==='/assessment/questions'&&Array.isArray(payload.questions)){
    return {payload:{...payload,questions:(payload.questions||[]).map(question=>({...question,displayTranslation:{es:questionDisplayTranslation(question,question.display_es)}}))},es:{}};
   }
   return {payload,es:{}};
  },
 });
}
