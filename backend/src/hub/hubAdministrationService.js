import { HubError } from './HubError.js';

function dbError(error) {
  const message = String(error?.message || '');
  if (message.includes('HUB_SEPARATE_APPROVER_REQUIRED')) {
    return new HubError(409, 'HUB_SEPARATE_APPROVER_REQUIRED', 'A different administrator must review this content version.');
  }
  if (message.includes('HUB_ACCESS_DENIED')) {
    return new HubError(403, 'HUB_OBJECT_FORBIDDEN', 'The authenticated subject is not authorized for this Hub object.');
  }
  if (message.includes('HUB_OBJECT_NOT_FOUND')) {
    return new HubError(404, 'HUB_OBJECT_NOT_FOUND', 'The requested Hub object was not found.');
  }
  if (message.includes('HUB_INVALID_INPUT')) {
    return new HubError(400, 'HUB_VALIDATION_ERROR', 'The Hub request is invalid.');
  }
  return new HubError(503, 'HUB_PERSISTENCE_ERROR', 'Hub administration data is temporarily unavailable.');
}

function requireUuid(value, name) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${name} must be a UUID.`);
  }
  return text;
}

export function createHubAdministrationService({ client, trainerVisibilityResolver }) {
  async function actorRecord(identity) {
    const result = await client
      .from('hub_identities')
      .select('id')
      .eq('external_subject_reference', identity.subjectId)
      .eq('status', 'active')
      .maybeSingle();
    if (result.error) throw dbError(result.error);
    if (!result.data) throw new HubError(403, 'HUB_IDENTITY_NOT_PROVISIONED', 'The Hub identity is not active.');
    return result.data;
  }

  async function rpc(name, params) {
    const result = await client.rpc(name, params);
    if (result.error) throw dbError(result.error);
    return result.data;
  }

  async function requireActiveIdentityRole(identityId, roleCode, label) {
    const identityResult = await client
      .from('hub_identities')
      .select('id')
      .eq('id', identityId)
      .eq('status', 'active')
      .maybeSingle();
    if (identityResult.error) throw dbError(identityResult.error);

    if (!identityResult.data) {
      throw new HubError(
        404,
        'HUB_OBJECT_NOT_FOUND',
        `The active ${label} identity was not found.`
      );
    }

    const roleResult = await client
      .from('hub_role_assignments')
      .select('identity_id, hub_roles!inner(code)')
      .eq('identity_id', identityId)
      .eq('hub_roles.code', roleCode)
      .maybeSingle();
    if (roleResult.error) throw dbError(roleResult.error);

    if (!roleResult.data) {
      throw new HubError(
        404,
        'HUB_OBJECT_NOT_FOUND',
        `The active ${label} identity was not found.`
      );
    }

    return identityResult.data;
  }

  async function requireCourse(courseId) {
    const result = await client
      .from('hub_courses')
      .select('id')
      .eq('id', courseId)
      .maybeSingle();
    if (result.error) throw dbError(result.error);
    if (!result.data) {
      throw new HubError(
        404,
        'HUB_OBJECT_NOT_FOUND',
        'The course was not found.'
      );
    }
    return result.data;
  }

  return Object.freeze({
    async listCourses() {
      const result = await client
        .from('hub_courses')
        .select('id, stable_code, title, description, publication_status, is_provisional')
        .neq('publication_status', 'archived')
        .order('title', { ascending: true });
      if (result.error) throw dbError(result.error);
      return result.data || [];
    },

    async assignTrainerLearner(identity, trainerIdentityIdValue, learnerIdentityIdValue) {
      const actor = await actorRecord(identity);
      const trainerIdentityId = requireUuid(trainerIdentityIdValue, 'trainerIdentityId');
      const learnerIdentityId = requireUuid(learnerIdentityIdValue, 'learnerIdentityId');
      await requireActiveIdentityRole(trainerIdentityId, 'trainer', 'trainer');
      await requireActiveIdentityRole(learnerIdentityId, 'postulante', 'postulante');
      const result = await client.from('hub_trainer_learner_assignments').upsert({
        trainer_identity_id: trainerIdentityId,
        learner_identity_id: learnerIdentityId,
        assigned_by_identity_id: actor.id,
        assigned_at: new Date().toISOString(),
        revoked_at: null,
      }).select('*').single();
      if (result.error) throw dbError(result.error);
      return result.data;
    },

    async assignCourse(identity, learnerIdentityIdValue, courseIdValue) {
      const actor = await actorRecord(identity);
      const learnerIdentityId = requireUuid(learnerIdentityIdValue, 'learnerIdentityId');
      const courseId = requireUuid(courseIdValue, 'courseId');
      if (!await trainerVisibilityResolver.canViewLearner({ actor, identity, learnerIdentityId, client })) {
        throw new HubError(404, 'HUB_LEARNER_NOT_FOUND', 'The learner was not found.');
      }
      await requireActiveIdentityRole(learnerIdentityId, 'postulante', 'postulante');
      await requireCourse(courseId);
      const result = await client.from('hub_enrolments').upsert({
        identity_id: learnerIdentityId,
        course_id: courseId,
        assigned_by_identity_id: actor.id,
        status: 'assigned',
      }, { onConflict: 'identity_id,course_id', ignoreDuplicates: true }).select('*').maybeSingle();
      if (result.error) throw dbError(result.error);
      return result.data || { identity_id: learnerIdentityId, course_id: courseId, existing: true };
    },

    createContentVersion(identity, body) {
      return rpc('hub_create_content_version', {
        p_external_subject: identity.subjectId,
        p_definition_kind: body.definitionKind,
        p_definition_id: body.definitionId,
        p_locale: body.locale,
        p_content: body.content,
        p_change_rationale: body.changeRationale,
      });
    },

    submitContentVersion(identity, contentVersionId) {
      return rpc('hub_submit_content_version', {
        p_external_subject: identity.subjectId,
        p_content_version_id: requireUuid(contentVersionId, 'contentVersionId'),
      });
    },

    reviewContentVersion(identity, contentVersionId, body) {
      return rpc('hub_review_content_version', {
        p_external_subject: identity.subjectId,
        p_content_version_id: requireUuid(contentVersionId, 'contentVersionId'),
        p_decision: body.decision,
        p_rationale: body.rationale,
      });
    },
  });
}
