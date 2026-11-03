CREATE OR REPLACE FUNCTION public.hub_validate_evaluation_policy(p_policy public.hub_scored_evaluations)
RETURNS public.hub_scored_evaluations
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action_code TEXT;
BEGIN
  IF p_policy.publication_status <> 'published' THEN RETURN p_policy; END IF;
  IF p_policy.is_provisional THEN RAISE EXCEPTION 'PUBLISHED_EVALUATION_CANNOT_BE_PROVISIONAL'; END IF;
  IF cardinality(p_policy.prerequisite_module_ids) = 0 THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITES_REQUIRED'; END IF;
  IF cardinality(p_policy.theory_item_codes) = 0 THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED'; END IF;
  IF cardinality(p_policy.required_action_codes) = 0 THEN RAISE EXCEPTION 'EVALUATION_PRACTICAL_ITEMS_REQUIRED'; END IF;
  IF cardinality(p_policy.selected_game_family_keys) = 0 THEN RAISE EXCEPTION 'EVALUATION_VERIFIED_FAMILIES_REQUIRED'; END IF;
  IF array_position(p_policy.prerequisite_module_ids, NULL) IS NOT NULL
    OR array_position(p_policy.prerequisite_evaluation_ids, NULL) IS NOT NULL
    OR EXISTS (SELECT 1 FROM unnest(p_policy.theory_item_codes) code WHERE NULLIF(btrim(code), '') IS NULL)
    OR EXISTS (SELECT 1 FROM unnest(p_policy.required_action_codes) code WHERE NULLIF(btrim(code), '') IS NULL)
    OR EXISTS (SELECT 1 FROM unnest(p_policy.selected_game_family_keys) code WHERE NULLIF(btrim(code), '') IS NULL)
  THEN RAISE EXCEPTION 'EVALUATION_CONFIGURATION_INVALID'; END IF;
  IF (SELECT COUNT(*) FROM unnest(p_policy.prerequisite_module_ids) value)
      <> (SELECT COUNT(DISTINCT value) FROM unnest(p_policy.prerequisite_module_ids) value)
    OR (SELECT COUNT(*) FROM unnest(p_policy.prerequisite_evaluation_ids) value)
      <> (SELECT COUNT(DISTINCT value) FROM unnest(p_policy.prerequisite_evaluation_ids) value)
    OR (SELECT COUNT(*) FROM unnest(p_policy.theory_item_codes) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(p_policy.theory_item_codes) value)
    OR (SELECT COUNT(*) FROM unnest(p_policy.required_action_codes) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(p_policy.required_action_codes) value)
    OR (SELECT COUNT(*) FROM unnest(p_policy.selected_game_family_keys) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(p_policy.selected_game_family_keys) value)
  THEN RAISE EXCEPTION 'EVALUATION_CONFIGURATION_DUPLICATE'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_policy.prerequisite_module_ids) module_id
    LEFT JOIN public.hub_modules module ON module.id = module_id
    WHERE module.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_MODULE_PREREQUISITE_NOT_FOUND'; END IF;
  IF p_policy.id = ANY(p_policy.prerequisite_evaluation_ids) OR EXISTS (
    SELECT 1 FROM unnest(p_policy.prerequisite_evaluation_ids) evaluation_id
    LEFT JOIN public.hub_scored_evaluations evaluation ON evaluation.id = evaluation_id
    WHERE evaluation.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_NOT_FOUND'; END IF;
  IF EXISTS (
    WITH RECURSIVE dependency(id) AS (
      SELECT unnest(p_policy.prerequisite_evaluation_ids)
      UNION
      SELECT unnest(evaluation.prerequisite_evaluation_ids)
      FROM public.hub_scored_evaluations evaluation
      JOIN dependency ON dependency.id = evaluation.id
    )
    SELECT 1 FROM dependency WHERE id = p_policy.id
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_CYCLE'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_policy.selected_game_family_keys) family_key
    LEFT JOIN public.hub_game_family_adapters adapter
      ON adapter.stable_key = family_key AND adapter.adapter_status = 'verified'
    WHERE adapter.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
  IF cardinality(p_policy.required_action_codes) > 0 THEN
    FOREACH v_action_code IN ARRAY p_policy.required_action_codes LOOP
      IF NOT (p_policy.practical_item_weights ? v_action_code)
        OR jsonb_typeof(p_policy.practical_item_weights -> v_action_code) IS DISTINCT FROM 'number'
        OR (p_policy.practical_item_weights ->> v_action_code)::NUMERIC <= 0 THEN
        RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_REQUIRED';
      END IF;
    END LOOP;
    IF (SELECT COUNT(*) FROM jsonb_object_keys(p_policy.practical_item_weights)) <> cardinality(p_policy.required_action_codes) THEN
      RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_MISMATCH';
    END IF;
    IF (SELECT SUM(value::NUMERIC) FROM jsonb_each_text(p_policy.practical_item_weights)) <> p_policy.practical_weight THEN
      RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_TOTAL_MISMATCH';
    END IF;
  END IF;
  RETURN p_policy;
END;
$$;
REVOKE ALL ON FUNCTION public.hub_validate_evaluation_policy(public.hub_scored_evaluations) FROM PUBLIC,anon,authenticated,service_role;
-- Root evaluation IDs remain stable. Published root rows and past attempts are
-- never rewritten; this append-only layer selects policy for future attempts.
CREATE TABLE public.hub_evaluation_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),evaluation_id UUID NOT NULL REFERENCES public.hub_scored_evaluations(id),
  version INTEGER NOT NULL CHECK(version>0),payload JSONB NOT NULL,
  author_id UUID NOT NULL REFERENCES public.hub_identities(id),rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(evaluation_id,version)
);
CREATE TRIGGER hub_policy_versions_immutable BEFORE UPDATE OR DELETE ON public.hub_evaluation_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();
CREATE TABLE public.hub_evaluation_policy_heads (
  evaluation_id UUID PRIMARY KEY REFERENCES public.hub_scored_evaluations(id),
  version_id UUID NOT NULL REFERENCES public.hub_evaluation_policy_versions(id)
);
ALTER TABLE public.hub_evaluation_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_evaluation_policy_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hub_evaluation_policy_versions,public.hub_evaluation_policy_heads FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.hub_evaluation_policy_versions,public.hub_evaluation_policy_heads TO service_role;

CREATE FUNCTION public.hub_effective_evaluation(p_evaluation_id UUID) RETURNS public.hub_scored_evaluations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_populate_record(e,coalesce(v.payload,'{}')||jsonb_build_object('revision',coalesce(v.version,e.revision)))
 FROM public.hub_scored_evaluations e LEFT JOIN public.hub_evaluation_policy_heads h ON h.evaluation_id=e.id
 LEFT JOIN public.hub_evaluation_policy_versions v ON v.id=h.version_id AND v.evaluation_id=e.id
 WHERE e.id=p_evaluation_id;
$$;
CREATE FUNCTION public.hub_list_effective_evaluations() RETURNS SETOF public.hub_scored_evaluations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT (public.hub_effective_evaluation(id)).* FROM public.hub_scored_evaluations ORDER BY position;
$$;

CREATE FUNCTION public.hub_publish_evaluation_policy(p_external_subject TEXT,p_evaluation_id UUID,p_expected_revision INTEGER,p_configuration JSONB,p_rationale TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor UUID;current_policy public.hub_scored_evaluations%ROWTYPE;candidate public.hub_scored_evaluations%ROWTYPE;
  version_id UUID;next_version INTEGER;configuration JSONB;allowed TEXT[]:=ARRAY['duration_minutes','theory_weight','practical_weight','selected_game_family_keys','theory_item_codes','practical_item_weights','history_review_days','history_record_limit'];
BEGIN
  actor:=public.hub_require_active_role(p_external_subject,ARRAY['trainer']);
  IF p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object' OR length(btrim(coalesce(p_rationale,''))) NOT BETWEEN 5 AND 2000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_configuration) key WHERE NOT(key=ANY(allowed))) THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  PERFORM 1 FROM public.hub_scored_evaluations WHERE id=p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVALUATION_NOT_FOUND'; END IF;
  current_policy:=public.hub_effective_evaluation(p_evaluation_id);
  IF current_policy.revision<>p_expected_revision THEN RAISE EXCEPTION 'HUB_EVALUATION_REVISION_CONFLICT'; END IF;
  next_version:=greatest(current_policy.revision,coalesce((SELECT max(version) FROM public.hub_evaluation_policy_versions WHERE evaluation_id=p_evaluation_id),0))+1;
  configuration:=p_configuration||jsonb_build_object('publication_status','published','is_provisional',FALSE,'game_family_selection_mode','selected_verified','revision',next_version);
  candidate:=jsonb_populate_record(current_policy,configuration);
  IF candidate.duration_minutes IS NULL OR candidate.theory_weight IS NULL OR candidate.practical_weight IS NULL OR candidate.history_review_days IS NULL
    OR coalesce(cardinality(candidate.theory_item_codes),0)=0 OR coalesce(cardinality(candidate.required_action_codes),0)=0
    OR coalesce(cardinality(candidate.selected_game_family_keys),0)=0 OR jsonb_typeof(candidate.practical_item_weights) IS DISTINCT FROM 'object'
    OR candidate.duration_minutes NOT BETWEEN 1 AND 480 OR candidate.theory_weight<=0 OR candidate.practical_weight<=0
    OR candidate.theory_weight+candidate.practical_weight<>100 OR candidate.history_review_days NOT BETWEEN 1 AND 365
    OR candidate.history_record_limit IS NOT NULL AND candidate.history_record_limit NOT BETWEEN 1 AND 1000
    OR candidate.max_attempts_per_set<>3 OR candidate.pass_score<>100 THEN RAISE EXCEPTION 'HUB_INVALID_INPUT'; END IF;
  -- The canonical publication validator also checks graph, weights and families.
  candidate:=public.hub_validate_evaluation_policy(candidate);
  IF EXISTS(SELECT 1 FROM unnest(candidate.theory_item_codes) code WHERE NOT EXISTS(
    SELECT 1 FROM public.hub_theory_question_versions q WHERE q.stable_code=code AND q.published)) THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED'; END IF;
  IF candidate.selected_game_family_keys<>ARRAY['orion-stars']::TEXT[] OR EXISTS(SELECT 1 FROM unnest(candidate.required_action_codes) code WHERE code NOT IN (
    'CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','ADD_CREDITS','WITHDRAW_CREDITS','REVIEW_TRANSACTION_RECORDS','RESET_PASSWORD_EDIT_INFORMATION',
    'BACKEND_CREATE_ACCOUNT','BACKEND_REFRESH_BALANCE','BACKEND_ADD_CREDITS','BACKEND_WITHDRAW_CREDITS','BACKEND_RESET_PASSWORD','RESOLVE_RECONCILIATION','CUSTOMER_RESPONSE','FULL_SHIFT_OPERATION'
  )) THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
  INSERT INTO public.hub_evaluation_policy_versions(evaluation_id,version,payload,author_id,rationale)
    VALUES(p_evaluation_id,next_version,to_jsonb(candidate),actor,btrim(p_rationale)) RETURNING id INTO version_id;
  INSERT INTO public.hub_evaluation_policy_heads(evaluation_id,version_id) VALUES(p_evaluation_id,version_id)
    ON CONFLICT(evaluation_id) DO UPDATE SET version_id=EXCLUDED.version_id;
  RETURN jsonb_build_object('evaluation',to_jsonb(candidate),'versionId',version_id);
END; $$;
CREATE FUNCTION public.hub_initialize_assessment_defaults() RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
UPDATE public.hub_game_family_adapters SET adapter_status='verified',verified_at=now() WHERE stable_key='orion-stars' AND adapter_status='not_ready';
UPDATE public.hub_scored_evaluations SET theory_item_codes=ARRAY['verification-first','no-duplicate-credit','exact-player','credential-evidence']
WHERE publication_status='draft' AND cardinality(theory_item_codes)=0;
UPDATE public.hub_scored_evaluations SET required_action_codes=ARRAY['CREATE_ACCOUNT','BACKEND_CREATE_ACCOUNT','SEARCH_USER','VERIFY_BALANCE','BACKEND_REFRESH_BALANCE','ADD_CREDITS','BACKEND_ADD_CREDITS','WITHDRAW_CREDITS','BACKEND_WITHDRAW_CREDITS','RESET_PASSWORD_EDIT_INFORMATION','BACKEND_RESET_PASSWORD'],
  practical_item_weights='{"CREATE_ACCOUNT":7,"BACKEND_CREATE_ACCOUNT":7,"SEARCH_USER":7,"VERIFY_BALANCE":7,"BACKEND_REFRESH_BALANCE":7,"ADD_CREDITS":7,"BACKEND_ADD_CREDITS":7,"WITHDRAW_CREDITS":7,"BACKEND_WITHDRAW_CREDITS":7,"RESET_PASSWORD_EDIT_INFORMATION":7,"BACKEND_RESET_PASSWORD":10}'
WHERE stable_code='checkpoint-operations' AND publication_status='draft' AND cardinality(required_action_codes)=0;
END; $$;
SELECT public.hub_initialize_assessment_defaults();
REVOKE ALL ON FUNCTION public.hub_initialize_assessment_defaults() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hub_effective_evaluation(UUID),public.hub_list_effective_evaluations(),public.hub_publish_evaluation_policy(TEXT,UUID,INTEGER,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hub_effective_evaluation(UUID),public.hub_list_effective_evaluations(),public.hub_publish_evaluation_policy(TEXT,UUID,INTEGER,JSONB,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.hub_start_scored_evaluation_attempt(
  p_external_subject TEXT,
  p_evaluation_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_id UUID;
  v_evaluation public.hub_scored_evaluations%ROWTYPE;
  v_set public.hub_evaluation_attempt_sets%ROWTYPE;
  v_attempt public.hub_scored_evaluation_attempts%ROWTYPE;
  v_attempt_number INTEGER;
  v_full_shift JSONB;v_full_actions JSONB;v_full_weights JSONB;v_workload public.hub_assessment_settings%ROWTYPE;
  v_count INTEGER;v_index INTEGER;v_type TEXT;v_share NUMERIC;
BEGIN
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  SELECT identity.id INTO v_identity_id
  FROM public.hub_identities identity
  JOIN public.hub_role_assignments assignment ON assignment.identity_id = identity.id
  JOIN public.hub_roles role ON role.id = assignment.role_id AND role.code = 'postulante'
  WHERE identity.external_subject_reference = p_external_subject
    AND identity.status = 'active'
  FOR UPDATE OF identity;
  IF v_identity_id IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  SELECT * INTO v_attempt
  FROM public.hub_scored_evaluation_attempts
  WHERE identity_id = v_identity_id
    AND evaluation_id = p_evaluation_id
    AND start_idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    SELECT * INTO v_set FROM public.hub_evaluation_attempt_sets WHERE id = v_attempt.attempt_set_id;
    RETURN jsonb_build_object(
      'attemptId', v_attempt.id,
      'attemptSetNumber', v_set.set_number,
      'attemptInSet', v_attempt.attempt_in_set,
      'attemptsRemaining', v_set.max_attempts - v_attempt.attempt_in_set,
      'expiresAt', v_attempt.expires_at,
      'settings', v_attempt.settings_snapshot,
      'replayed', TRUE
    );
  END IF;

  SELECT * INTO v_evaluation
  FROM public.hub_scored_evaluations
  WHERE id = p_evaluation_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVALUATION_NOT_FOUND'; END IF;
  v_evaluation:=public.hub_effective_evaluation(p_evaluation_id);
  IF v_evaluation.publication_status <> 'published' OR v_evaluation.is_provisional THEN
    RAISE EXCEPTION 'EVALUATION_NOT_AVAILABLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_evaluation.selected_game_family_keys) family_key
    LEFT JOIN public.hub_game_family_adapters adapter
      ON adapter.stable_key = family_key AND adapter.adapter_status = 'verified'
    WHERE adapter.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.hub_enrolments enrolment
    WHERE enrolment.identity_id = v_identity_id
      AND enrolment.status <> 'withdrawn'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_evaluation.prerequisite_module_ids) prerequisite_module_id
        WHERE NOT EXISTS (
          SELECT 1 FROM public.hub_module_progress progress
          WHERE progress.enrolment_id = enrolment.id
            AND progress.module_id = prerequisite_module_id
            AND progress.status = 'completed'
        )
      )
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_INCOMPLETE'; END IF;
  IF EXISTS (
    SELECT prerequisite_evaluation_id
    FROM unnest(v_evaluation.prerequisite_evaluation_ids) prerequisite_evaluation_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.hub_scored_evaluation_attempts prerequisite_attempt
      WHERE prerequisite_attempt.identity_id = v_identity_id
        AND prerequisite_attempt.evaluation_id = prerequisite_evaluation_id
        AND prerequisite_attempt.status = 'submitted'
        AND prerequisite_attempt.result_status = 'successful'
        AND prerequisite_attempt.score = 100
    )
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_INCOMPLETE'; END IF;

  SELECT * INTO v_set
  FROM public.hub_evaluation_attempt_sets
  WHERE evaluation_id = p_evaluation_id AND identity_id = v_identity_id
  ORDER BY set_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.hub_evaluation_attempt_sets (evaluation_id, identity_id, set_number, max_attempts)
    VALUES (p_evaluation_id, v_identity_id, 1, v_evaluation.max_attempts_per_set)
    RETURNING * INTO v_set;
  ELSIF v_set.status = 'closed' THEN
    RAISE EXCEPTION 'EVALUATION_REOPEN_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hub_scored_evaluation_attempts
    WHERE attempt_set_id = v_set.id AND status = 'in_progress'
  ) THEN RAISE EXCEPTION 'ATTEMPT_ALREADY_ACTIVE'; END IF;

  SELECT COALESCE(MAX(attempt_in_set), 0) + 1 INTO v_attempt_number
  FROM public.hub_scored_evaluation_attempts
  WHERE attempt_set_id = v_set.id;
  IF v_attempt_number > v_set.max_attempts THEN RAISE EXCEPTION 'ATTEMPT_LIMIT_REACHED'; END IF;

  IF v_evaluation.evaluation_type='final_readiness' THEN
    SELECT * INTO v_workload FROM public.hub_assessment_settings WHERE id='10000000-0000-4000-8000-000000000301' FOR SHARE;
    IF NOT FOUND OR v_workload.minimum_operations<1 OR v_workload.maximum_operations>50 OR v_workload.maximum_operations<v_workload.minimum_operations THEN RAISE EXCEPTION 'HUB_INVALID_INPUT';END IF;
    v_count:=v_workload.minimum_operations+floor(random()*(v_workload.maximum_operations-v_workload.minimum_operations+1))::integer;
    v_full_shift:=jsonb_build_object('settingsRevision',v_workload.revision,'minimumOperations',v_workload.minimum_operations,'maximumOperations',v_workload.maximum_operations,'advancedEnabled',v_workload.advanced_enabled,'operations','[]'::jsonb);
    v_full_actions:='[]';v_full_weights:='{}';v_share:=round(v_evaluation.practical_weight/v_count,6);
    FOR v_index IN 1..v_count LOOP
      v_type:=v_workload.operation_types[1+floor(random()*cardinality(v_workload.operation_types))::integer];
      IF v_workload.advanced_enabled AND random()<0.25 THEN v_type:='RECONCILIATION';END IF;
      v_full_shift:=jsonb_set(v_full_shift,'{operations}',v_full_shift->'operations'||jsonb_build_array(v_type));
      v_full_actions:=v_full_actions||jsonb_build_array('FULL_SHIFT_OPERATION_'||v_index);
      v_full_weights:=v_full_weights||jsonb_build_object('FULL_SHIFT_OPERATION_'||v_index,CASE WHEN v_index=v_count THEN v_evaluation.practical_weight-v_share*(v_count-1) ELSE v_share END);
    END LOOP;
  END IF;
  INSERT INTO public.hub_scored_evaluation_attempts (
    attempt_set_id, evaluation_id, identity_id, start_idempotency_key, attempt_in_set,
    settings_snapshot, expires_at
  ) VALUES (
    v_set.id, p_evaluation_id, v_identity_id, btrim(p_idempotency_key), v_attempt_number,
    jsonb_build_object(
      'evaluationRevision', v_evaluation.revision,
      'durationMinutes', v_evaluation.duration_minutes,
      'maxAttempts', v_evaluation.max_attempts_per_set,
      'theoryWeight', v_evaluation.theory_weight,
      'practicalWeight', v_evaluation.practical_weight,
      'passScore', v_evaluation.pass_score,
      'gameFamilyKeys', to_jsonb(v_evaluation.selected_game_family_keys),
      'prerequisiteModuleIds', to_jsonb(v_evaluation.prerequisite_module_ids),
      'prerequisiteEvaluationIds', to_jsonb(v_evaluation.prerequisite_evaluation_ids),
      'theoryItemCodes', to_jsonb(v_evaluation.theory_item_codes),
      'theoryQuestionVersionIds',(SELECT jsonb_agg(q.id ORDER BY codes.ordinality) FROM unnest(v_evaluation.theory_item_codes) WITH ORDINALITY codes(code,ordinality)
        CROSS JOIN LATERAL(SELECT id FROM public.hub_theory_question_versions WHERE stable_code=codes.code AND published ORDER BY version DESC LIMIT 1) q),
      'accountPolicyVersionId',(SELECT p.id FROM public.hub_account_policies p JOIN public.hub_activities a ON a.content->>'policyVersionId'=p.id::text WHERE a.content->>'executionKind'='account_id_lab' AND p.game='Orion Stars' ORDER BY p.version DESC LIMIT 1),
      'fullShift',v_full_shift,
      'requiredActionCodes', coalesce(v_full_actions,to_jsonb(v_evaluation.required_action_codes)),
      'practicalItemWeights', coalesce(v_full_weights,v_evaluation.practical_item_weights),
      'historyReviewDays', v_evaluation.history_review_days,
      'historyRecordLimit', v_evaluation.history_record_limit
    ),
    NOW() + make_interval(mins => v_evaluation.duration_minutes)
  ) RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'attemptId', v_attempt.id,
    'attemptSetNumber', v_set.set_number,
    'attemptInSet', v_attempt.attempt_in_set,
    'attemptsRemaining', v_set.max_attempts - v_attempt.attempt_in_set,
    'expiresAt', v_attempt.expires_at,
    'settings', v_attempt.settings_snapshot
  );
END;
$$;
