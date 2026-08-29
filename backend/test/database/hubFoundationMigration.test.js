import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260820003000_hub_foundation.sql',
  import.meta.url,
);
const seedUrl = new URL('../../../supabase/seed.sql', import.meta.url);

const [sql, seed] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(seedUrl, 'utf8'),
]);

const requiredTables = [
  'hub_identities',
  'hub_roles',
  'hub_role_assignments',
  'hub_courses',
  'hub_modules',
  'hub_activities',
  'hub_module_prerequisites',
  'hub_enrolments',
  'hub_module_progress',
  'hub_attempts',
  'hub_activity_attempts',
  'hub_evidence_events',
  'hub_attempt_artifacts',
  'hub_idempotency_keys',
];

test('creates the provider-neutral Hub foundation records', () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`, 'i'));
  }
  assert.match(sql, /external_subject_reference TEXT NOT NULL UNIQUE/i);
  assert.doesNotMatch(sql, /auth\.users|password_hash|identity_provider/i);
  assert.match(sql, /legacy_trainee_session_id UUID[\s\S]*REFERENCES public\.trainee_sessions/i);
});

test('keeps course, module, activity, enrolment, and progress links constrained', () => {
  assert.match(sql, /UNIQUE \(course_id, stable_code\)/i);
  assert.match(sql, /FOREIGN KEY \(module_id, course_id\)[\s\S]*hub_modules\(id, course_id\)/i);
  assert.match(sql, /FOREIGN KEY \(enrolment_id, course_id\)[\s\S]*hub_enrolments\(id, course_id\)/i);
  assert.match(sql, /UNIQUE \(enrolment_id, module_id\)/i);
  assert.match(sql, /UNIQUE \(attempt_id, activity_id\)/i);
});

test('makes evidence and artifacts append-only', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hub_reject_append_only_mutation/i);
  assert.match(sql, /hub_evidence_events_append_only[\s\S]*BEFORE UPDATE OR DELETE/i);
  assert.match(sql, /hub_attempt_artifacts_append_only[\s\S]*BEFORE UPDATE OR DELETE/i);
  assert.match(sql, /RAISE EXCEPTION '% is append-only'/i);
});

test('keeps every browser database role away from Hub objects and RPCs', () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role/i);
  assert.match(sql, /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role/i);
});

test('guards mutation RPCs by ownership and prerequisite completion', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hub_start_activity_attempt/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hub_complete_activity_attempt/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hub_complete_activity/i);
  assert.match(sql, /enrolment\.identity_id = v_identity_id/i);
  assert.match(sql, /enrolment\.status <> 'withdrawn'/i);
  assert.match(sql, /HUB_ACCESS_DENIED/i);
  assert.match(sql, /hub_module_prerequisites[\s\S]*progress\.status = 'completed'[\s\S]*HUB_PREREQUISITE_INCOMPLETE/i);
});

test('persists deterministic responses and rejects key reuse with another payload', () => {
  assert.doesNotMatch(sql, /(?<!extensions\.)digest\s*\(/i);
  assert.match(sql, /extensions\.digest\s*\(/i);
  assert.match(sql, /PRIMARY KEY \(identity_id, action_code, idempotency_key\)/i);
  assert.match(sql, /request_fingerprint TEXT NOT NULL/i);
  assert.match(sql, /IF v_claim\.request_fingerprint <> v_fingerprint[\s\S]*HUB_IDEMPOTENCY_CONFLICT/i);
  assert.match(sql, /IF v_claim\.response IS NOT NULL THEN[\s\S]*RETURN v_claim\.response/i);
  assert.match(sql, /SET response = v_result/i);
});

test('serializes distinct start keys before creating a missing progress row', () => {
  assert.match(
    sql,
    /missing progress row cannot itself be locked[\s\S]*FROM public\.hub_enrolments[\s\S]*FOR UPDATE;[\s\S]*FROM public\.hub_module_progress[\s\S]*FOR UPDATE;/i,
  );
});

test('uses the same enrolment-progress-attempt lock order for completion', () => {
  assert.match(
    sql,
    /Match the start path's enrolment -> progress -> attempt lock order[\s\S]*FROM public\.hub_enrolments[\s\S]*FOR UPDATE;[\s\S]*FROM public\.hub_module_progress[\s\S]*FOR UPDATE;[\s\S]*FROM public\.hub_attempts[\s\S]*FOR UPDATE;/i,
  );
});

test('revalidates withdrawn status while holding the enrolment lock', () => {
  assert.match(
    sql,
    /SELECT locked_enrolment\.\* INTO v_enrolment[\s\S]*locked_enrolment\.status <> 'withdrawn'[\s\S]*FOR UPDATE;[\s\S]*IF NOT FOUND THEN[\s\S]*HUB_ACCESS_DENIED/i,
  );
  assert.match(
    sql,
    /Match the start path's[\s\S]*FROM public\.hub_enrolments[\s\S]*status <> 'withdrawn'[\s\S]*FOR UPDATE;[\s\S]*IF NOT FOUND THEN[\s\S]*HUB_ACCESS_DENIED/i,
  );
});

test('seeds Modules 1-11 with explicit policy gates and a scored final assessment definition', () => {
  const ids = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000106',
    '10000000-0000-4000-8000-000000000107',
    '10000000-0000-4000-8000-000000000108',
    '10000000-0000-4000-8000-000000000109',
    '10000000-0000-4000-8000-000000000110',
    '10000000-0000-4000-8000-000000000111',
    '10000000-0000-4000-8000-000000001101',
    '10000000-0000-4000-8000-000000001102',
    '10000000-0000-4000-8000-000000001103',
    '10000000-0000-4000-8000-000000002101',
    '10000000-0000-4000-8000-000000002102',
    '10000000-0000-4000-8000-000000002103',
    '10000000-0000-4000-8000-000000003101',
    '10000000-0000-4000-8000-000000003102',
    '10000000-0000-4000-8000-000000003103',
    '10000000-0000-4000-8000-000000004101',
    '10000000-0000-4000-8000-000000004102',
    '10000000-0000-4000-8000-000000006101',
    '10000000-0000-4000-8000-000000006102',
    '10000000-0000-4000-8000-000000006103',
    '10000000-0000-4000-8000-000000007101',
    '10000000-0000-4000-8000-000000007102',
    '10000000-0000-4000-8000-000000007103',
    '10000000-0000-4000-8000-000000008101',
    '10000000-0000-4000-8000-000000008102',
    '10000000-0000-4000-8000-000000008103',
    '10000000-0000-4000-8000-000000009101',
    '10000000-0000-4000-8000-000000009102',
    '10000000-0000-4000-8000-000000009103',
    '10000000-0000-4000-8000-000000010101',
    '10000000-0000-4000-8000-000000010102',
    '10000000-0000-4000-8000-000000010103',
    '10000000-0000-4000-8000-000000011101',
    '10000000-0000-4000-8000-000000011102',
  ];
  for (const id of ids) assert.match(seed, new RegExp(id));

  assert.match(seed, /'understanding-the-work'/i);
  assert.match(seed, /'complete-workflow-orientation'/i);
  assert.match(seed, /'account-creation'/i);
  assert.match(seed, /'search-for-customer'/i);
  assert.match(seed, /'refresh-balance'/i);
  assert.match(seed, /'add-credits'/i);
  assert.match(seed, /'withdraw-credits'/i);
  assert.match(seed, /'reset-password'/i);
  assert.match(seed, /'exceptional-advanced-operations'/i);
  assert.match(seed, /'mixed-operation-practice'/i);
  assert.match(seed, /'final-full-shift-assessment'/i);
  assert.match(seed, /"policyStatus": "required"/i);
  assert.match(seed, /INSERT INTO hub_module_prerequisites/i);
  assert.match(seed, /"policyStatus": "required"/i);
  assert.match(seed, /"artifactStatus": "required"/i);
  assert.match(seed, /"targetArtifactType": "CREATED_GAME_ACCOUNT"/i);
  assert.doesNotMatch(seed, /"policyStatus": "approved"/i);
  assert.match(seed, /no pass[\s\S]*threshold,[\s\S]*password,[\s\S]*escalation procedure is[\s\S]*seeded/i);
  assert.doesNotMatch(seed, /85%|passing_score|password\s*[:=]/i);
  assert.match(
    sql,
    /activity_content[\s\S]*policyStatus'[\s\S]*required[\s\S]*artifactStatus'[\s\S]*required[\s\S]*HUB_ACTIVITY_BLOCKED/i,
  );
});

test('final assessment foundation stores configurable snapshots, timeout outcomes, and filtered reporting data', async () => {
  const url = new URL('../../../supabase/migrations/20260828000000_hub_final_assessment.sql', import.meta.url);
  const assessmentSql = await readFile(url, 'utf8');
  assert.match(assessmentSql, /CREATE TABLE public\.hub_assessment_settings/i);
  assert.match(assessmentSql, /revision INTEGER NOT NULL DEFAULT 1/i);
  assert.match(assessmentSql, /hub_assessment_settings_revision_trigger/i);
  assert.match(assessmentSql, /duration_minutes INTEGER NOT NULL DEFAULT 30/i);
  assert.match(assessmentSql, /minimum_operations INTEGER NOT NULL DEFAULT 2/i);
  assert.match(assessmentSql, /maximum_operations INTEGER NOT NULL DEFAULT 6/i);
  assert.match(assessmentSql, /CREATE TABLE public\.hub_assessment_attempts/i);
  assert.match(assessmentSql, /settings_snapshot JSONB NOT NULL/i);
  assert.match(assessmentSql, /status IN \('in_progress', 'passed', 'unsuccessful', 'timed_out', 'abandoned'\)/i);
  assert.match(assessmentSql, /status <> 'passed' OR score = 100/i);
  assert.match(assessmentSql, /hub_expire_assessment_attempts/i);
  assert.match(assessmentSql, /REVOKE ALL ON public\.hub_assessment_settings/i);
  assert.match(seed, /'10000000-0000-4000-8000-000000000301'/i);
});

test('scored evaluation governance enforces four evaluations, 20/80 scoring, three-attempt sets, and private reopen evidence', async () => {
  const url = new URL('../../../supabase/migrations/20260829000000_hub_scored_evaluation_governance.sql', import.meta.url);
  const governanceSql = await readFile(url, 'utf8');
  assert.match(governanceSql, /CREATE TABLE public\.hub_scored_evaluations/i);
  assert.match(governanceSql, /max_attempts_per_set INTEGER NOT NULL DEFAULT 3 CHECK \(max_attempts_per_set = 3\)/i);
  assert.match(governanceSql, /theory_weight NUMERIC\(5,2\) NOT NULL DEFAULT 20/i);
  assert.match(governanceSql, /practical_weight NUMERIC\(5,2\) NOT NULL DEFAULT 80/i);
  assert.match(governanceSql, /pass_score NUMERIC\(5,2\) NOT NULL DEFAULT 100 CHECK \(pass_score = 100\)/i);
  assert.match(governanceSql, /CREATE TABLE public\.hub_evaluation_attempt_sets/i);
  assert.match(governanceSql, /hub_evaluation_attempt_sets_one_open_idx[\s\S]*WHERE status = 'open'/i);
  assert.match(governanceSql, /hub_scored_evaluation_attempts_one_active_idx[\s\S]*WHERE status = 'in_progress'/i);
  assert.match(governanceSql, /start_idempotency_key TEXT NOT NULL/i);
  assert.match(governanceSql, /UNIQUE \(identity_id, evaluation_id, start_idempotency_key\)/i);
  assert.match(governanceSql, /status IN \('in_progress', 'scored', 'submitted', 'timed_out', 'abandoned'\)/i);
  assert.match(governanceSql, /CREATE OR REPLACE FUNCTION public\.hub_start_scored_evaluation_attempt\([\s\S]*p_idempotency_key TEXT/i);
  assert.match(governanceSql, /role\.code = 'postulante'[\s\S]*EVALUATION_PREREQUISITE_INCOMPLETE/i);
  assert.match(governanceSql, /prerequisite_module_ids[\s\S]*hub_module_progress[\s\S]*progress\.status = 'completed'/i);
  assert.match(governanceSql, /prerequisite_evaluation_ids[\s\S]*prerequisite_attempt\.status = 'submitted'[\s\S]*prerequisite_attempt\.score = 100/i);
  assert.match(governanceSql, /selected_game_family_keys[\s\S]*adapter\.adapter_status = 'verified'/i);
  assert.match(governanceSql, /NOT \(NEW\.practical_item_weights \? v_action_code\)[\s\S]*EVALUATION_ACTION_WEIGHT_TOTAL_MISMATCH/i);
  assert.match(governanceSql, /EVALUATION_PREREQUISITE_CYCLE/i);
  assert.match(governanceSql, /EVALUATION_PUBLICATION_TRANSITION_INVALID/i);
  assert.match(governanceSql, /OLD\.publication_status IN \('published', 'retired'\)/i);
  assert.match(governanceSql, /CREATE OR REPLACE FUNCTION public\.hub_expire_scored_evaluation_attempts\(\)/i);
  assert.match(governanceSql, /completion_reason = 'timed_out'[\s\S]*attempt\.attempt_in_set = attempt_set\.max_attempts/i);
  assert.match(governanceSql, /theoryItemCodes[\s\S]*requiredActionCodes[\s\S]*practicalItemWeights/i);
  assert.match(governanceSql, /jsonb_array_elements_text\(v_attempt\.settings_snapshot->'gameFamilyKeys'\)[\s\S]*CROSS JOIN jsonb_array_elements_text\(v_attempt\.settings_snapshot->'requiredActionCodes'\)/i);
  assert.match(governanceSql, /ELSE \(v_attempt\.settings_snapshot->'practicalItemWeights'->>btrim\(row\.item_code\)\)::NUMERIC/i);
  assert.doesNotMatch(governanceSql, /row\.item_weight/i);
  assert.match(governanceSql, /ONLY_LATEST_ATTEMPT_SUBMITTABLE/i);
  assert.match(governanceSql, /v_attempt\.attempt_in_set = v_set\.max_attempts[\s\S]*'submitted'/i);
  assert.match(governanceSql, /CREATE TABLE public\.hub_evaluation_reopen_events/i);
  assert.match(governanceSql, /hub_evaluation_reopen_events_append_only/i);
  assert.match(governanceSql, /hub_evaluation_attempt_sets_delete_guard/i);
  assert.match(governanceSql, /hub_scored_evaluation_attempts_delete_guard/i);
  assert.match(governanceSql, /role\.code = 'trainer'/i);
  assert.match(governanceSql, /REOPEN_REASON_REQUIRED/i);
  assert.match(governanceSql, /REOPEN_REASON_TOO_LONG/i);
  assert.match(governanceSql, /REVOKE ALL ON public\.hub_game_family_adapters,[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(governanceSql, /REVOKE ALL ON public\.hub_game_family_adapters,[\s\S]*FROM service_role[\s\S]*GRANT SELECT ON public\.hub_game_family_adapters/i);
  assert.match(governanceSql, /REVOKE ALL ON FUNCTION public\.hub_start_scored_evaluation_attempt\(TEXT, UUID, TEXT\),[\s\S]*public\.hub_score_scored_evaluation_attempt\(UUID, JSONB\),[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(governanceSql, /'CREATE_ACCOUNT',[\s\S]*'SEARCH_USER',[\s\S]*'VERIFY_BALANCE',[\s\S]*'ADD_CREDITS',[\s\S]*'WITHDRAW_CREDITS',[\s\S]*'REVIEW_TRANSACTION_RECORDS',[\s\S]*'RESET_PASSWORD_EDIT_INFORMATION'/i);
  assert.equal((seed.match(/'checkpoint-game-platforms'|'checkpoint-operations'|'checkpoint-movements-customer-experience'|'final-pretraining-readiness'/g) || []).length >= 4, true);
  assert.match(seed, /'orion-stars'[\s\S]*'verified'[\s\S]*'golden-dragon'[\s\S]*'not_ready'[\s\S]*'vblink'[\s\S]*'not_ready'/i);
});

test('Withdraw Credits practice uses the guarded local game-side redeem bridge', async () => {
  const url = new URL('../../../supabase/migrations/20260827000000_hub_withdraw_credits_practice.sql', import.meta.url);
  const withdrawSql = await readFile(url, 'utf8');
  assert.match(withdrawSql, /hub_redeem_withdraw_credits_practice/i);
  assert.match(withdrawSql, /redeem_sandbox_game_account/i);
  assert.match(withdrawSql, /GAME WITHDRAW CREDITS/i);
  assert.match(withdrawSql, /REVOKE ALL ON FUNCTION public\.hub_redeem_withdraw_credits_practice/i);
  assert.match(seed, /'orion-stars-withdraw-credits'/i);
  assert.match(seed, /"surface": "withdraw_credits"/i);
});

test('focused practice links a Hub attempt to an untimed disposable sandbox', async () => {
  const focusedUrl = new URL(
    '../../../supabase/migrations/20260826000000_hub_focused_practice.sql',
    import.meta.url,
  );
  const focusedSql = await readFile(focusedUrl, 'utf8');
  assert.match(focusedSql, /CREATE TABLE public\.hub_practice_contexts/i);
  assert.match(focusedSql, /activity_attempt_id UUID NOT NULL/i);
  assert.match(focusedSql, /legacy_trainee_session_id UUID NOT NULL UNIQUE REFERENCES public\.trainee_sessions/i);
  assert.match(focusedSql, /FOREIGN KEY \(activity_attempt_id, attempt_id\)[\s\S]*hub_activity_attempts/i);
  assert.match(focusedSql, /REVOKE ALL ON public\.hub_practice_contexts FROM PUBLIC, anon, authenticated/i);
  assert.match(seed, /'orion-stars-refresh-balance'/i);
  assert.match(seed, /"timedSimulator": false/i);
  assert.match(seed, /"id": "vblink"[\s\S]*"status": "not_ready"/i);
  assert.match(seed, /"id": "golden-dragon"[\s\S]*"status": "not_ready"/i);
});

test('Add Credits practice links an existing reservation without introducing a new policy', async () => {
  const addCreditsUrl = new URL(
    '../../../supabase/migrations/20260826010000_hub_add_credits_practice.sql',
    import.meta.url,
  );
  const addCreditsSql = await readFile(addCreditsUrl, 'utf8');
  assert.match(addCreditsSql, /ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public\.sandbox_operations/i);
  assert.match(addCreditsSql, /hub_practice_contexts_operation_id_uq/i);
  assert.match(addCreditsSql, /hub_recharge_add_credits_practice/i);
  assert.match(addCreditsSql, /REVOKE ALL ON FUNCTION public\.hub_recharge_add_credits_practice/i);
  assert.match(seed, /'orion-stars-add-credits'/i);
  assert.match(seed, /"surface": "add_credits"/i);
  assert.match(seed, /"amount": 25/i);
  assert.match(seed, /'10000000-0000-4000-8000-000000000106'/i);
});
