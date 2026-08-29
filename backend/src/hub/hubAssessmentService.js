import { HubError } from './HubError.js';

const DEFAULT_SETTINGS_ID = '10000000-0000-4000-8000-000000000301';
const OPERATION_TYPES = new Set(['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD']);
const FIXED_MAX_ATTEMPTS = 3;

function persistenceError() {
  return new HubError(503, 'HUB_PERSISTENCE_ERROR', 'Assessment data is temporarily unavailable.');
}

function assessmentDbError(error) {
  const message = String(error?.message || '');
  const mappings = [
    ['EVALUATION_NOT_FOUND', 404, 'HUB_EVALUATION_NOT_FOUND', 'The scored evaluation was not found.'],
    ['EVALUATION_NOT_AVAILABLE', 409, 'HUB_EVALUATION_NOT_AVAILABLE', 'This scored evaluation is not yet published with verified adapters.'],
    ['EVALUATION_REOPEN_REQUIRED', 409, 'HUB_EVALUATION_REOPEN_REQUIRED', 'TRAINER must reopen this evaluation before another attempt can begin.'],
    ['ATTEMPT_LIMIT_REACHED', 409, 'HUB_ATTEMPT_LIMIT_REACHED', 'All three attempts in this set have been used.'],
    ['ATTEMPT_ALREADY_ACTIVE', 409, 'HUB_ATTEMPT_ALREADY_ACTIVE', 'An evaluation attempt is already in progress.'],
    ['ATTEMPT_NOT_ACTIVE', 409, 'HUB_ATTEMPT_NOT_ACTIVE', 'This scored attempt is no longer active.'],
    ['ATTEMPT_EXPIRED', 409, 'HUB_ATTEMPT_EXPIRED', 'This scored attempt has expired. Reload the evaluation status before continuing.'],
    ['ATTEMPT_SET_CLOSED', 409, 'HUB_ATTEMPT_SET_CLOSED', 'This scored evaluation set is closed.'],
    ['INVALID_SCORING_EVIDENCE', 409, 'HUB_INVALID_SCORING_EVIDENCE', 'The scored evaluation evidence is invalid.'],
    ['INCOMPLETE_SCORING_EVIDENCE', 409, 'HUB_INCOMPLETE_SCORING_EVIDENCE', 'The scored evaluation evidence is incomplete.'],
    ['IDEMPOTENCY_KEY_REQUIRED', 400, 'HUB_IDEMPOTENCY_KEY_REQUIRED', 'An idempotency key is required.'],
    ['EVALUATION_PREREQUISITE_INCOMPLETE', 409, 'HUB_EVALUATION_PREREQUISITE_INCOMPLETE', 'Complete the required learning modules and earlier scored evaluation before starting this attempt.'],
    ['EVALUATION_UNVERIFIED_FAMILY', 409, 'HUB_EVALUATION_UNVERIFIED_FAMILY', 'One or more selected game families no longer have a verified adapter.'],
    ['ATTEMPT_NOT_SUBMITTABLE', 409, 'HUB_ATTEMPT_NOT_SUBMITTABLE', 'Only a completed, unsubmitted attempt can be submitted.'],
    ['ONLY_LATEST_ATTEMPT_SUBMITTABLE', 409, 'HUB_ONLY_LATEST_ATTEMPT_SUBMITTABLE', 'Only the latest scored attempt can be submitted.'],
    ['REOPEN_REASON_REQUIRED', 400, 'HUB_REOPEN_REASON_REQUIRED', 'A reopening reason is required.'],
    ['REOPEN_REASON_TOO_LONG', 400, 'HUB_REOPEN_REASON_TOO_LONG', 'The reopening reason must be 500 characters or fewer.'],
    ['EVALUATION_NOT_REOPENABLE', 409, 'HUB_EVALUATION_NOT_REOPENABLE', 'This evaluation does not have a closed attempt set to reopen.'],
    ['POSTULANTE_NOT_FOUND', 404, 'HUB_OBJECT_NOT_FOUND', 'The active Postulante was not found.'],
    ['ACCESS_DENIED', 403, 'HUB_OBJECT_FORBIDDEN', 'The authenticated subject is not authorized for this evaluation action.'],
  ];
  const match = mappings.find(([token]) => message.includes(token));
  return match ? new HubError(match[1], match[2], match[3]) : persistenceError();
}

function requireUuid(value, name) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${name} must be a UUID.`);
  }
  return text;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new HubError(400, 'HUB_VALIDATION_ERROR', `${name} must be a positive integer.`);
  return parsed;
}

function scoreWeight(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${name} must be between 0 and 100.`);
  }
  return parsed;
}

function stringList(value, name) {
  if (!Array.isArray(value)) throw new HubError(400, 'HUB_VALIDATION_ERROR', `${name} must be an array.`);
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function parseTypes(value) {
  if (!Array.isArray(value) || value.length === 0) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Select at least one operation type.');
  const types = [...new Set(value.map((item) => String(item).trim().toUpperCase()))];
  if (types.some((type) => !OPERATION_TYPES.has(type))) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'One or more operation types are unsupported.');
  return types;
}

function numberFilter(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMinutes(attempt) {
  if (!attempt.completed_at) return null;
  return Math.max(0, (new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 60000);
}

function summarize(attempts, readiness) {
  const completed = attempts.filter((attempt) => attempt.status !== 'in_progress');
  const passed = completed.filter((attempt) => attempt.status === 'passed' && Number(attempt.score) === 100);
  const scores = completed.map((attempt) => Number(attempt.score)).filter(Number.isFinite);
  const durations = completed.map(durationMinutes).filter(Number.isFinite);
  const byIdentity = new Map();
  for (const attempt of [...attempts].sort((a, b) => a.attempt_number - b.attempt_number)) {
    if (!byIdentity.has(attempt.identity_id)) byIdentity.set(attempt.identity_id, []);
    byIdentity.get(attempt.identity_id).push(attempt);
  }
  const passedGroups = [...byIdentity.values()].filter((items) => items.some((attempt) => attempt.status === 'passed'));
  const firstAttemptPasses = [...byIdentity.values()].filter((items) => items[0]?.status === 'passed').length;
  const attemptsToPass = passedGroups.map((items) => items.findIndex((attempt) => attempt.status === 'passed') + 1);
  const results = attempts.flatMap((attempt) => attempt.operationResults || []);
  const correct = results.filter((result) => result.is_correct === true).length;
  const groupAccuracy = (key) => Object.fromEntries([...new Set(results.map((result) => result[key] || 'Unknown'))].map((label) => {
    const rows = results.filter((result) => (result[key] || 'Unknown') === label);
    return [label, { total: rows.length, correct: rows.filter((row) => row.is_correct === true).length, accuracy: rows.length ? Math.round(rows.filter((row) => row.is_correct === true).length / rows.length * 100) : 0 }];
  }));
  const failures = {};
  for (const result of results) for (const failure of result.failure_points || []) failures[String(failure)] = (failures[String(failure)] || 0) + 1;
  const latestCompleted = [...completed].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0];
  const daily = new Map();
  for (const attempt of completed) {
    const date = String(attempt.completed_at).slice(0, 10);
    const item = daily.get(date) || { date, attempts: 0, passed: 0, scoreTotal: 0, scored: 0 };
    item.attempts += 1;
    if (attempt.status === 'passed') item.passed += 1;
    if (Number.isFinite(Number(attempt.score))) {
      item.scoreTotal += Number(attempt.score);
      item.scored += 1;
    }
    daily.set(date, item);
  }
  return {
    attempts: attempts.length,
    uniquePostulantes: byIdentity.size,
    completedAttempts: completed.length,
    passedAttempts: passed.length,
    passRate: completed.length ? Math.round(passed.length / completed.length * 100) : 0,
    firstAttemptPassRate: byIdentity.size ? Math.round(firstAttemptPasses / byIdentity.size * 100) : 0,
    averageAttemptsToPass: attemptsToPass.length ? Number((attemptsToPass.reduce((sum, value) => sum + value, 0) / attemptsToPass.length).toFixed(2)) : null,
    averageScore: scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    latestScore: latestCompleted && Number.isFinite(Number(latestCompleted.score)) ? Number(latestCompleted.score) : null,
    averageDurationMinutes: durations.length ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)) : null,
    timedOut: attempts.filter((attempt) => attempt.status === 'timed_out').length,
    abandoned: attempts.filter((attempt) => attempt.status === 'abandoned').length,
    operationAccuracy: results.length ? Math.round(correct / results.length * 100) : 0,
    accuracyByOperationType: groupAccuracy('operation_type'),
    accuracyByGame: groupAccuracy('game'),
    accuracyByCategory: groupAccuracy('operation_category'),
    failureBreakdown: failures,
    moduleReadyPostulantes: readiness,
    progressOverTime: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((item) => ({
      date: item.date,
      attempts: item.attempts,
      passed: item.passed,
      passRate: item.attempts ? Math.round(item.passed / item.attempts * 100) : 0,
      averageScore: item.scored ? Number((item.scoreTotal / item.scored).toFixed(2)) : null,
    })),
  };
}

export function createHubAssessmentService({ client }) {
  async function actor(identity) {
    const result = await client.from('hub_identities').select('id').eq('external_subject_reference', identity.subjectId).eq('status', 'active').maybeSingle();
    if (result.error) throw persistenceError();
    if (!result.data) throw new HubError(403, 'HUB_IDENTITY_NOT_PROVISIONED', 'The Hub identity is not active.');
    return result.data;
  }

  return Object.freeze({
    async getSettings() {
      const result = await client.from('hub_assessment_settings').select('*').eq('id', DEFAULT_SETTINGS_ID).single();
      if (result.error) throw persistenceError();
      return result.data;
    },

    async updateSettings(identity, body = {}) {
      const owner = await actor(identity);
      const durationMinutes = positiveInteger(body.durationMinutes, 'durationMinutes');
      const minimumOperations = positiveInteger(body.minimumOperations, 'minimumOperations');
      const maximumOperations = positiveInteger(body.maximumOperations, 'maximumOperations');
      if (maximumOperations < minimumOperations) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'maximumOperations must be greater than or equal to minimumOperations.');
      const result = await client.from('hub_assessment_settings').update({
        duration_minutes: durationMinutes,
        minimum_operations: minimumOperations,
        maximum_operations: maximumOperations,
        operation_types: parseTypes(body.operationTypes),
        advanced_enabled: body.advancedEnabled === true,
        updated_by_identity_id: owner.id,
      }).eq('id', DEFAULT_SETTINGS_ID).select('*').single();
      if (result.error) throw persistenceError();
      return result.data;
    },

    async listEvaluationPolicies(identity, { includeAudit = false } = {}) {
      await actor(identity);
      const [evaluationResult, adapterResult] = await Promise.all([
        client.from('hub_scored_evaluations').select('*').order('position', { ascending: true }),
        client.from('hub_game_family_adapters').select('id, stable_key, display_name, adapter_status, display_order').order('display_order', { ascending: true }),
      ]);
      if (evaluationResult.error || adapterResult.error) throw persistenceError();
      const payload = {
        evaluations: evaluationResult.data || [],
        gameFamilies: adapterResult.data || [],
        defaults: { maxAttemptsPerSet: FIXED_MAX_ATTEMPTS, theoryWeight: 20, practicalWeight: 80, passScore: 100 },
      };
      if (!includeAudit) return payload;

      const [setResult, attemptResult, itemResult, reopenResult] = await Promise.all([
        client.from('hub_evaluation_attempt_sets')
          .select('*, postulante:hub_identities!hub_evaluation_attempt_sets_identity_id_fkey(id, username, display_name)')
          .order('opened_at', { ascending: false }).limit(500),
        client.from('hub_scored_evaluation_attempts')
          .select('id, attempt_set_id, evaluation_id, identity_id, attempt_in_set, status, result_status, completion_reason, score, settings_snapshot, started_at, completed_at, submitted_at')
          .order('started_at', { ascending: false }).limit(1500),
        client.from('hub_scored_evaluation_item_results')
          .select('id, attempt_id, section, item_code, game_family_key, sequence_number, item_weight, is_correct, failure_points, created_at')
          .order('created_at', { ascending: false }).limit(5000),
        client.from('hub_evaluation_reopen_events')
          .select('*, reopenedBy:hub_identities!hub_evaluation_reopen_events_reopened_by_identity_id_fkey(id, username, display_name)')
          .order('created_at', { ascending: false }).limit(500),
      ]);
      if (setResult.error || attemptResult.error || itemResult.error || reopenResult.error) throw persistenceError();
      return {
        ...payload,
        attemptSets: setResult.data || [],
        attempts: attemptResult.data || [],
        itemResults: itemResult.data || [],
        reopenEvents: reopenResult.data || [],
      };
    },

    async updateEvaluationPolicy(identity, evaluationId, body = {}) {
      const owner = await actor(identity);
      const id = requireUuid(evaluationId, 'evaluationId');
      const expectedRevision = positiveInteger(body.expectedRevision, 'expectedRevision');
      const durationMinutes = positiveInteger(body.durationMinutes, 'durationMinutes');
      const theoryWeight = scoreWeight(body.theoryWeight, 'theoryWeight');
      const practicalWeight = scoreWeight(body.practicalWeight, 'practicalWeight');
      if (theoryWeight + practicalWeight !== 100) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Theory and practical weights must total 100.');
      }
      const historyReviewDays = positiveInteger(body.historyReviewDays, 'historyReviewDays');
      const historyRecordLimit = body.historyRecordLimit === null || body.historyRecordLimit === '' || body.historyRecordLimit === undefined
        ? null
        : positiveInteger(body.historyRecordLimit, 'historyRecordLimit');
      const requestedFamilies = stringList(body.gameFamilyKeys, 'gameFamilyKeys');
      const adapterResult = await client.from('hub_game_family_adapters')
        .select('stable_key').eq('adapter_status', 'verified').order('display_order', { ascending: true });
      if (adapterResult.error) throw persistenceError();
      const verifiedFamilies = (adapterResult.data || []).map((row) => row.stable_key);
      const selectedFamilies = body.includeAllVerifiedFamilies === false ? requestedFamilies : verifiedFamilies;
      if (selectedFamilies.length === 0 || selectedFamilies.some((key) => !verifiedFamilies.includes(key))) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Select at least one verified game family.');
      }
      const currentResult = await client.from('hub_scored_evaluations')
        .select('id, revision, publication_status').eq('id', id).maybeSingle();
      if (currentResult.error) throw persistenceError();
      if (!currentResult.data) throw new HubError(404, 'HUB_EVALUATION_NOT_FOUND', 'The scored evaluation was not found.');
      if (currentResult.data.publication_status !== 'draft') {
        throw new HubError(409, 'HUB_EVALUATION_IMMUTABLE', 'Published or retired evaluation policy is immutable.');
      }
      if (Number(currentResult.data.revision) !== expectedRevision) {
        throw new HubError(409, 'HUB_EVALUATION_REVISION_CONFLICT', 'The evaluation policy changed. Reload it before saving.');
      }
      const result = await client.from('hub_scored_evaluations').update({
        duration_minutes: durationMinutes,
        theory_weight: theoryWeight,
        practical_weight: practicalWeight,
        game_family_selection_mode: body.includeAllVerifiedFamilies === false ? 'selected_verified' : 'all_verified',
        selected_game_family_keys: selectedFamilies,
        history_review_days: historyReviewDays,
        history_record_limit: historyRecordLimit,
        updated_by_identity_id: owner.id,
      }).eq('id', id).eq('revision', expectedRevision).eq('publication_status', 'draft').select('*').maybeSingle();
      if (result.error) throw persistenceError();
      if (!result.data) throw new HubError(409, 'HUB_EVALUATION_REVISION_CONFLICT', 'The evaluation policy changed. Reload it before saving.');
      return result.data;
    },

    async getMyEvaluations(identity) {
      const owner = await actor(identity);
      const expired = await client.rpc('hub_expire_scored_evaluation_attempts');
      if (expired.error) throw persistenceError();
      const [evaluationResult, setResult, attemptResult] = await Promise.all([
        client.from('hub_scored_evaluations')
          .select('id, stable_code, title, position, evaluation_type, publication_status, is_provisional, duration_minutes, max_attempts_per_set, theory_weight, practical_weight, pass_score, selected_game_family_keys, required_action_codes, history_review_days, history_record_limit, revision')
          .order('position', { ascending: true }),
        client.from('hub_evaluation_attempt_sets')
          .select('id, evaluation_id, set_number, status, max_attempts, opened_at, closed_at')
          .eq('identity_id', owner.id).order('set_number', { ascending: false }),
        client.from('hub_scored_evaluation_attempts')
          .select('id, attempt_set_id, evaluation_id, attempt_in_set, status, result_status, completion_reason, score, started_at, completed_at, submitted_at')
          .eq('identity_id', owner.id).order('started_at', { ascending: false }),
      ]);
      if (evaluationResult.error || setResult.error || attemptResult.error) throw persistenceError();
      const sets = setResult.data || [];
      const attempts = attemptResult.data || [];
      return {
        evaluations: (evaluationResult.data || []).map((evaluation) => {
          const latestSet = sets.find((set) => set.evaluation_id === evaluation.id) || null;
          const setAttempts = latestSet ? attempts.filter((attempt) => attempt.attempt_set_id === latestSet.id) : [];
          const latestAttempt = setAttempts[0] || null;
          const publicEvaluation = evaluation.publication_status === 'published' && !evaluation.is_provisional
            ? evaluation
            : {
                id: evaluation.id,
                stable_code: evaluation.stable_code,
                title: evaluation.title,
                position: evaluation.position,
                evaluation_type: evaluation.evaluation_type,
                publication_status: evaluation.publication_status,
                is_provisional: evaluation.is_provisional,
                max_attempts_per_set: FIXED_MAX_ATTEMPTS,
              };
          return {
            ...publicEvaluation,
            attemptSet: latestSet,
            attempts: setAttempts,
            attemptsRemaining: latestSet ? Math.max(0, latestSet.max_attempts - setAttempts.length) : evaluation.max_attempts_per_set,
            canSubmit: latestAttempt?.status === 'scored',
            requiresTrainerReopen: latestSet?.status === 'closed' && latestAttempt?.status !== 'submitted' ? true : latestSet?.status === 'closed',
          };
        }),
      };
    },

    async startEvaluationAttempt(identity, evaluationId, body = {}) {
      const expired = await client.rpc('hub_expire_scored_evaluation_attempts');
      if (expired.error) throw persistenceError();
      const idempotencyKey = String(body.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new HubError(400, 'HUB_IDEMPOTENCY_KEY_REQUIRED', 'An idempotency key is required.');
      const result = await client.rpc('hub_start_scored_evaluation_attempt', {
        p_external_subject: identity.subjectId,
        p_evaluation_id: requireUuid(evaluationId, 'evaluationId'),
        p_idempotency_key: idempotencyKey,
      });
      if (result.error) throw assessmentDbError(result.error);
      return result.data;
    },

    async submitEvaluationAttempt(identity, attemptId) {
      const result = await client.rpc('hub_submit_scored_evaluation_attempt', {
        p_external_subject: identity.subjectId,
        p_attempt_id: requireUuid(attemptId, 'attemptId'),
      });
      if (result.error) throw assessmentDbError(result.error);
      return result.data;
    },

    async reopenEvaluation(identity, evaluationId, postulanteIdentityId, body = {}) {
      const reason = String(body.reason || '').trim();
      if (!reason) throw new HubError(400, 'HUB_REOPEN_REASON_REQUIRED', 'A reopening reason is required.');
      if (reason.length > 500) throw new HubError(400, 'HUB_REOPEN_REASON_TOO_LONG', 'The reopening reason must be 500 characters or fewer.');
      const result = await client.rpc('hub_reopen_scored_evaluation', {
        p_external_subject: identity.subjectId,
        p_evaluation_id: requireUuid(evaluationId, 'evaluationId'),
        p_postulante_identity_id: requireUuid(postulanteIdentityId, 'postulanteIdentityId'),
        p_reason: reason,
      });
      if (result.error) throw assessmentDbError(result.error);
      return result.data;
    },

    async report(query = {}) {
      const expired = await client.rpc('hub_expire_assessment_attempts');
      if (expired.error) throw persistenceError();
      const result = await client.from('hub_assessment_attempts')
        .select('*, postulante:hub_identities!hub_assessment_attempts_identity_id_fkey(id, username, display_name), operationResults:hub_assessment_operation_results(*)')
        .order('started_at', { ascending: false }).limit(500);
      if (result.error) throw persistenceError();
      const scoreMin = numberFilter(query.scoreMin);
      const scoreMax = numberFilter(query.scoreMax);
      const durationMin = numberFilter(query.durationMin);
      const durationMax = numberFilter(query.durationMax);
      const from = query.from ? new Date(query.from).getTime() : null;
      const to = query.to ? new Date(query.to).getTime() : null;
      const attempts = (result.data || []).filter((attempt) => {
        const score = Number(attempt.score);
        const duration = durationMinutes(attempt);
        const operationResults = attempt.operationResults || [];
        if (query.postulanteId && attempt.identity_id !== query.postulanteId) return false;
        if (query.status && attempt.status !== query.status) return false;
        if (query.result === 'passed' && attempt.status !== 'passed') return false;
        if (query.result === 'unsuccessful' && !['unsuccessful', 'timed_out', 'abandoned'].includes(attempt.status)) return false;
        if (Number.isFinite(from) && new Date(attempt.started_at).getTime() < from) return false;
        if (Number.isFinite(to) && new Date(attempt.started_at).getTime() > to) return false;
        if (scoreMin !== null && (!Number.isFinite(score) || score < scoreMin)) return false;
        if (scoreMax !== null && (!Number.isFinite(score) || score > scoreMax)) return false;
        if (durationMin !== null && (!Number.isFinite(duration) || duration < durationMin)) return false;
        if (durationMax !== null && (!Number.isFinite(duration) || duration > durationMax)) return false;
        if (query.operationType && !operationResults.some((row) => row.operation_type === query.operationType)) return false;
        if (query.category && !operationResults.some((row) => row.operation_category === query.category)) return false;
        if (query.game && !operationResults.some((row) => row.game === query.game)) return false;
        if (query.failure && !operationResults.some((row) => (row.failure_points || []).map(String).includes(query.failure))) return false;
        if (query.settingsRevision && Number(attempt.settings_snapshot?.revision) !== Number(query.settingsRevision)) return false;
        return true;
      });
      const enrolments = await client.from('hub_enrolments').select('identity_id, hub_module_progress(module_id,status)').neq('status', 'withdrawn');
      if (enrolments.error) throw persistenceError();
      const ready = (enrolments.data || []).filter((enrolment) => new Set((enrolment.hub_module_progress || []).filter((row) => row.status === 'completed' && row.module_id !== '10000000-0000-4000-8000-000000000111').map((row) => row.module_id)).size >= 10).length;
      return { attempts, statistics: summarize(attempts, ready), filters: query };
    },
  });
}
