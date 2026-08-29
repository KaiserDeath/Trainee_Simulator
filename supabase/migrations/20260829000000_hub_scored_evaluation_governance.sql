-- Governed scored evaluations. This migration adds the approved four-evaluation
-- model without enabling an unverified game adapter or trusting browser scores.

ALTER TABLE public.hub_assessment_settings
  ADD COLUMN max_attempts_per_set INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts_per_set = 3),
  ADD COLUMN theory_weight NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (theory_weight BETWEEN 0 AND 100),
  ADD COLUMN practical_weight NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (practical_weight BETWEEN 0 AND 100),
  ADD COLUMN history_review_days INTEGER NOT NULL DEFAULT 7 CHECK (history_review_days > 0),
  ADD COLUMN history_record_limit INTEGER CHECK (history_record_limit IS NULL OR history_record_limit > 0),
  ADD CONSTRAINT hub_assessment_settings_weight_total CHECK (theory_weight + practical_weight = 100);

CREATE TABLE public.hub_game_family_adapters (
  id UUID PRIMARY KEY,
  stable_key TEXT NOT NULL UNIQUE CHECK (stable_key = lower(stable_key)),
  display_name TEXT NOT NULL,
  adapter_status TEXT NOT NULL DEFAULT 'not_ready'
    CHECK (adapter_status IN ('verified', 'not_ready', 'retired')),
  display_order INTEGER NOT NULL CHECK (display_order > 0),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((adapter_status = 'verified' AND verified_at IS NOT NULL) OR adapter_status <> 'verified')
);

CREATE TABLE public.hub_scored_evaluations (
  id UUID PRIMARY KEY,
  stable_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 4),
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN ('checkpoint', 'final_readiness')),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'retired')),
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  max_attempts_per_set INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts_per_set = 3),
  theory_weight NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (theory_weight BETWEEN 0 AND 100),
  practical_weight NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (practical_weight BETWEEN 0 AND 100),
  pass_score NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (pass_score = 100),
  game_family_selection_mode TEXT NOT NULL DEFAULT 'all_verified'
    CHECK (game_family_selection_mode IN ('all_verified', 'selected_verified')),
  selected_game_family_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  prerequisite_module_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  prerequisite_evaluation_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  theory_item_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_action_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  practical_item_weights JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(practical_item_weights) = 'object'),
  history_review_days INTEGER NOT NULL DEFAULT 7 CHECK (history_review_days > 0),
  history_record_limit INTEGER CHECK (history_record_limit IS NULL OR history_record_limit > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by_identity_id UUID REFERENCES public.hub_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (theory_weight + practical_weight = 100),
  CHECK (
    stable_code <> 'checkpoint-game-platforms'
    OR required_action_codes = ARRAY[
      'CREATE_ACCOUNT',
      'SEARCH_USER',
      'VERIFY_BALANCE',
      'ADD_CREDITS',
      'WITHDRAW_CREDITS',
      'REVIEW_TRANSACTION_RECORDS',
      'RESET_PASSWORD_EDIT_INFORMATION'
    ]::TEXT[]
  )
);

CREATE OR REPLACE FUNCTION public.hub_increment_scored_evaluation_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_scored_evaluation_revision_trigger
BEFORE UPDATE ON public.hub_scored_evaluations
FOR EACH ROW EXECUTE FUNCTION public.hub_increment_scored_evaluation_revision();

CREATE OR REPLACE FUNCTION public.hub_validate_scored_evaluation_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action_code TEXT;
BEGIN
  IF NEW.publication_status <> 'published' THEN RETURN NEW; END IF;
  IF NEW.is_provisional THEN RAISE EXCEPTION 'PUBLISHED_EVALUATION_CANNOT_BE_PROVISIONAL'; END IF;
  IF cardinality(NEW.prerequisite_module_ids) = 0 THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITES_REQUIRED'; END IF;
  IF cardinality(NEW.theory_item_codes) = 0 THEN RAISE EXCEPTION 'EVALUATION_THEORY_ITEMS_REQUIRED'; END IF;
  IF cardinality(NEW.required_action_codes) = 0 THEN RAISE EXCEPTION 'EVALUATION_PRACTICAL_ITEMS_REQUIRED'; END IF;
  IF cardinality(NEW.selected_game_family_keys) = 0 THEN RAISE EXCEPTION 'EVALUATION_VERIFIED_FAMILIES_REQUIRED'; END IF;
  IF array_position(NEW.prerequisite_module_ids, NULL) IS NOT NULL
    OR array_position(NEW.prerequisite_evaluation_ids, NULL) IS NOT NULL
    OR EXISTS (SELECT 1 FROM unnest(NEW.theory_item_codes) code WHERE NULLIF(btrim(code), '') IS NULL)
    OR EXISTS (SELECT 1 FROM unnest(NEW.required_action_codes) code WHERE NULLIF(btrim(code), '') IS NULL)
    OR EXISTS (SELECT 1 FROM unnest(NEW.selected_game_family_keys) code WHERE NULLIF(btrim(code), '') IS NULL)
  THEN RAISE EXCEPTION 'EVALUATION_CONFIGURATION_INVALID'; END IF;
  IF (SELECT COUNT(*) FROM unnest(NEW.prerequisite_module_ids) value)
      <> (SELECT COUNT(DISTINCT value) FROM unnest(NEW.prerequisite_module_ids) value)
    OR (SELECT COUNT(*) FROM unnest(NEW.prerequisite_evaluation_ids) value)
      <> (SELECT COUNT(DISTINCT value) FROM unnest(NEW.prerequisite_evaluation_ids) value)
    OR (SELECT COUNT(*) FROM unnest(NEW.theory_item_codes) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(NEW.theory_item_codes) value)
    OR (SELECT COUNT(*) FROM unnest(NEW.required_action_codes) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(NEW.required_action_codes) value)
    OR (SELECT COUNT(*) FROM unnest(NEW.selected_game_family_keys) value)
      <> (SELECT COUNT(DISTINCT btrim(value)) FROM unnest(NEW.selected_game_family_keys) value)
  THEN RAISE EXCEPTION 'EVALUATION_CONFIGURATION_DUPLICATE'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.prerequisite_module_ids) module_id
    LEFT JOIN public.hub_modules module ON module.id = module_id
    WHERE module.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_MODULE_PREREQUISITE_NOT_FOUND'; END IF;
  IF NEW.id = ANY(NEW.prerequisite_evaluation_ids) OR EXISTS (
    SELECT 1 FROM unnest(NEW.prerequisite_evaluation_ids) evaluation_id
    LEFT JOIN public.hub_scored_evaluations evaluation ON evaluation.id = evaluation_id
    WHERE evaluation.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_NOT_FOUND'; END IF;
  IF EXISTS (
    WITH RECURSIVE dependency(id) AS (
      SELECT unnest(NEW.prerequisite_evaluation_ids)
      UNION
      SELECT unnest(evaluation.prerequisite_evaluation_ids)
      FROM public.hub_scored_evaluations evaluation
      JOIN dependency ON dependency.id = evaluation.id
    )
    SELECT 1 FROM dependency WHERE id = NEW.id
  ) THEN RAISE EXCEPTION 'EVALUATION_PREREQUISITE_CYCLE'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.selected_game_family_keys) family_key
    LEFT JOIN public.hub_game_family_adapters adapter
      ON adapter.stable_key = family_key AND adapter.adapter_status = 'verified'
    WHERE adapter.id IS NULL
  ) THEN RAISE EXCEPTION 'EVALUATION_UNVERIFIED_FAMILY'; END IF;
  IF cardinality(NEW.required_action_codes) > 0 THEN
    FOREACH v_action_code IN ARRAY NEW.required_action_codes LOOP
      IF NOT (NEW.practical_item_weights ? v_action_code)
        OR jsonb_typeof(NEW.practical_item_weights -> v_action_code) IS DISTINCT FROM 'number'
        OR (NEW.practical_item_weights ->> v_action_code)::NUMERIC <= 0 THEN
        RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_REQUIRED';
      END IF;
    END LOOP;
    IF (SELECT COUNT(*) FROM jsonb_object_keys(NEW.practical_item_weights)) <> cardinality(NEW.required_action_codes) THEN
      RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_MISMATCH';
    END IF;
    IF (SELECT SUM(value::NUMERIC) FROM jsonb_each_text(NEW.practical_item_weights)) <> NEW.practical_weight THEN
      RAISE EXCEPTION 'EVALUATION_ACTION_WEIGHT_TOTAL_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_scored_evaluation_publication_guard
BEFORE INSERT OR UPDATE ON public.hub_scored_evaluations
FOR EACH ROW EXECUTE FUNCTION public.hub_validate_scored_evaluation_publication();

CREATE TABLE public.hub_evaluation_attempt_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.hub_scored_evaluations(id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  set_number INTEGER NOT NULL CHECK (set_number > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts = 3),
  opened_by_identity_id UUID REFERENCES public.hub_identities(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evaluation_id, identity_id, set_number),
  UNIQUE (id, evaluation_id, identity_id),
  CHECK ((status = 'closed' AND closed_at IS NOT NULL) OR (status = 'open' AND closed_at IS NULL))
);

CREATE TABLE public.hub_scored_evaluation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_set_id UUID NOT NULL REFERENCES public.hub_evaluation_attempt_sets(id) ON DELETE RESTRICT,
  evaluation_id UUID NOT NULL REFERENCES public.hub_scored_evaluations(id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  start_idempotency_key TEXT NOT NULL CHECK (btrim(start_idempotency_key) <> '' AND char_length(start_idempotency_key) <= 200),
  attempt_in_set INTEGER NOT NULL CHECK (attempt_in_set BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'scored', 'submitted', 'timed_out', 'abandoned')),
  result_status TEXT CHECK (result_status IN ('successful', 'unsuccessful')),
  completion_reason TEXT CHECK (completion_reason IN ('completed', 'timed_out', 'abandoned')),
  score NUMERIC(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  settings_snapshot JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_set_id, attempt_in_set),
  UNIQUE (identity_id, evaluation_id, start_idempotency_key),
  FOREIGN KEY (attempt_set_id, evaluation_id, identity_id)
    REFERENCES public.hub_evaluation_attempt_sets(id, evaluation_id, identity_id) ON DELETE RESTRICT,
  CHECK ((status = 'in_progress' AND completed_at IS NULL) OR status <> 'in_progress'),
  CHECK ((status = 'submitted' AND submitted_at IS NOT NULL) OR status <> 'submitted'),
  CHECK (jsonb_typeof(settings_snapshot) = 'object'),
  CHECK (expires_at > started_at),
  CHECK (
    (status = 'in_progress' AND score IS NULL AND result_status IS NULL AND completion_reason IS NULL AND submitted_at IS NULL)
    OR
    (status <> 'in_progress' AND score IS NOT NULL AND result_status IS NOT NULL AND completion_reason IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CHECK ((status = 'submitted' AND submitted_at IS NOT NULL) OR (status <> 'submitted' AND submitted_at IS NULL)),
  CHECK ((result_status = 'successful' AND score = 100) OR (result_status = 'unsuccessful' AND score < 100) OR result_status IS NULL)
);

CREATE TABLE public.hub_scored_evaluation_item_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.hub_scored_evaluation_attempts(id) ON DELETE RESTRICT,
  section TEXT NOT NULL CHECK (section IN ('theory', 'practical')),
  item_code TEXT NOT NULL,
  game_family_key TEXT,
  sequence_number INTEGER CHECK (sequence_number IS NULL OR sequence_number > 0),
  item_weight NUMERIC(8,3) NOT NULL CHECK (item_weight > 0),
  is_correct BOOLEAN NOT NULL,
  failure_points JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(failure_points) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, section, item_code, game_family_key),
  CHECK ((section = 'theory' AND game_family_key IS NULL AND sequence_number IS NULL)
    OR (section = 'practical' AND game_family_key IS NOT NULL AND sequence_number IS NOT NULL))
);

CREATE TABLE public.hub_evaluation_reopen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.hub_scored_evaluations(id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  previous_attempt_set_id UUID NOT NULL REFERENCES public.hub_evaluation_attempt_sets(id) ON DELETE RESTRICT,
  new_attempt_set_id UUID NOT NULL REFERENCES public.hub_evaluation_attempt_sets(id) ON DELETE RESTRICT,
  reopened_by_identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (btrim(reason) <> '' AND char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (new_attempt_set_id),
  FOREIGN KEY (previous_attempt_set_id, evaluation_id, identity_id)
    REFERENCES public.hub_evaluation_attempt_sets(id, evaluation_id, identity_id) ON DELETE RESTRICT,
  FOREIGN KEY (new_attempt_set_id, evaluation_id, identity_id)
    REFERENCES public.hub_evaluation_attempt_sets(id, evaluation_id, identity_id) ON DELETE RESTRICT
);

CREATE TRIGGER hub_scored_evaluation_item_results_append_only
BEFORE UPDATE OR DELETE ON public.hub_scored_evaluation_item_results
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE TRIGGER hub_evaluation_reopen_events_append_only
BEFORE UPDATE OR DELETE ON public.hub_evaluation_reopen_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE INDEX hub_evaluation_attempt_sets_identity_idx
  ON public.hub_evaluation_attempt_sets(identity_id, evaluation_id, set_number DESC);
CREATE UNIQUE INDEX hub_evaluation_attempt_sets_one_open_idx
  ON public.hub_evaluation_attempt_sets(identity_id, evaluation_id)
  WHERE status = 'open';
CREATE INDEX hub_scored_evaluation_attempts_identity_idx
  ON public.hub_scored_evaluation_attempts(identity_id, evaluation_id, started_at DESC);
CREATE INDEX hub_scored_evaluation_attempts_expiry_idx
  ON public.hub_scored_evaluation_attempts(status, expires_at)
  WHERE status = 'in_progress';
CREATE UNIQUE INDEX hub_scored_evaluation_attempts_one_active_idx
  ON public.hub_scored_evaluation_attempts(attempt_set_id)
  WHERE status = 'in_progress';
CREATE UNIQUE INDEX hub_scored_evaluation_theory_result_unique_idx
  ON public.hub_scored_evaluation_item_results(attempt_id, item_code)
  WHERE section = 'theory';
CREATE UNIQUE INDEX hub_scored_evaluation_practical_sequence_unique_idx
  ON public.hub_scored_evaluation_item_results(attempt_id, sequence_number)
  WHERE section = 'practical';
CREATE INDEX hub_evaluation_reopen_events_identity_idx
  ON public.hub_evaluation_reopen_events(identity_id, evaluation_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.hub_guard_scored_evaluation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.publication_status = 'published' AND NEW.publication_status NOT IN ('published', 'retired'))
    OR (OLD.publication_status = 'retired' AND NEW.publication_status <> 'retired')
  THEN RAISE EXCEPTION 'EVALUATION_PUBLICATION_TRANSITION_INVALID'; END IF;
  IF OLD.publication_status IN ('published', 'retired') AND (
    NEW.stable_code IS DISTINCT FROM OLD.stable_code
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.position IS DISTINCT FROM OLD.position
    OR NEW.evaluation_type IS DISTINCT FROM OLD.evaluation_type
    OR NEW.is_provisional IS DISTINCT FROM OLD.is_provisional
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.max_attempts_per_set IS DISTINCT FROM OLD.max_attempts_per_set
    OR NEW.theory_weight IS DISTINCT FROM OLD.theory_weight
    OR NEW.practical_weight IS DISTINCT FROM OLD.practical_weight
    OR NEW.pass_score IS DISTINCT FROM OLD.pass_score
    OR NEW.game_family_selection_mode IS DISTINCT FROM OLD.game_family_selection_mode
    OR NEW.selected_game_family_keys IS DISTINCT FROM OLD.selected_game_family_keys
    OR NEW.prerequisite_module_ids IS DISTINCT FROM OLD.prerequisite_module_ids
    OR NEW.prerequisite_evaluation_ids IS DISTINCT FROM OLD.prerequisite_evaluation_ids
    OR NEW.theory_item_codes IS DISTINCT FROM OLD.theory_item_codes
    OR NEW.required_action_codes IS DISTINCT FROM OLD.required_action_codes
    OR NEW.practical_item_weights IS DISTINCT FROM OLD.practical_item_weights
    OR NEW.history_review_days IS DISTINCT FROM OLD.history_review_days
    OR NEW.history_record_limit IS DISTINCT FROM OLD.history_record_limit
  ) THEN RAISE EXCEPTION 'PUBLISHED_EVALUATION_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_scored_evaluation_mutation_guard
BEFORE UPDATE ON public.hub_scored_evaluations
FOR EACH ROW EXECUTE FUNCTION public.hub_guard_scored_evaluation_mutation();

CREATE OR REPLACE FUNCTION public.hub_guard_evaluation_attempt_set_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id
    OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
    OR NEW.set_number IS DISTINCT FROM OLD.set_number
    OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    OR NEW.opened_by_identity_id IS DISTINCT FROM OLD.opened_by_identity_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.status = 'closed'
    OR (OLD.status = 'open' AND NEW.status NOT IN ('open', 'closed'))
  THEN RAISE EXCEPTION 'ATTEMPT_SET_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_evaluation_attempt_set_mutation_guard
BEFORE UPDATE ON public.hub_evaluation_attempt_sets
FOR EACH ROW EXECUTE FUNCTION public.hub_guard_evaluation_attempt_set_mutation();

CREATE OR REPLACE FUNCTION public.hub_guard_scored_attempt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_set_id IS DISTINCT FROM OLD.attempt_set_id
    OR NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id
    OR NEW.identity_id IS DISTINCT FROM OLD.identity_id
    OR NEW.start_idempotency_key IS DISTINCT FROM OLD.start_idempotency_key
    OR NEW.attempt_in_set IS DISTINCT FROM OLD.attempt_in_set
    OR NEW.settings_snapshot IS DISTINCT FROM OLD.settings_snapshot
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.status = 'submitted'
    OR (OLD.status = 'scored' AND NEW.status NOT IN ('scored', 'submitted'))
    OR (OLD.status IN ('timed_out', 'abandoned') AND NEW.status <> OLD.status)
  THEN RAISE EXCEPTION 'SCORED_ATTEMPT_IMMUTABLE'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_scored_attempt_mutation_guard
BEFORE UPDATE ON public.hub_scored_evaluation_attempts
FOR EACH ROW EXECUTE FUNCTION public.hub_guard_scored_attempt_mutation();

CREATE TRIGGER hub_evaluation_attempt_sets_delete_guard
BEFORE DELETE ON public.hub_evaluation_attempt_sets
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE TRIGGER hub_scored_evaluation_attempts_delete_guard
BEFORE DELETE ON public.hub_scored_evaluation_attempts
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

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
      'requiredActionCodes', to_jsonb(v_evaluation.required_action_codes),
      'practicalItemWeights', v_evaluation.practical_item_weights,
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

CREATE OR REPLACE FUNCTION public.hub_score_scored_evaluation_attempt(
  p_attempt_id UUID,
  p_item_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.hub_scored_evaluation_attempts%ROWTYPE;
  v_set public.hub_evaluation_attempt_sets%ROWTYPE;
  v_theory_total NUMERIC;
  v_theory_correct NUMERIC;
  v_practical_total NUMERIC;
  v_practical_correct NUMERIC;
  v_score NUMERIC(5,2);
  v_all_correct BOOLEAN;
  v_auto_submitted BOOLEAN := FALSE;
BEGIN
  IF jsonb_typeof(p_item_results) <> 'array' OR jsonb_array_length(p_item_results) = 0 THEN
    RAISE EXCEPTION 'INVALID_SCORING_EVIDENCE';
  END IF;

  SELECT * INTO v_attempt FROM public.hub_scored_evaluation_attempts
  WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'in_progress' THEN RAISE EXCEPTION 'ATTEMPT_NOT_ACTIVE'; END IF;
  IF v_attempt.expires_at <= NOW() THEN RAISE EXCEPTION 'ATTEMPT_EXPIRED'; END IF;

  SELECT * INTO v_set FROM public.hub_evaluation_attempt_sets
  WHERE id = v_attempt.attempt_set_id FOR UPDATE;
  IF v_set.status <> 'open' THEN RAISE EXCEPTION 'ATTEMPT_SET_CLOSED'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_item_results) AS row(
      section TEXT, item_code TEXT, game_family_key TEXT, sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
    )
    WHERE row.section NOT IN ('theory', 'practical')
      OR NULLIF(btrim(row.item_code), '') IS NULL
      OR row.is_correct IS NULL
      OR (row.failure_points IS NOT NULL AND jsonb_typeof(row.failure_points) <> 'array')
      OR (row.section = 'theory' AND (NULLIF(btrim(row.game_family_key), '') IS NOT NULL OR row.sequence_number IS NOT NULL))
      OR (row.section = 'practical' AND (NULLIF(btrim(row.game_family_key), '') IS NULL OR row.sequence_number IS NULL))
  ) THEN RAISE EXCEPTION 'INVALID_SCORING_EVIDENCE'; END IF;

  IF EXISTS (
    SELECT expected.code
    FROM jsonb_array_elements_text(v_attempt.settings_snapshot->'theoryItemCodes') expected(code)
    WHERE (
      SELECT COUNT(*) FROM jsonb_to_recordset(p_item_results) AS row(
        section TEXT, item_code TEXT, game_family_key TEXT, sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
      ) WHERE row.section = 'theory' AND btrim(row.item_code) = expected.code
    ) <> 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_item_results) AS row(
      section TEXT, item_code TEXT, game_family_key TEXT, sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
    )
    WHERE row.section = 'theory'
      AND NOT (v_attempt.settings_snapshot->'theoryItemCodes' ? btrim(row.item_code))
  ) THEN RAISE EXCEPTION 'INCOMPLETE_SCORING_EVIDENCE'; END IF;

  IF EXISTS (
    SELECT family.code, action.code
    FROM jsonb_array_elements_text(v_attempt.settings_snapshot->'gameFamilyKeys') WITH ORDINALITY family(code, family_index)
    CROSS JOIN jsonb_array_elements_text(v_attempt.settings_snapshot->'requiredActionCodes') WITH ORDINALITY action(code, action_index)
    WHERE (
      SELECT COUNT(*) FROM jsonb_to_recordset(p_item_results) AS row(
        section TEXT, item_code TEXT, game_family_key TEXT, sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
      )
      WHERE row.section = 'practical'
        AND btrim(row.item_code) = action.code
        AND btrim(row.game_family_key) = family.code
        AND row.sequence_number = ((family.family_index - 1) * jsonb_array_length(v_attempt.settings_snapshot->'requiredActionCodes') + action.action_index)
    ) <> 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_item_results) AS row(
      section TEXT, item_code TEXT, game_family_key TEXT, sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
    )
    WHERE row.section = 'practical'
      AND (
        NOT (v_attempt.settings_snapshot->'requiredActionCodes' ? btrim(row.item_code))
        OR NOT (v_attempt.settings_snapshot->'gameFamilyKeys' ? btrim(row.game_family_key))
      )
  ) THEN RAISE EXCEPTION 'INCOMPLETE_SCORING_EVIDENCE'; END IF;

  INSERT INTO public.hub_scored_evaluation_item_results (
    attempt_id, section, item_code, game_family_key, sequence_number, item_weight, is_correct, failure_points
  )
  SELECT p_attempt_id, row.section, btrim(row.item_code), NULLIF(btrim(row.game_family_key), ''), row.sequence_number,
    CASE
      WHEN row.section = 'theory' THEN 1
      ELSE (v_attempt.settings_snapshot->'practicalItemWeights'->>btrim(row.item_code))::NUMERIC
    END,
    row.is_correct, COALESCE(row.failure_points, '[]'::JSONB)
  FROM jsonb_to_recordset(p_item_results) AS row(
    section TEXT, item_code TEXT, game_family_key TEXT,
    sequence_number INTEGER, is_correct BOOLEAN, failure_points JSONB
  );

  SELECT
    SUM(item_weight) FILTER (WHERE section = 'theory'),
    SUM(item_weight) FILTER (WHERE section = 'theory' AND is_correct),
    SUM(item_weight) FILTER (WHERE section = 'practical'),
    SUM(item_weight) FILTER (WHERE section = 'practical' AND is_correct),
    BOOL_AND(is_correct)
  INTO v_theory_total, v_theory_correct, v_practical_total, v_practical_correct, v_all_correct
  FROM public.hub_scored_evaluation_item_results
  WHERE attempt_id = p_attempt_id;

  IF COALESCE(v_theory_total, 0) <= 0 OR COALESCE(v_practical_total, 0) <= 0 THEN
    RAISE EXCEPTION 'INCOMPLETE_SCORING_EVIDENCE';
  END IF;

  v_score := ROUND(
    (COALESCE((v_attempt.settings_snapshot->>'theoryWeight')::NUMERIC, 20) * COALESCE(v_theory_correct, 0) / v_theory_total)
    + (COALESCE((v_attempt.settings_snapshot->>'practicalWeight')::NUMERIC, 80) * COALESCE(v_practical_correct, 0) / v_practical_total),
    2
  );
  IF NOT v_all_correct AND v_score >= 100 THEN v_score := 99.99; END IF;

  UPDATE public.hub_scored_evaluation_attempts
  SET status = CASE WHEN v_attempt.attempt_in_set = v_set.max_attempts THEN 'submitted' ELSE 'scored' END,
      result_status = CASE WHEN v_all_correct AND v_score = 100 THEN 'successful' ELSE 'unsuccessful' END,
      completion_reason = 'completed',
      score = v_score,
      completed_at = NOW(),
      submitted_at = CASE WHEN v_attempt.attempt_in_set = v_set.max_attempts THEN NOW() ELSE NULL END
  WHERE id = p_attempt_id;

  IF v_attempt.attempt_in_set = v_set.max_attempts THEN
    UPDATE public.hub_evaluation_attempt_sets SET status = 'closed', closed_at = NOW() WHERE id = v_set.id;
    v_auto_submitted := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'attemptId', p_attempt_id,
    'score', v_score,
    'result', CASE WHEN v_all_correct AND v_score = 100 THEN 'successful' ELSE 'unsuccessful' END,
    'attemptsRemaining', v_set.max_attempts - v_attempt.attempt_in_set,
    'autoSubmitted', v_auto_submitted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_expire_scored_evaluation_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.hub_scored_evaluation_attempts attempt
    SET status = CASE WHEN attempt.attempt_in_set = attempt_set.max_attempts THEN 'submitted' ELSE 'scored' END,
        result_status = 'unsuccessful',
        completion_reason = 'timed_out',
        score = 0,
        completed_at = NOW(),
        submitted_at = CASE WHEN attempt.attempt_in_set = attempt_set.max_attempts THEN NOW() ELSE NULL END
    FROM public.hub_evaluation_attempt_sets attempt_set
    WHERE attempt.attempt_set_id = attempt_set.id
      AND attempt.status = 'in_progress'
      AND attempt.expires_at <= NOW()
    RETURNING attempt.attempt_set_id, attempt.attempt_in_set, attempt_set.max_attempts
  ), closed AS (
    UPDATE public.hub_evaluation_attempt_sets attempt_set
    SET status = 'closed', closed_at = NOW()
    WHERE attempt_set.status = 'open'
      AND EXISTS (
        SELECT 1 FROM expired
        WHERE expired.attempt_set_id = attempt_set.id
          AND expired.attempt_in_set = expired.max_attempts
      )
    RETURNING attempt_set.id
  )
  SELECT COUNT(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_submit_scored_evaluation_attempt(
  p_external_subject TEXT,
  p_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_id UUID;
  v_attempt public.hub_scored_evaluation_attempts%ROWTYPE;
  v_latest_attempt INTEGER;
BEGIN
  SELECT identity.id INTO v_identity_id
  FROM public.hub_identities identity
  JOIN public.hub_role_assignments assignment ON assignment.identity_id = identity.id
  JOIN public.hub_roles role ON role.id = assignment.role_id AND role.code = 'postulante'
  WHERE identity.external_subject_reference = p_external_subject AND identity.status = 'active'
  FOR UPDATE OF identity;
  IF v_identity_id IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  SELECT * INTO v_attempt FROM public.hub_scored_evaluation_attempts
  WHERE id = p_attempt_id AND identity_id = v_identity_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'scored' THEN RAISE EXCEPTION 'ATTEMPT_NOT_SUBMITTABLE'; END IF;

  SELECT MAX(attempt_in_set) INTO v_latest_attempt
  FROM public.hub_scored_evaluation_attempts WHERE attempt_set_id = v_attempt.attempt_set_id;
  IF v_latest_attempt <> v_attempt.attempt_in_set THEN RAISE EXCEPTION 'ONLY_LATEST_ATTEMPT_SUBMITTABLE'; END IF;

  UPDATE public.hub_scored_evaluation_attempts
  SET status = 'submitted', submitted_at = NOW()
  WHERE id = p_attempt_id;
  UPDATE public.hub_evaluation_attempt_sets
  SET status = 'closed', closed_at = NOW()
  WHERE id = v_attempt.attempt_set_id AND status = 'open';

  RETURN jsonb_build_object('attemptId', p_attempt_id, 'submitted', TRUE, 'score', v_attempt.score);
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_reopen_scored_evaluation(
  p_external_subject TEXT,
  p_evaluation_id UUID,
  p_postulante_identity_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id UUID;
  v_previous_set public.hub_evaluation_attempt_sets%ROWTYPE;
  v_new_set public.hub_evaluation_attempt_sets%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'REOPEN_REASON_REQUIRED'; END IF;
  IF char_length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'REOPEN_REASON_TOO_LONG'; END IF;

  SELECT identity.id INTO v_trainer_id
  FROM public.hub_identities identity
  JOIN public.hub_role_assignments assignment ON assignment.identity_id = identity.id
  JOIN public.hub_roles role ON role.id = assignment.role_id AND role.code = 'trainer'
  WHERE identity.external_subject_reference = p_external_subject AND identity.status = 'active'
  FOR UPDATE OF identity;
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED'; END IF;

  PERFORM 1 FROM public.hub_identities identity
  JOIN public.hub_role_assignments assignment ON assignment.identity_id = identity.id
  JOIN public.hub_roles role ON role.id = assignment.role_id AND role.code = 'postulante'
  WHERE identity.id = p_postulante_identity_id AND identity.status = 'active'
  FOR UPDATE OF identity;
  IF NOT FOUND THEN RAISE EXCEPTION 'POSTULANTE_NOT_FOUND'; END IF;

  SELECT * INTO v_previous_set FROM public.hub_evaluation_attempt_sets
  WHERE evaluation_id = p_evaluation_id AND identity_id = p_postulante_identity_id
  ORDER BY set_number DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_previous_set.status <> 'closed' THEN RAISE EXCEPTION 'EVALUATION_NOT_REOPENABLE'; END IF;

  INSERT INTO public.hub_evaluation_attempt_sets (
    evaluation_id, identity_id, set_number, max_attempts, opened_by_identity_id
  ) VALUES (
    p_evaluation_id, p_postulante_identity_id, v_previous_set.set_number + 1, 3, v_trainer_id
  ) RETURNING * INTO v_new_set;

  INSERT INTO public.hub_evaluation_reopen_events (
    evaluation_id, identity_id, previous_attempt_set_id, new_attempt_set_id,
    reopened_by_identity_id, reason
  ) VALUES (
    p_evaluation_id, p_postulante_identity_id, v_previous_set.id, v_new_set.id,
    v_trainer_id, btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'evaluationId', p_evaluation_id,
    'postulanteIdentityId', p_postulante_identity_id,
    'attemptSetNumber', v_new_set.set_number,
    'attemptsAvailable', v_new_set.max_attempts
  );
END;
$$;

REVOKE ALL ON public.hub_game_family_adapters,
  public.hub_scored_evaluations,
  public.hub_evaluation_attempt_sets,
  public.hub_scored_evaluation_attempts,
  public.hub_scored_evaluation_item_results,
  public.hub_evaluation_reopen_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hub_game_family_adapters,
  public.hub_scored_evaluations,
  public.hub_evaluation_attempt_sets,
  public.hub_scored_evaluation_attempts,
  public.hub_scored_evaluation_item_results,
  public.hub_evaluation_reopen_events
  FROM service_role;
GRANT SELECT ON public.hub_game_family_adapters,
  public.hub_scored_evaluations,
  public.hub_evaluation_attempt_sets,
  public.hub_scored_evaluation_attempts,
  public.hub_scored_evaluation_item_results,
  public.hub_evaluation_reopen_events
  TO service_role;
GRANT UPDATE ON public.hub_scored_evaluations TO service_role;

REVOKE ALL ON FUNCTION public.hub_start_scored_evaluation_attempt(TEXT, UUID, TEXT),
  public.hub_score_scored_evaluation_attempt(UUID, JSONB),
  public.hub_expire_scored_evaluation_attempts(),
  public.hub_submit_scored_evaluation_attempt(TEXT, UUID),
  public.hub_reopen_scored_evaluation(TEXT, UUID, UUID, TEXT),
  public.hub_increment_scored_evaluation_revision(),
  public.hub_validate_scored_evaluation_publication(),
  public.hub_guard_scored_evaluation_mutation(),
  public.hub_guard_evaluation_attempt_set_mutation(),
  public.hub_guard_scored_attempt_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_start_scored_evaluation_attempt(TEXT, UUID, TEXT),
  public.hub_score_scored_evaluation_attempt(UUID, JSONB),
  public.hub_expire_scored_evaluation_attempts(),
  public.hub_submit_scored_evaluation_attempt(TEXT, UUID),
  public.hub_reopen_scored_evaluation(TEXT, UUID, UUID, TEXT)
  TO service_role;

COMMENT ON TABLE public.hub_scored_evaluations IS
  'Four governed scored evaluations with 20/80 defaults, three-attempt sets, exact snapshots, and fixed mandatory actions.';
COMMENT ON TABLE public.hub_evaluation_reopen_events IS
  'Append-only TRAINER reopening reasons; exposed only to TRAINER and RRHH reporting surfaces.';
