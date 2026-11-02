import { HubError } from '../hub/HubError.js';
import { authenticateHub,sendHubError } from '../hub/hubAuthorization.js';
import { workspaceUuid } from '../hub/hubWorkspaceService.js';

export function createSimulatorAccess({identityVerifier,csrfProtection,client}) {
  const authenticate=authenticateHub(identityVerifier);
  async function authorize(req,res,next){
    try{
      const identity=req.hubIdentity;
      const trainer=identity.roles.includes('TRAINER');
      const learner=identity.roles.includes('POSTULANTE');
      const parts=req.path.split('/').filter(Boolean);
      const area=req.baseUrl.split('/').at(-1);
      const logAction=area==='trainer'&&parts[0]==='sessions'&&parts[2]==='log-action'&&req.method==='POST';
      if(area==='trainer'&&parts[0]==='settings'&&req.method==='GET'&&(trainer||learner))return next();
      if(area==='trainer'&&!logAction){
        if(!trainer)throw new HubError(403,'HUB_ROLE_FORBIDDEN','Trainer access is required.');
        return next();
      }
      if(!learner&&!trainer)throw new HubError(403,'HUB_ROLE_FORBIDDEN','This identity cannot access the simulator.');
      if(trainer){
        if((area==='operations'&&req.method==='GET')||(area==='sessions'&&(req.method==='GET'||(req.method==='POST'&&['stop','submit'].includes(parts[1])))))return next();
        throw new HubError(403,'HUB_ROLE_FORBIDDEN','Trainers review learner evidence through the trainer workspace.');
      }
      if(area==='sessions'&&parts[0]==='start'&&req.method==='POST'){
        if(!learner)throw new HubError(403,'HUB_ROLE_FORBIDDEN','Only Postulantes may start a learner simulator session.');
        req.body.traineeName=identity.displayName||identity.username||identity.subjectId;return next();
      }
      if(area==='sessions'&&parts.length===0){
        if(!trainer)throw new HubError(403,'HUB_ROLE_FORBIDDEN','The session directory is available to trainers.');
        return next();
      }
      let sessionId;
      if(area==='operations'&&parts[1]==='process'){
        const result=await client.from('sandbox_operations').select('session_id').eq('id',workspaceUuid(parts[0])).maybeSingle();
        if(result.error)throw result.error;sessionId=result.data?.session_id;
      }else if(area==='games'&&parts[0]==='accounts'){
        const result=await client.from('sandbox_game_accounts').select('session_id').eq('id',workspaceUuid(parts[1])).maybeSingle();
        if(result.error)throw result.error;sessionId=result.data?.session_id;
      }else sessionId=logAction?parts[1]:parts[0];
      workspaceUuid(sessionId);
      // Only full free-simulator sessions are exposed through legacy game APIs.
      // Focused/assessment worlds remain behind their dedicated Hub commands.
      if(!trainer){
        const result=await client.from('hub_simulator_sessions').select('session_id,hub_identities!inner(external_subject_reference)').eq('session_id',sessionId).eq('hub_identities.external_subject_reference',identity.subjectId).maybeSingle();
        if(result.error)throw result.error;
        if(!result.data)throw new HubError(404,'HUB_OBJECT_NOT_FOUND','The simulator session was not found.');
        if(req.method==='DELETE')throw new HubError(403,'HUB_ROLE_FORBIDDEN','Learners cannot delete retained sessions.');
      }
      if(req.body&&typeof req.body==='object')req.body.traineeName=identity.displayName||identity.username||identity.subjectId;
      if(logAction&&req.body?.details?.operationId){
        const linked=await client.from('sandbox_operations').select('id').eq('id',workspaceUuid(req.body.details.operationId)).eq('session_id',sessionId).maybeSingle();
        if(linked.error)throw linked.error;if(!linked.data)throw new HubError(404,'HUB_OBJECT_NOT_FOUND','The operation was not found in this session.');
      }
      return next();
    }catch(error){return sendHubError(res,error instanceof HubError?error:new HubError(503,'HUB_SIMULATOR_ACCESS_UNAVAILABLE','Simulator authorization is temporarily unavailable.'));}
  }
  const csrf=(req,res,next)=>csrfProtection.middleware(req,res,error=>error?sendHubError(res,error):next());
  return [authenticate,csrf,authorize];
}
