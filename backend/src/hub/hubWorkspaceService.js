import { HubError } from './HubError.js';
import { readAllById } from '../domain/readAllById.js';

const instructionKeys = new Set(['summary','body','paragraphs','learningObjectives','keyPoints','topics','steps','sections','items','prompts','instructions','introduction','statement','mediaAssetIds']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function workspaceUuid(value, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'A valid record ID is required.');
  return value;
}

export function validateInstruction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', 'A title of at most 200 characters is required.');
  }
  const instruction = body.instruction;
  if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction) || Object.keys(instruction).some(key => !instructionKeys.has(key))) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Only instructional fields may be edited here.');
  }
  // Keep the native renderer's schema predictable; rich text is rendered as text.
  for (const [key, value] of Object.entries(instruction)) {
    if(key==='mediaAssetIds'){
      if(!Array.isArray(value)||value.length>20)throw new HubError(400,'HUB_VALIDATION_ERROR','Choose at most 20 published training assets.');
      instruction.mediaAssetIds=[...new Set(value.map(id=>workspaceUuid(id).toLowerCase()))];
    }else if (['paragraphs','learningObjectives','keyPoints','topics','steps','prompts'].includes(key)) {
      if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' || item.length > 4000)) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', `${key} must contain text entries.`);
      }
    } else if (key === 'items') {
      if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' && (!item || typeof item.id !== 'string' || typeof item.label !== 'string'))) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Checklist items require text or an ID and label.');
      }
    } else if (key === 'sections') {
      if (!Array.isArray(value) || value.length > 50 || value.some(section => !section || typeof section.title !== 'string' || (section.paragraphs !== undefined && (!Array.isArray(section.paragraphs) || section.paragraphs.some(p => typeof p !== 'string'))) || (section.items !== undefined && (!Array.isArray(section.items) || section.items.some(p => typeof p !== 'string' && (!p || typeof p.label !== 'string')))))) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Sections require a title and paragraphs.');
      }
    } else if (typeof value !== 'string' || value.length > 12000) {
      throw new HubError(400, 'HUB_VALIDATION_ERROR', `${key} must be text.`);
    }
  }
  const content = { title: body.title.trim(), instruction };
  if (Buffer.byteLength(JSON.stringify(content)) > 64000) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Instruction exceeds the supported size.');
  return content;
}

function checked(result) {
  if (!result.error) return result.data;
  const message = String(result.error.message || '');
  const errors = [
    ['HUB_ACCESS_DENIED',403,'The current identity cannot perform this action.'],
    ['HUB_OBJECT_NOT_FOUND',404,'The requested record was not found.'],
    ['HUB_REVISION_CONFLICT',409,'This note changed. Reload its latest revision before saving.'],
    ['HUB_IDEMPOTENCY_CONFLICT',409,'The retry key was already used for a different change.'],
    ['HUB_SEPARATE_APPROVER_REQUIRED',409,'A different administrator must review this proposal.'],
    ['HUB_VERIFICATION_EVIDENCE_REQUIRED',409,'Choose a later completed attempt for this learner as verification evidence.'],
    ['HUB_INVALID_INPUT',400,'The requested change is invalid.'],
  ];
  const match = errors.find(([code]) => message.includes(code));
  if (match) throw new HubError(match[1], match[0], match[2]);
  throw new HubError(503,'HUB_PERSISTENCE_ERROR','Workspace data is temporarily unavailable.');
}

export function createHubWorkspaceService({ client }) {
  async function actor(identity, roles) {
    return checked(await client.rpc('hub_require_active_role', { p_external_subject: identity.subjectId, p_allowed_roles: roles }));
  }
  async function learner(id) {
    workspaceUuid(id);
    const row = checked(await client.from('hub_role_assignments').select('identity_id,hub_roles!inner(code)').eq('identity_id',id).eq('hub_roles.code','postulante').maybeSingle());
    if (!row) throw new HubError(404,'HUB_OBJECT_NOT_FOUND','The Postulante was not found.');
  }
  return Object.freeze({
    async policies(identity){
      await actor(identity,['admin']);
      const [policies,proposals]=await Promise.all([
        readAllById(()=>client.from('hub_account_policies').select('*')),
        readAllById(()=>client.from('hub_account_policy_proposals').select('*')),
      ]);
      return {policies,proposals};
    },
    async proposePolicy(identity,body){
      await actor(identity,['admin']);workspaceUuid(body.basePolicyId);
      const configuration=body.configuration;
      if(!configuration||typeof configuration!=='object'||typeof configuration.label!=='string'||!configuration.label.trim()||configuration.label.length>200
        ||!Number.isInteger(configuration.customerLength)||configuration.customerLength<1||configuration.customerLength>32
        ||!Number.isInteger(configuration.digits)||configuration.digits<1||configuration.digits>8
        ||!['prefix','suffix'].every(key=>typeof configuration[key]==='string'&&/^[a-zA-Z0-9_ ]{0,16}$/.test(configuration[key]))
        ||typeof body.rationale!=='string'||!body.rationale.trim()||body.rationale.length>2000)throw new HubError(400,'HUB_VALIDATION_ERROR','Provide an ID label, customer length (1–32), digits (1–8), prefix/suffix and a change reason.');
      return {proposal:checked(await client.rpc('hub_propose_account_policy',{p_external_subject:identity.subjectId,p_base_policy_id:body.basePolicyId,p_configuration:configuration,p_rationale:body.rationale}))};
    },
    async reviewPolicy(identity,id,body){
      await actor(identity,['admin']);workspaceUuid(id);
      if(!['approve','reject'].includes(body.decision)||typeof body.rationale!=='string'||!body.rationale.trim()||body.rationale.length>2000)throw new HubError(400,'HUB_VALIDATION_ERROR','Provide a review decision and reason.');
      return {proposal:checked(await client.rpc('hub_review_account_policy',{p_external_subject:identity.subjectId,p_proposal_id:id,p_decision:body.decision,p_rationale:body.rationale}))};
    },
    async catalog(identity) {
      await actor(identity,['admin','trainer']);
      const [courses,modules,activities] = await Promise.all([
        readAllById(() => client.from('hub_courses').select('id,title,stable_code'),{maxRows:10000}),
        readAllById(() => client.from('hub_modules').select('id,course_id,title,stable_code,position'),{maxRows:10000}),
        readAllById(() => client.from('hub_activities').select('id,module_id,title,stable_code,activity_type,content,publication_status'),{maxRows:10000}),
      ]);
      return { courses,modules,activities };
    },
    async versions(identity,activityId) {
      await actor(identity,['admin']);
      workspaceUuid(activityId);
      return { versions: await readAllById(() => client.from('hub_content_versions').select('*').eq('definition_kind','activity').eq('definition_id',activityId).eq('locale','en'),{maxRows:10000}) };
    },
    async createInstruction(identity,activityId,body) {
      await actor(identity,['admin']);
      workspaceUuid(activityId);
      const content = validateInstruction(body);
      if (typeof body.changeRationale !== 'string' || !body.changeRationale.trim() || body.changeRationale.length > 2000) throw new HubError(400,'HUB_VALIDATION_ERROR','Explain why the instruction is changing.');
      const row = checked(await client.from('hub_activities').select('id').eq('id',activityId).maybeSingle());
      if (!row) throw new HubError(404,'HUB_OBJECT_NOT_FOUND','The activity was not found.');
      return { contentVersion: checked(await client.rpc('hub_create_content_version',{
        p_external_subject:identity.subjectId,p_definition_kind:'activity',p_definition_id:activityId,p_locale:'en',p_content:content,p_change_rationale:body.changeRationale.trim(),
      })) };
    },
    async evidence(identity,learnerId) {
      await actor(identity,['trainer','rrhh']);
      await learner(learnerId);
      const enrolments = await readAllById(() => client.from('hub_enrolments').select('id').eq('identity_id',learnerId));
      if (!enrolments.length) return { attempts:[] };
      const progress = await readAllById(() => client.from('hub_module_progress').select('id').in('enrolment_id',enrolments.map(row=>row.id)));
      if (!progress.length) return { attempts:[] };
      return { attempts:await readAllById(() => client.from('hub_attempts').select('id,module_id,status,started_at,completed_at').in('module_progress_id',progress.map(row=>row.id))) };
    },
    async notes(identity,learnerId,cursor) {
      await actor(identity,['trainer','rrhh']);
      await learner(learnerId);
      if (cursor) workspaceUuid(cursor);
      let query = client.from('hub_coaching_notes').select('*').eq('learner_identity_id',learnerId).order('id',{ascending:true}).limit(51);
      if (cursor) query = query.gt('id',cursor);
      const rows = checked(await query) || [];
      const notes = rows.slice(0,50);
      const revisions = notes.length ? await readAllById(() => client.from('hub_coaching_note_revisions').select('*').in('note_id',notes.map(row=>row.id))) : [];
      return {
        notes:notes.map(note=>({ ...note, revisions:revisions.filter(row=>row.note_id===note.id).sort((a,b)=>b.revision-a.revision) })),
        nextCursor:rows.length>50?notes.at(-1).id:null,
      };
    },
    async saveNote(identity,learnerId,body) {
      await actor(identity,['trainer']);
      workspaceUuid(learnerId);
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || typeof body.body !== 'string' || !body.body.trim() || body.body.length>4000 || !['open','practice_assigned','verified','closed'].includes(body.status) || typeof body.idempotencyKey!=='string' || !body.idempotencyKey.trim() || body.idempotencyKey.length>200) {
        throw new HubError(400,'HUB_VALIDATION_ERROR','Provide note text, a valid status, revision and retry key.');
      }
      return checked(await client.rpc('hub_save_coaching_note',{
        p_external_subject:identity.subjectId,p_learner_id:learnerId,
        p_note_id:workspaceUuid(body.noteId,true),p_attempt_id:workspaceUuid(body.attemptId,true),
        p_expected_revision:body.expectedRevision,p_body:body.body.trim(),p_status:body.status,
        p_verification_attempt_id:workspaceUuid(body.verificationAttemptId,true),p_idempotency_key:body.idempotencyKey,
      }));
    },
  });
}
