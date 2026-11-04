import {HubError} from './HubError.js';
import {workspaceUuid} from './hubWorkspaceService.js';

export function createHubEvaluationRuntimeService({client}){
  return Object.freeze({
    async command(identity,attemptId,command,body={},practice=false){
      workspaceUuid(attemptId);
      if(!(practice?['read','start','action','history','abandon']:['read','start','theory','action','history']).includes(command))throw new HubError(400,'HUB_VALIDATION_ERROR','Unknown training action.');
      if(command!=='read'&&(typeof body.idempotencyKey!=='string'||!body.idempotencyKey.trim()||body.idempotencyKey.length>200))throw new HubError(400,'HUB_VALIDATION_ERROR','A retry key is required.');
      const input={};
      if(practice&&['action','history','abandon'].includes(command)){
        input.runId=workspaceUuid(body.runId);
        if(command!=='abandon'){
          input.worldId=workspaceUuid(body.worldId);
          if(!Number.isInteger(body.stage)||![1,2].includes(body.stage))throw new HubError(400,'HUB_VALIDATION_ERROR','The practice stage is invalid.');input.stage=body.stage;
        }
      }
      if(command==='theory'){
        if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers)||Object.keys(body.answers).length>100||Object.entries(body.answers).some(([key,value])=>key.length>200||typeof value!=='string'||value.length>200))throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a response to every assigned question.');
        input.answers=body.answers;
      }
      if(command==='action'){
        for(const key of ['actionCode','identifier','password','kiosk','decision','reason','responseCode','reference'])if(body[key]!==undefined){
          if(typeof body[key]!=='string'||body[key].length>200)throw new HubError(400,'HUB_VALIDATION_ERROR','A supplied assessment field is invalid.');input[key]=body[key];
        }
        for(const key of ['amount','credit'])if(body[key]!==undefined){
          if(!['string','number'].includes(typeof body[key])||!Number.isFinite(Number(body[key]))||String(body[key]).length>30)throw new HubError(400,'HUB_VALIDATION_ERROR','Enter a numeric value.');input[key]=body[key];
        }
        if(body.historyIds!==undefined){if(!Array.isArray(body.historyIds)||body.historyIds.length>1000)throw new HubError(400,'HUB_VALIDATION_ERROR','The selected history list is invalid.');input.historyIds=body.historyIds.map(id=>workspaceUuid(id));}
      }
      const result=await client.rpc(practice?'hub_mixed_command':'hub_evaluation_runtime_command',{p_external_subject:identity.subjectId,...(practice?{p_activity_id:attemptId}:{p_attempt_id:attemptId}),p_command:command,p_input:input,p_idempotency_key:command==='read'?null:body.idempotencyKey});
      if(result.error){
        const error=String(result.error.message||'');
        if(error.includes('HUB_FORMAL_EVIDENCE_DISPOSED'))throw new HubError(410,'HUB_FORMAL_EVIDENCE_DISPOSED','Detailed evidence was disposed under retention. Your score and consumed attempts remain recorded.');
        if(error.includes('HUB_PRACTICE_CONFLICT'))throw new HubError(409,'HUB_PRACTICE_CONFLICT','This practice run changed. Reload its saved progress before continuing.');
        if(error.includes('HUB_PREREQUISITE_INCOMPLETE')||error.includes('HUB_ACTIVITY_BLOCKED'))throw new HubError(409,'HUB_ACTIVITY_BLOCKED','Complete the required learning before opening this practice.');
        if(result.error.code==='22023')throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a permitted decision and the required reason.');
        const known=[['HUB_ACCESS_DENIED',403,'The assessment was not found for this identity.'],['ATTEMPT_EXPIRED',409,'The assessment deadline has passed. Return to results.'],['ATTEMPT_NOT_ACTIVE',409,'The assessment is no longer active. Return to results.'],['HUB_IDEMPOTENCY_CONFLICT',409,'The retry key was used for another action.'],['HUB_THEORY_ALREADY_SUBMITTED',409,'Theory responses have already been recorded.'],['HUB_INVALID_INPUT',400,'The assessment request is incomplete or invalid.'],['EVALUATION_UNVERIFIED_FAMILY',409,'A required assessment adapter is not available.'],['EVALUATION_THEORY_ITEMS_REQUIRED',409,'The assessment question bank is not configured.'],['HUB_RUNTIME_NOT_STARTED',409,'Open the assessment to initialize its assigned environment.']].find(([code])=>error.includes(code));
        throw known?new HubError(known[1],known[0],known[2]):new HubError(503,'HUB_PERSISTENCE_ERROR','The assessment could not record this action. Retry with the same request.');
      }
      return result.data;
    },
  });
}
