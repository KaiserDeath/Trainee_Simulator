import {HubError} from './HubError.js';
import {workspaceUuid} from './hubWorkspaceService.js';

export function createHubCohortService({client}) {
  async function rpc(name,params) {
    const {data,error}=await client.rpc(name,params);
    if(!error)return data;
    const mapping=[
      ['HUB_ACCESS_DENIED',403,'Your identity cannot manage or read this cohort.'],
      ['HUB_OBJECT_NOT_FOUND',404,'The course, cohort or active learner was not found.'],
      ['HUB_REVISION_CONFLICT',409,'This cohort changed. Update the list and reopen it before saving.'],
      ['HUB_IDEMPOTENCY_CONFLICT',409,'The retry key belongs to a different change.'],
      ['HUB_ENROLMENT_WITHDRAWN',409,'A selected learner has a withdrawn enrolment. Review that assignment first.'],
      ['HUB_COHORT_CAPACITY',409,'A cohort supports at most 100 learners.'],
      ['HUB_INVALID_INPUT',400,'Provide a title, course, valid target date and up to 100 learners.'],
    ].find(([code])=>String(error.message).includes(code));
    throw mapping?new HubError(mapping[1],mapping[0],mapping[2]):new HubError(503,'HUB_COHORT_UNAVAILABLE','Cohorts are temporarily unavailable.');
  }
  return Object.freeze({
    list(identity,cursor){return rpc('hub_list_cohorts',{p_external_subject:identity.subjectId,p_after:workspaceUuid(cursor,true)});},
    async save(identity,id,body){
      const dueOn=body.dueOn??null;
      if(typeof body.title!=='string'||!body.title.trim()||body.title.length>200
        ||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0
        ||!Array.isArray(body.learnerIds)||body.learnerIds.length>100
        ||typeof body.idempotencyKey!=='string'||!body.idempotencyKey.trim()||body.idempotencyKey.length>200
        ||(dueOn!==null&&(typeof dueOn!=='string'||!/^20\d{2}-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(dueOn)
          ||!Number.isFinite(Date.parse(dueOn))||new Date(dueOn).toISOString().slice(0,10)!==dueOn))) {
        throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a title, course, valid target date and up to 100 learners.');
      }
      return {cohort:await rpc('hub_save_cohort',{p_external_subject:identity.subjectId,p_cohort_id:workspaceUuid(id,true),
        p_title:body.title.trim(),p_course_id:workspaceUuid(body.courseId),p_due_on:dueOn,
        p_learner_ids:[...new Set(body.learnerIds.map(value=>workspaceUuid(value)))],
        p_expected_revision:body.expectedRevision,p_idempotency_key:body.idempotencyKey})};
    },
  });
}
