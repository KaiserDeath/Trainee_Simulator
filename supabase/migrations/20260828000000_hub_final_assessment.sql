-- Final-assessment foundation. The default workload is approved, but execution
-- remains prerequisite- and policy-gated until every included module is ready.

CREATE TABLE public.hub_assessment_settings (
  id UUID PRIMARY KEY,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  minimum_operations INTEGER NOT NULL DEFAULT 2 CHECK (minimum_operations > 0),
  maximum_operations INTEGER NOT NULL DEFAULT 6 CHECK (maximum_operations >= minimum_operations),
  operation_types TEXT[] NOT NULL DEFAULT ARRAY[
    'ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD'
  ]::TEXT[],
  advanced_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by_identity_id UUID REFERENCES public.hub_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(operation_types) > 0),
  CHECK (operation_types <@ ARRAY[
    'ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD'
  ]::TEXT[])
);

CREATE OR REPLACE FUNCTION public.hub_increment_assessment_settings_revision()
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

CREATE TRIGGER hub_assessment_settings_revision_trigger
BEFORE UPDATE ON public.hub_assessment_settings
FOR EACH ROW EXECUTE FUNCTION public.hub_increment_assessment_settings_revision();

CREATE TABLE public.hub_assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'passed', 'unsuccessful', 'timed_out', 'abandoned')),
  score NUMERIC(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  settings_snapshot JSONB NOT NULL,
  legacy_trainee_session_id UUID REFERENCES public.trainee_sessions(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (identity_id, attempt_number),
  CHECK ((status = 'in_progress' AND completed_at IS NULL) OR status <> 'in_progress'),
  CHECK (status <> 'passed' OR score = 100)
);

CREATE TABLE public.hub_assessment_operation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_attempt_id UUID NOT NULL REFERENCES public.hub_assessment_attempts(id) ON DELETE RESTRICT,
  sandbox_operation_id UUID REFERENCES public.sandbox_operations(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  operation_category TEXT NOT NULL CHECK (operation_category IN ('movement', 'request')),
  game TEXT,
  status TEXT NOT NULL,
  is_correct BOOLEAN,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  failure_points JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failure_points) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_attempt_id, sandbox_operation_id)
);

CREATE INDEX hub_assessment_attempts_identity_started_idx
  ON public.hub_assessment_attempts(identity_id, started_at DESC);
CREATE INDEX hub_assessment_attempts_status_started_idx
  ON public.hub_assessment_attempts(status, started_at DESC);
CREATE INDEX hub_assessment_results_attempt_type_idx
  ON public.hub_assessment_operation_results(assessment_attempt_id, operation_type);

CREATE OR REPLACE FUNCTION public.hub_expire_assessment_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.hub_assessment_attempts
  SET status = 'timed_out',
      score = COALESCE(score, 0),
      completed_at = NOW()
  WHERE status = 'in_progress'
    AND expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON public.hub_assessment_settings,
  public.hub_assessment_attempts,
  public.hub_assessment_operation_results
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hub_assessment_settings,
  public.hub_assessment_attempts,
  public.hub_assessment_operation_results
  TO service_role;
REVOKE ALL ON FUNCTION public.hub_expire_assessment_attempts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_expire_assessment_attempts()
  TO service_role;
REVOKE ALL ON FUNCTION public.hub_increment_assessment_settings_revision()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.hub_assessment_settings IS
  'TRAINER/RRHH-managed final-assessment defaults and advanced operation selection.';
COMMENT ON TABLE public.hub_assessment_attempts IS
  'Immutable-per-attempt assessment configuration snapshot and retained outcome.';
