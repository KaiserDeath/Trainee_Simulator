import {HubError} from './HubError.js';
import {workspaceUuid} from './hubWorkspaceService.js';

export function createHubTrainingAssignmentService({client}) {
  async function rpc(name, params) {
    const {data, error} = await client.rpc(name, params);
    if (!error) return data;
    const match = [
      ['HUB_ACCESS_DENIED',403,'Your identity cannot perform this training-assignment action.'],
      ['HUB_OBJECT_NOT_FOUND',404,'The assignment or assigned learner module was not found.'],
      ['HUB_REVISION_CONFLICT',409,'This assignment changed. Reload it before saving.'],
      ['HUB_IDEMPOTENCY_CONFLICT',409,'The retry key belongs to a different change.'],
      ['HUB_ASSIGNMENT_CLOSED',409,'This assignment cannot accept that action in its current state.'],
      ['HUB_VERIFICATION_EVIDENCE_REQUIRED',409,'Choose a later completed attempt for this learner and module.'],
      ['HUB_INVALID_INPUT',400,'Provide a valid assignment, reason, date and retry key.'],
    ].find(([code]) => String(error.message).includes(code));
    throw match ? new HubError(match[1],match[0],match[2]) : new HubError(503,'HUB_TRAINING_ASSIGNMENT_UNAVAILABLE','Training assignments are temporarily unavailable.');
  }
  return Object.freeze({
    list(identity, learnerId, cursor) {
      return rpc('hub_list_training_assignments',{p_external_subject:identity.subjectId,p_learner_id:workspaceUuid(learnerId,true),p_after:workspaceUuid(cursor,true)});
    },
    async command(identity, command, assignmentId, body) {
      if (!['assign','acknowledge','verify','cancel'].includes(command)
        || !Number.isInteger(body.expectedRevision) || body.expectedRevision<0
        || typeof body.idempotencyKey!=='string' || !body.idempotencyKey.trim() || body.idempotencyKey.length>200) {
        throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a valid assignment, reason, date and retry key.');
      }
      const reason=command==='acknowledge'?'Learner acknowledged review; this is not a competency result.':body.reason;
      if (typeof reason!=='string'||reason.trim().length<5||reason.trim().length>1000)throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a reason of 5–1000 characters, visible to the learner.');
      const dueOn=command==='assign'?(body.dueOn??null):null;
      if(dueOn!==null&&(typeof dueOn!=='string'||!/^20\d{2}-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(dueOn)||!Number.isFinite(Date.parse(dueOn))||new Date(dueOn).toISOString().slice(0,10)!==dueOn))throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a valid assignment, reason, date and retry key.');
      if(command==='assign'&&!['onboarding','reinforcement'].includes(body.purpose))throw new HubError(400,'HUB_VALIDATION_ERROR','Choose onboarding or reinforcement.');
      return {assignment:await rpc('hub_training_assignment_command',{
        p_external_subject:identity.subjectId,p_command:command,p_assignment_id:workspaceUuid(assignmentId,true),
        p_learner_id:command==='assign'?workspaceUuid(body.learnerId):null,
        p_module_id:command==='assign'?workspaceUuid(body.moduleId):null,
        p_purpose:command==='assign'?body.purpose:null,p_reason:reason.trim(),p_due_on:dueOn,
        p_expected_revision:body.expectedRevision,p_verification_attempt_id:command==='verify'?workspaceUuid(body.verificationAttemptId):null,
        p_idempotency_key:body.idempotencyKey,
      })};
    },
  });
}
