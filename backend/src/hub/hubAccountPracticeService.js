import { HubError } from './HubError.js';
import { workspaceUuid } from './hubWorkspaceService.js';

export function createHubAccountPracticeService({client}) {
  return Object.freeze({
    async command(identity,activityId,command,body={},credential=false){
      workspaceUuid(activityId);
      const exception=credential==='exception';
      if(!(exception?['start','answer']:credential?['start','reset','confirm']:['start','validate','create','confirm']).includes(command)||typeof body.idempotencyKey!=='string'||!body.idempotencyKey.trim()||body.idempotencyKey.length>200)throw new HubError(400,'HUB_VALIDATION_ERROR','A valid action and retry key are required.');
      const input={};
      for(const key of exception?['action','reason']:['identifier','password','kiosk']){
        if(body[key]!==undefined){if(typeof body[key]!=='string'||body[key].length>(key==='reason'?1000:200))throw new HubError(400,'HUB_VALIDATION_ERROR','A supplied field is invalid or too long.');input[key]=body[key];}
      }
      const result=await client.rpc(exception?'hub_exception_practice_command':credential?'hub_credential_practice_command':'hub_account_practice_command',{p_external_subject:identity.subjectId,p_activity_id:activityId,p_command:command,p_input:input,p_idempotency_key:body.idempotencyKey});
      if(result.error){
        const message=String(result.error.message||'');
        const code=['HUB_ACCESS_DENIED','HUB_ACTIVITY_BLOCKED','HUB_IDEMPOTENCY_CONFLICT','HUB_PREREQUISITE_INCOMPLETE','HUB_IDENTIFIER_MISMATCH','HUB_ACCOUNT_ALREADY_CREATED','HUB_ACCOUNT_ALREADY_CONFIRMED','HUB_ACCOUNT_CONFIRMATION_MISMATCH','HUB_RETRY_POLICY_REQUIRED','HUB_INVALID_INPUT'].find(value=>message.includes(value));
        throw new HubError(code==='HUB_ACCESS_DENIED'?403:code?409:503,code||'HUB_PERSISTENCE_ERROR',code==='HUB_IDENTIFIER_MISMATCH'?'The identifier does not match the assigned account policy.':code==='HUB_ACCOUNT_CONFIRMATION_MISMATCH'?'Game ID, password and kiosk must match the created account.':code==='HUB_PREREQUISITE_INCOMPLETE'?'Complete the required learning and account rule practice first.':code==='HUB_IDEMPOTENCY_CONFLICT'?'This retry key was used for another action.':'Account practice could not complete this action. Refresh the activity and retry.');
      }
      return result.data;
    },
  });
}
