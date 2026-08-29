import { HubError } from './HubError.js';

function requireClient(client) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('A Supabase service-role client is required.');
  }
  return client;
}

function throwDatabaseError(error) {
  const message = String(error?.message || '');

  if (message.includes('HUB_INVALID_INPUT')) {
    throw new HubError(
      400,
      'HUB_VALIDATION_ERROR',
      'The Hub persistence request is invalid.'
    );
  }

  if (message.includes('HUB_IDEMPOTENCY_CONFLICT')) {
    throw new HubError(
      409,
      'HUB_IDEMPOTENCY_CONFLICT',
      'The idempotency key was already used for a different Hub request.'
    );
  }

  if (message.includes('HUB_PREREQUISITE_INCOMPLETE')) {
    throw new HubError(
      409,
      'HUB_PREREQUISITE_NOT_MET',
      'The activity prerequisites are not complete.'
    );
  }

  if (message.includes('HUB_RETRY_POLICY_REQUIRED')) {
    throw new HubError(
      409,
      'HUB_RETRY_POLICY_REQUIRED',
      'A new attempt cannot start until Trez defines and configures retry policy.'
    );
  }

  if (message.includes('HUB_ACTIVITY_BLOCKED')) {
    throw new HubError(
      409,
      'HUB_ACTIVITY_BLOCKED',
      'This activity is unavailable until its approved policy or required server artifact is configured.'
    );
  }

  if (message.includes('HUB_ACCESS_DENIED')) {
    throw new HubError(
      403,
      'HUB_OBJECT_FORBIDDEN',
      'The authenticated subject is not authorized for this Hub object.'
    );
  }

  throw new HubError(
    500,
    'HUB_PERSISTENCE_ERROR',
    'Hub learning data is temporarily unavailable.'
  );
}

function assertNoError(result) {
  if (result.error) {
    throwDatabaseError(result.error);
  }
  return result.data;
}

function unwrapRpcResult(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field];
    const values = grouped.get(key) || [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function unavailableTrainerVisibility() {
  throw new HubError(
    501,
    'HUB_TRAINER_VISIBILITY_NOT_CONFIGURED',
    'Trainer Postulante visibility has not been configured.'
  );
}

async function findIdentity(client, externalSubject) {
  const result = await client
    .from('hub_identities')
    .select('id, external_subject_reference, display_name')
    .eq('external_subject_reference', externalSubject)
    .maybeSingle();

  const identity = assertNoError(result);
  if (!identity) {
    throw new HubError(
      403,
      'HUB_IDENTITY_NOT_PROVISIONED',
      'The authenticated subject is not provisioned for Trez Training Hub.'
    );
  }
  return identity;
}

async function loadLearnerSnapshot(client, identity) {
  const enrolments = assertNoError(
    await client
      .from('hub_enrolments')
      .select(
        'id, course_id, status, assigned_at, started_at, completed_at'
      )
      .eq('identity_id', identity.id)
      .order('assigned_at', { ascending: true })
  );

  if (enrolments.length === 0) {
    return { enrolments: [] };
  }

  const courseIds = [...new Set(enrolments.map((row) => row.course_id))];
  const enrolmentIds = enrolments.map((row) => row.id);

  const courses = assertNoError(
    await client
      .from('hub_courses')
      .select(
        'id, stable_code, title, description, publication_status, is_provisional, is_scored'
      )
      .in('id', courseIds)
  );

  const modules = assertNoError(
    await client
      .from('hub_modules')
      .select(
        'id, course_id, stable_code, position, title, summary, publication_status, is_provisional, is_scored'
      )
      .in('course_id', courseIds)
      .order('position', { ascending: true })
  );

  const moduleIds = modules.map((row) => row.id);
  const activities = moduleIds.length === 0
    ? []
    : assertNoError(
        await client
          .from('hub_activities')
          .select(
            'id, module_id, stable_code, position, activity_type, title, content, publication_status, is_provisional, is_scored'
          )
          .in('module_id', moduleIds)
          .order('position', { ascending: true })
      );

  const prerequisites = moduleIds.length === 0
    ? []
    : assertNoError(
        await client
          .from('hub_module_prerequisites')
          .select('module_id, prerequisite_module_id')
          .in('module_id', moduleIds)
      );

  const progressRows = assertNoError(
    await client
      .from('hub_module_progress')
      .select(
        'id, enrolment_id, module_id, status, started_at, completed_at'
      )
      .in('enrolment_id', enrolmentIds)
  );

  const moduleAttempts = progressRows.length === 0
    ? []
    : assertNoError(
        await client
          .from('hub_attempts')
          .select('id, module_progress_id, attempt_number, status')
          .in(
            'module_progress_id',
            progressRows.map((row) => row.id)
          )
          .order('attempt_number', { ascending: false })
      );

  const activityAttempts = moduleAttempts.length === 0
    ? []
    : assertNoError(
        await client
          .from('hub_activity_attempts')
          .select('id, attempt_id, activity_id, status, completed_at')
          .in(
            'attempt_id',
            moduleAttempts.map((row) => row.id)
          )
          .order('created_at', { ascending: false })
      );

  const courseMap = byId(courses);
  const modulesByCourse = groupBy(modules, 'course_id');
  const activitiesByModule = groupBy(activities, 'module_id');
  const prerequisitesByModule = groupBy(prerequisites, 'module_id');
  const progressByEnrolment = groupBy(progressRows, 'enrolment_id');
  const attemptsByProgress = groupBy(moduleAttempts, 'module_progress_id');
  const activityAttemptsByAttempt = groupBy(activityAttempts, 'attempt_id');

  return {
    enrolments: enrolments.map((enrolment) => {
      const course = courseMap.get(enrolment.course_id);
      const progress = progressByEnrolment.get(enrolment.id) || [];
      const progressMap = new Map(
        progress.map((row) => [row.module_id, row])
      );
      const completedModuleIds = new Set(
        progress
          .filter((row) => row.status === 'completed')
          .map((row) => row.module_id)
      );

      return {
        id: enrolment.id,
        status: enrolment.status,
        assignedAt: enrolment.assigned_at,
        startedAt: enrolment.started_at,
        completedAt: enrolment.completed_at,
        course: {
          id: course.id,
          code: course.stable_code,
          title: course.title,
          description: course.description,
          publicationStatus: course.publication_status,
          provisional: course.is_provisional,
          scored: course.is_scored
        },
        modules: (modulesByCourse.get(enrolment.course_id) || []).map(
          (module) => {
            const moduleProgress = progressMap.get(module.id);
            const latestAttempt = moduleProgress
              ? (attemptsByProgress.get(moduleProgress.id) || [])[0]
              : null;
            const latestActivityAttempts = latestAttempt
              ? activityAttemptsByAttempt.get(latestAttempt.id) || []
              : [];
            const activityStatusMap = new Map();
            for (const activityAttempt of latestActivityAttempts) {
              if (!activityStatusMap.has(activityAttempt.activity_id)) {
                activityStatusMap.set(
                  activityAttempt.activity_id,
                  activityAttempt
                );
              }
            }
            const requiredIds = (
              prerequisitesByModule.get(module.id) || []
            ).map((row) => row.prerequisite_module_id);

            return {
              id: module.id,
              code: module.stable_code,
              title: module.title,
              summary: module.summary,
              position: module.position,
              publicationStatus: module.publication_status,
              provisional: module.is_provisional,
              scored: module.is_scored,
              status: moduleProgress?.status || 'not_started',
              available:
                enrolment.status !== 'withdrawn' &&
                requiredIds.every((id) => completedModuleIds.has(id)),
              prerequisiteModuleIds: requiredIds,
              activities: (activitiesByModule.get(module.id) || []).map(
                (activity) => {
                  const activityAttempt = activityStatusMap.get(activity.id);
                  return {
                    id: activity.id,
                    code: activity.stable_code,
                    title: activity.title,
                    type: activity.activity_type,
                    position: activity.position,
                    content: activity.content,
                    publicationStatus: activity.publication_status,
                    provisional: activity.is_provisional,
                    scored: activity.is_scored,
                    status: activityAttempt?.status || 'not_started',
                    completedAt: activityAttempt?.completed_at || null
                  };
                }
              )
            };
          }
        )
      };
    })
  };
}

async function loadOwnedActivityAttempt(client, identity, activityAttemptId) {
  const activityAttempt = assertNoError(
    await client
      .from('hub_activity_attempts')
      .select('*')
      .eq('id', activityAttemptId)
      .maybeSingle()
  );
  if (!activityAttempt) return null;

  const moduleAttempt = assertNoError(
    await client
      .from('hub_attempts')
      .select('id, module_progress_id')
      .eq('id', activityAttempt.attempt_id)
      .maybeSingle()
  );
  if (!moduleAttempt) return null;

  const progress = assertNoError(
    await client
      .from('hub_module_progress')
      .select('id, enrolment_id')
      .eq('id', moduleAttempt.module_progress_id)
      .maybeSingle()
  );
  if (!progress) return null;

  const enrolment = assertNoError(
    await client
      .from('hub_enrolments')
      .select('identity_id')
      .eq('id', progress.enrolment_id)
      .maybeSingle()
  );

  if (!enrolment || enrolment.identity_id !== identity.id) return null;
  return activityAttempt;
}

export function createSupabaseHubRepository({
  client,
  trainerVisibilityResolver = null
}) {
  requireClient(client);

  async function rpc(functionName, params) {
    const data = assertNoError(await client.rpc(functionName, params));
    return unwrapRpcResult(data);
  }

  async function resolveTrainerActor(identity) {
    const actor = await findIdentity(client, identity.subjectId);
    if (!trainerVisibilityResolver) unavailableTrainerVisibility();
    return actor;
  }

  return Object.freeze({
    async getLearningPath(identity) {
      const learner = await findIdentity(client, identity.subjectId);
      return loadLearnerSnapshot(client, learner);
    },

    async completeActivity({
      identity,
      activityId,
      state,
      idempotencyKey
    }) {
      return rpc('hub_complete_activity', {
        p_external_subject: identity.subjectId,
        p_activity_id: activityId,
        p_state: state,
        p_idempotency_key: idempotencyKey
      });
    },

    async startActivityAttempt({
      identity,
      activityId,
      state,
      idempotencyKey
    }) {
      const attempt = await rpc('hub_start_activity_attempt', {
        p_external_subject: identity.subjectId,
        p_activity_id: activityId,
        p_state: state,
        p_idempotency_key: idempotencyKey
      });
      return {
        created: attempt?.created === true,
        attempt
      };
    },

    async getActivityAttempt({ identity, attemptId }) {
      const learner = await findIdentity(client, identity.subjectId);
      return loadOwnedActivityAttempt(client, learner, attemptId);
    },

    async completeActivityAttempt({
      identity,
      attemptId,
      state,
      idempotencyKey
    }) {
      return rpc('hub_complete_activity_attempt', {
        p_external_subject: identity.subjectId,
        p_attempt_id: attemptId,
        p_state: state,
        p_idempotency_key: idempotencyKey
      });
    },

    async listTrainerLearners(identity) {
      const actor = await resolveTrainerActor(identity);
      const visibleIdentityIds =
        await trainerVisibilityResolver.listVisibleLearnerIdentityIds({
          actor,
          identity,
          client
        });

      if (!Array.isArray(visibleIdentityIds)) unavailableTrainerVisibility();
      if (visibleIdentityIds.length === 0) return [];

      const learners = assertNoError(
        await client
          .from('hub_identities')
          .select('id, display_name')
          .in('id', visibleIdentityIds)
      );

      return Promise.all(
        learners.map(async (learner) => ({
          id: learner.id,
          displayName: learner.display_name,
          ...(await loadLearnerSnapshot(client, learner))
        }))
      );
    },

    async getTrainerLearner({ identity, learnerIdentityId }) {
      const actor = await resolveTrainerActor(identity);
      const canView = await trainerVisibilityResolver.canViewLearner({
        actor,
        identity,
        learnerIdentityId,
        client
      });
      if (!canView) return null;

      const learner = assertNoError(
        await client
          .from('hub_identities')
          .select('id, display_name')
          .eq('id', learnerIdentityId)
          .maybeSingle()
      );
      if (!learner) return null;

      return {
        id: learner.id,
        displayName: learner.display_name,
        ...(await loadLearnerSnapshot(client, learner))
      };
    },

    async getTrainerAttempt({ identity, attemptId }) {
      const actor = await resolveTrainerActor(identity);
      const activityAttempt = assertNoError(
        await client
          .from('hub_activity_attempts')
          .select('*')
          .eq('id', attemptId)
          .maybeSingle()
      );
      if (!activityAttempt) return null;

      const moduleAttempt = assertNoError(
        await client
          .from('hub_attempts')
          .select('id, module_progress_id')
          .eq('id', activityAttempt.attempt_id)
          .maybeSingle()
      );
      if (!moduleAttempt) return null;

      const progress = assertNoError(
        await client
          .from('hub_module_progress')
          .select('enrolment_id')
          .eq('id', moduleAttempt.module_progress_id)
          .maybeSingle()
      );
      if (!progress) return null;

      const enrolment = assertNoError(
        await client
          .from('hub_enrolments')
          .select('identity_id')
          .eq('id', progress.enrolment_id)
          .maybeSingle()
      );
      if (!enrolment) return null;

      const canView = await trainerVisibilityResolver.canViewLearner({
        actor,
        identity,
        learnerIdentityId: enrolment.identity_id,
        client
      });
      return canView ? activityAttempt : null;
    }
  });
}
