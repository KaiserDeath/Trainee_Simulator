import { HubError } from './HubError.js';

function persistenceError() {
  return new HubError(
    503,
    'HUB_PERSISTENCE_ERROR',
    'Hub audit data is temporarily unavailable.'
  );
}

function dataOrThrow(result) {
  if (result.error) throw persistenceError();
  return result.data;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    const group = groups.get(value) || [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

function pageRows(rows, limit, cursorField = 'id') {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor:
      hasMore && items.length > 0
        ? items[items.length - 1][cursorField]
        : null
  };
}

async function selectIn(client, table, fields, column, values) {
  if (values.length === 0) return [];
  return dataOrThrow(
    await client.from(table).select(fields).in(column, values)
  ) || [];
}

async function loadTraineePage(client, { limit, cursor }) {
  let identityQuery = client
    .from('hub_role_assignments')
    .select(
      'identity_id, hub_roles!inner(code), hub_identities!inner(id, display_name, status)'
    )
    .eq('hub_roles.code', 'postulante')
    .order('identity_id', { ascending: true })
    .limit(limit + 1);
  if (cursor) identityQuery = identityQuery.gt('identity_id', cursor);

  const roleRows = dataOrThrow(await identityQuery) || [];
  const rolePage = pageRows(roleRows, limit, 'identity_id');
  const identities = rolePage.items.map((row) => {
    const identity = Array.isArray(row.hub_identities)
      ? row.hub_identities[0]
      : row.hub_identities;
    return identity;
  }).filter(Boolean);

  return {
    postulantes: identities.map((identity) => ({
      identity: {
        id: identity.id,
        displayName: identity.display_name,
        status: identity.status
      }
    })),
    nextCursor: rolePage.nextCursor
  };
}

async function loadLegacySessionPage(client, { limit, cursor }) {
  let sessionQuery = client
    .from('trainee_sessions')
    .select('id, trainee_name, status, started_at, ended_at')
    .order('id', { ascending: true })
    .limit(limit + 1);
  if (cursor) sessionQuery = sessionQuery.gt('id', cursor);

  const sessionRows = dataOrThrow(await sessionQuery) || [];
  const sessionPage = pageRows(sessionRows, limit);
  const sessionIds = sessionPage.items.map((row) => row.id);
  const attempts = await selectIn(
    client,
    'hub_attempts',
    'id, module_progress_id, legacy_trainee_session_id',
    'legacy_trainee_session_id',
    sessionIds
  );
  const progressRows = await selectIn(
    client,
    'hub_module_progress',
    'id, enrolment_id',
    'id',
    attempts.map((row) => row.module_progress_id)
  );
  const enrolments = await selectIn(
    client,
    'hub_enrolments',
    'id, identity_id',
    'id',
    progressRows.map((row) => row.enrolment_id)
  );
  const progressMap = new Map(progressRows.map((row) => [row.id, row]));
  const enrolmentMap = new Map(enrolments.map((row) => [row.id, row]));
  const attemptsBySession = groupBy(attempts, 'legacy_trainee_session_id');

  return {
    sessions: sessionPage.items.map((session) => {
      const linkedAttempts = attemptsBySession.get(session.id) || [];
      const hubIdentityIds = [...new Set(linkedAttempts.map((attempt) => {
        const progress = progressMap.get(attempt.module_progress_id);
        return enrolmentMap.get(progress?.enrolment_id)?.identity_id;
      }).filter(Boolean))];
      return {
        id: session.id,
        traineeName: session.trainee_name,
        status: session.status,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        lineage: linkedAttempts.length > 0
          ? {
              status: 'linked',
              linkedAttemptCount: linkedAttempts.length,
              linkedIdentityCount: hubIdentityIds.length,
              reason: 'EXPLICIT_HUB_ATTEMPT_LINK'
            }
          : {
              status: 'unlinked',
              linkedAttemptCount: 0,
              linkedIdentityCount: 0,
              reason: 'LEGACY_NAME_ONLY_SESSION'
            }
      };
    }),
    nextCursor: sessionPage.nextCursor
  };
}

async function loadAttemptOwner(client, attempt) {
  const progress = dataOrThrow(
    await client
      .from('hub_module_progress')
      .select('id, enrolment_id')
      .eq('id', attempt.module_progress_id)
      .maybeSingle()
  );
  if (!progress) return null;
  const enrolment = dataOrThrow(
    await client
      .from('hub_enrolments')
      .select('id, identity_id')
      .eq('id', progress.enrolment_id)
      .maybeSingle()
  );
  if (!enrolment) return null;
  const traineeRole = dataOrThrow(
    await client
      .from('hub_role_assignments')
      .select('identity_id, hub_roles!inner(code)')
      .eq('identity_id', enrolment.identity_id)
      .eq('hub_roles.code', 'postulante')
      .maybeSingle()
  );
  return traineeRole ? enrolment.identity_id : null;
}

async function loadTraineeLearningRecords(
  client,
  identityId,
  { limit, moduleCursor, attemptCursor }
) {
  const identity = dataOrThrow(
    await client
      .from('hub_identities')
      .select('id, display_name, status')
      .eq('id', identityId)
      .maybeSingle()
  );
  if (!identity) return null;
  const traineeRole = dataOrThrow(
    await client
      .from('hub_role_assignments')
      .select('identity_id, hub_roles!inner(code)')
      .eq('identity_id', identityId)
      .eq('hub_roles.code', 'postulante')
      .maybeSingle()
  );
  if (!traineeRole) return null;

  const enrolments = dataOrThrow(
    await client
      .from('hub_enrolments')
      .select(
        'id, identity_id, course_id, status, assigned_at, started_at, completed_at'
      )
      .eq('identity_id', identityId)
  ) || [];
  const courseIds = [...new Set(enrolments.map((row) => row.course_id))];
  const courses = await selectIn(
    client,
    'hub_courses',
    'id, stable_code, title',
    'id',
    courseIds
  );
  const modules = await selectIn(
    client,
    'hub_modules',
    'id, course_id, stable_code, title, position',
    'course_id',
    courseIds
  );
  const progressRows = await selectIn(
    client,
    'hub_module_progress',
    'id, enrolment_id, module_id, status, started_at, completed_at',
    'enrolment_id',
    enrolments.map((row) => row.id)
  );
  const attempts = await selectIn(
    client,
    'hub_attempts',
    'id, module_progress_id, module_id, attempt_number, attempt_mode, status, legacy_trainee_session_id, started_at, completed_at',
    'module_progress_id',
    progressRows.map((row) => row.id)
  );

  const courseMap = new Map(courses.map((row) => [row.id, row]));
  const modulesByCourse = groupBy(modules, 'course_id');
  const progressMap = new Map(
    progressRows.map((row) => [`${row.enrolment_id}:${row.module_id}`, row])
  );
  const progressById = new Map(progressRows.map((row) => [row.id, row]));
  const enrolmentMap = new Map(enrolments.map((row) => [row.id, row]));

  const moduleRows = enrolments.flatMap((enrolment) => {
    const course = courseMap.get(enrolment.course_id);
    return (modulesByCourse.get(enrolment.course_id) || []).map((module) => {
      const progress = progressMap.get(`${enrolment.id}:${module.id}`);
      return {
        cursorId: module.id,
        enrolment: {
          id: enrolment.id,
          status: enrolment.status,
          assignedAt: enrolment.assigned_at,
          startedAt: enrolment.started_at,
          completedAt: enrolment.completed_at
        },
        course: {
          id: course.id,
          code: course.stable_code,
          title: course.title
        },
        module: {
          id: module.id,
          code: module.stable_code,
          title: module.title,
          position: module.position,
          status: progress?.status || 'not_started',
          startedAt: progress?.started_at || null,
          completedAt: progress?.completed_at || null
        }
      };
    });
  }).sort((a, b) => a.cursorId.localeCompare(b.cursorId));
  const visibleModuleRows = moduleCursor
    ? moduleRows.filter((row) => row.cursorId > moduleCursor)
    : moduleRows;
  const modulePage = pageRows(visibleModuleRows, limit, 'cursorId');

  const attemptRows = attempts.map((attempt) => {
    const progress = progressById.get(attempt.module_progress_id);
    const enrolment = enrolmentMap.get(progress?.enrolment_id);
    return {
      id: attempt.id,
      enrolmentId: enrolment?.id || null,
      courseId: enrolment?.course_id || null,
      moduleId: attempt.module_id,
      attemptNumber: attempt.attempt_number,
      attemptMode: attempt.attempt_mode,
      status: attempt.status,
      startedAt: attempt.started_at,
      completedAt: attempt.completed_at,
      lineage: attempt.legacy_trainee_session_id
        ? {
            status: 'linked',
            legacyTraineeSessionId: attempt.legacy_trainee_session_id,
            reason: 'EXPLICIT_HUB_ATTEMPT_LINK'
          }
        : {
            status: 'unlinked',
            legacyTraineeSessionId: null,
            reason: 'NO_DURABLE_LEGACY_SESSION_LINK'
          }
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const visibleAttempts = attemptCursor
    ? attemptRows.filter((row) => row.id > attemptCursor)
    : attemptRows;
  const attemptPage = pageRows(visibleAttempts, limit);

  return {
    postulante: {
      id: identity.id,
      displayName: identity.display_name,
      status: identity.status
    },
    moduleRecords: modulePage.items.map(({ cursorId, ...row }) => row),
    attempts: attemptPage.items,
    pageInfo: {
      moduleRecords: {
        limit,
        nextCursor: modulePage.nextCursor
      },
      attempts: {
        limit,
        nextCursor: attemptPage.nextCursor
      }
    }
  };
}

async function loadCursorPage({
  client,
  table,
  select,
  attemptId,
  limit,
  cursor
}) {
  let query = client
    .from(table)
    .select(select)
    .eq('attempt_id', attemptId)
    .order('id', { ascending: true })
    .limit(limit + 1);
  if (cursor) query = query.gt('id', cursor);
  return pageRows(dataOrThrow(await query) || [], limit);
}

export function createSupabaseHubAuditorRepository({ client }) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('A Supabase service-role client is required.');
  }

  return Object.freeze({
    async getOverview(pagination) {
      const [traineePage, sessionPage] = await Promise.all([
        loadTraineePage(client, {
          limit: pagination.limit,
          cursor: pagination.postulanteCursor
        }),
        loadLegacySessionPage(client, {
          limit: pagination.limit,
          cursor: pagination.sessionCursor
        })
      ]);
      return {
        postulantes: traineePage.postulantes,
        legacySimulatorSessions: sessionPage.sessions,
        pageInfo: {
          postulantes: {
            limit: pagination.limit,
            nextCursor: traineePage.nextCursor
          },
          legacySimulatorSessions: {
            limit: pagination.limit,
            nextCursor: sessionPage.nextCursor
          }
        }
      };
    },

    async getHubAttempt(attemptId, pagination) {
      const attempt = dataOrThrow(
        await client
          .from('hub_attempts')
          .select(
            'id, module_progress_id, module_id, attempt_number, attempt_mode, status, legacy_trainee_session_id, started_at, completed_at'
          )
          .eq('id', attemptId)
          .maybeSingle()
      );
      if (!attempt) return null;
      const hubIdentityId = await loadAttemptOwner(client, attempt);
      if (!hubIdentityId) return null;

      const [activityPage, evidencePage, artifactPage] = await Promise.all([
        loadCursorPage({
          client,
          table: 'hub_activity_attempts',
          select:
            'id, attempt_id, activity_id, status, state, started_at, completed_at',
          attemptId,
          limit: pagination.limit,
          cursor: pagination.activityCursor
        }),
        loadCursorPage({
          client,
          table: 'hub_evidence_events',
          select:
            'id, attempt_id, activity_attempt_id, sequence_number, event_type, occurred_at, payload',
          attemptId,
          limit: pagination.limit,
          cursor: pagination.evidenceCursor
        }),
        loadCursorPage({
          client,
          table: 'hub_attempt_artifacts',
          select:
            'id, attempt_id, activity_attempt_id, artifact_type, created_at, payload',
          attemptId,
          limit: pagination.limit,
          cursor: pagination.artifactCursor
        })
      ]);

      return {
        attempt: {
          id: attempt.id,
          hubIdentityId,
          moduleId: attempt.module_id,
          attemptNumber: attempt.attempt_number,
          attemptMode: attempt.attempt_mode,
          status: attempt.status,
          startedAt: attempt.started_at,
          completedAt: attempt.completed_at,
          lineage: attempt.legacy_trainee_session_id
            ? {
                status: 'linked',
                legacyTraineeSessionId: attempt.legacy_trainee_session_id,
                reason: 'EXPLICIT_HUB_ATTEMPT_LINK'
              }
            : {
                status: 'unlinked',
                legacyTraineeSessionId: null,
                reason: 'NO_DURABLE_LEGACY_SESSION_LINK'
              }
        },
        activityAttempts: activityPage.items,
        evidenceEvents: evidencePage.items,
        artifacts: artifactPage.items,
        pageInfo: {
          activityAttempts: {
            limit: pagination.limit,
            nextCursor: activityPage.nextCursor
          },
          evidenceEvents: {
            limit: pagination.limit,
            nextCursor: evidencePage.nextCursor
          },
          artifacts: {
            limit: pagination.limit,
            nextCursor: artifactPage.nextCursor
          }
        }
      };
    },

    getTraineeLearningRecords(identityId, pagination) {
      return loadTraineeLearningRecords(
        client,
        identityId,
        pagination
      );
    },

    async getLegacySession(sessionId) {
      const session = dataOrThrow(
        await client
          .from('trainee_sessions')
          .select('id, trainee_name, status, started_at, ended_at')
          .eq('id', sessionId)
          .maybeSingle()
      );
      if (!session) return null;

      const attempts = await selectIn(
        client,
        'hub_attempts',
        'id, module_progress_id, legacy_trainee_session_id',
        'legacy_trainee_session_id',
        [sessionId]
      );
      const progressRows = await selectIn(
        client,
        'hub_module_progress',
        'id, enrolment_id',
        'id',
        attempts.map((row) => row.module_progress_id)
      );
      const enrolments = await selectIn(
        client,
        'hub_enrolments',
        'id, identity_id',
        'id',
        progressRows.map((row) => row.enrolment_id)
      );
      const progressMap = new Map(progressRows.map((row) => [row.id, row]));
      const enrolmentMap = new Map(enrolments.map((row) => [row.id, row]));
      const hubIdentityIds = [...new Set(attempts.map((attempt) => {
        const progress = progressMap.get(attempt.module_progress_id);
        return enrolmentMap.get(progress?.enrolment_id)?.identity_id;
      }).filter(Boolean))];

      return {
        id: session.id,
        traineeName: session.trainee_name,
        status: session.status,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        lineage: attempts.length > 0
          ? {
              status: 'linked',
              linkedAttemptCount: attempts.length,
              linkedIdentityCount: hubIdentityIds.length,
              reason: 'EXPLICIT_HUB_ATTEMPT_LINK'
            }
          : {
              status: 'unlinked',
              linkedAttemptCount: 0,
              linkedIdentityCount: 0,
              reason: 'LEGACY_NAME_ONLY_SESSION'
            }
      };
    }
  });
}
