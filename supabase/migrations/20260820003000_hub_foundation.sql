-- Provider-neutral Training Hub persistence foundation.
--
-- This migration intentionally does not choose an authentication provider,
-- define passwords, grant product permissions to roles, or encode pass/retry,
-- financial, company/license, or escalation policy. The Express backend remains
-- the only database client and maps an authenticated external subject to a Hub
-- identity after Trez approves the authentication and provisioning boundary.

CREATE TABLE public.hub_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject_reference TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(external_subject_reference)) > 0)
);

CREATE TABLE public.hub_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE public.hub_role_assignments (
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.hub_roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, role_id)
);

CREATE TABLE public.hub_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(stable_code)) > 0),
  CHECK (length(btrim(title)) > 0)
);

CREATE TABLE public.hub_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.hub_courses(id) ON DELETE CASCADE,
  stable_code TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  title TEXT NOT NULL,
  summary TEXT,
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, stable_code),
  UNIQUE (course_id, position),
  UNIQUE (id, course_id),
  CHECK (length(btrim(stable_code)) > 0),
  CHECK (length(btrim(title)) > 0)
);

CREATE TABLE public.hub_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.hub_modules(id) ON DELETE CASCADE,
  stable_code TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  activity_type TEXT NOT NULL CHECK (
    activity_type IN (
      'article',
      'checklist',
      'acknowledgement',
      'video',
      'quiz',
      'guided_walkthrough',
      'interactive_rule_lab',
      'quick_simulation',
      'focused_practice',
      'assessment',
      'full_simulation'
    )
  ),
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content) = 'object'),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  is_scored BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, stable_code),
  UNIQUE (module_id, position),
  UNIQUE (id, module_id),
  CHECK (length(btrim(stable_code)) > 0),
  CHECK (length(btrim(title)) > 0)
);

CREATE TABLE public.hub_module_prerequisites (
  course_id UUID NOT NULL REFERENCES public.hub_courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL,
  prerequisite_module_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (module_id, prerequisite_module_id),
  FOREIGN KEY (module_id, course_id)
    REFERENCES public.hub_modules(id, course_id) ON DELETE CASCADE,
  FOREIGN KEY (prerequisite_module_id, course_id)
    REFERENCES public.hub_modules(id, course_id) ON DELETE CASCADE,
  CHECK (module_id <> prerequisite_module_id)
);

CREATE TABLE public.hub_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.hub_courses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'withdrawn')),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (identity_id, course_id),
  UNIQUE (id, course_id),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE public.hub_module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id UUID NOT NULL,
  course_id UUID NOT NULL,
  module_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (enrolment_id, module_id),
  UNIQUE (id, module_id),
  FOREIGN KEY (enrolment_id, course_id)
    REFERENCES public.hub_enrolments(id, course_id) ON DELETE CASCADE,
  FOREIGN KEY (module_id, course_id)
    REFERENCES public.hub_modules(id, course_id) ON DELETE RESTRICT,
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE public.hub_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_progress_id UUID NOT NULL,
  module_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  attempt_mode TEXT CHECK (
    attempt_mode IS NULL OR attempt_mode IN (
      'demonstration',
      'guided_practice',
      'independent_practice',
      'assessment',
      'full_simulation'
    )
  ),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned')),
  legacy_trainee_session_id UUID
    REFERENCES public.trainee_sessions(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (module_progress_id, attempt_number),
  UNIQUE (id, module_id),
  FOREIGN KEY (module_progress_id, module_id)
    REFERENCES public.hub_module_progress(id, module_id) ON DELETE CASCADE,
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE public.hub_activity_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  module_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'abandoned')),
  state JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(state) = 'object'),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, activity_id),
  UNIQUE (id, attempt_id),
  FOREIGN KEY (attempt_id, module_id)
    REFERENCES public.hub_attempts(id, module_id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, module_id)
    REFERENCES public.hub_activities(id, module_id) ON DELETE RESTRICT,
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Evidence and artifacts are persistent assessment records. They are separate
-- from disposable simulator state and can only be appended.
CREATE TABLE public.hub_evidence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.hub_attempts(id) ON DELETE RESTRICT,
  activity_attempt_id UUID,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, sequence_number),
  FOREIGN KEY (activity_attempt_id, attempt_id)
    REFERENCES public.hub_activity_attempts(id, attempt_id) ON DELETE RESTRICT,
  CHECK (length(btrim(event_type)) > 0)
);

CREATE TABLE public.hub_attempt_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.hub_attempts(id) ON DELETE RESTRICT,
  activity_attempt_id UUID,
  artifact_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (activity_attempt_id, attempt_id)
    REFERENCES public.hub_activity_attempts(id, attempt_id) ON DELETE RESTRICT,
  CHECK (length(btrim(artifact_type)) > 0)
);

-- An idempotency claim belongs to one Hub identity and one mutation action.
-- The fingerprint rejects reuse of the same key for different input, while the
-- stored response makes a successful replay deterministic across API restarts.
CREATE TABLE public.hub_idempotency_keys (
  identity_id UUID NOT NULL REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  action_code TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, action_code, idempotency_key),
  CHECK (length(btrim(action_code)) > 0),
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  CHECK (length(request_fingerprint) = 64),
  CHECK (response IS NULL OR jsonb_typeof(response) = 'object')
);

CREATE INDEX hub_role_assignments_role_idx
  ON public.hub_role_assignments(role_id, identity_id);

CREATE INDEX hub_modules_course_idx
  ON public.hub_modules(course_id, position);

CREATE INDEX hub_activities_module_idx
  ON public.hub_activities(module_id, position);

CREATE INDEX hub_enrolments_identity_status_idx
  ON public.hub_enrolments(identity_id, status);

CREATE INDEX hub_module_progress_enrolment_status_idx
  ON public.hub_module_progress(enrolment_id, status);

CREATE INDEX hub_attempts_progress_status_idx
  ON public.hub_attempts(module_progress_id, status);

CREATE INDEX hub_activity_attempts_attempt_status_idx
  ON public.hub_activity_attempts(attempt_id, status);

CREATE INDEX hub_evidence_events_attempt_time_idx
  ON public.hub_evidence_events(attempt_id, occurred_at, sequence_number);

CREATE INDEX hub_attempt_artifacts_attempt_type_idx
  ON public.hub_attempt_artifacts(attempt_id, artifact_type, created_at);

CREATE INDEX hub_idempotency_keys_created_at_idx
  ON public.hub_idempotency_keys(created_at);

CREATE OR REPLACE FUNCTION public.hub_reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER hub_evidence_events_append_only
BEFORE UPDATE OR DELETE ON public.hub_evidence_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE TRIGGER hub_attempt_artifacts_append_only
BEFORE UPDATE OR DELETE ON public.hub_attempt_artifacts
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.hub_start_activity_attempt(
  p_external_subject TEXT,
  p_activity_id UUID,
  p_state JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity_id UUID;
  v_enrolment RECORD;
  v_activity RECORD;
  v_progress RECORD;
  v_attempt RECORD;
  v_activity_attempt RECORD;
  v_state JSONB := COALESCE(p_state, '{}'::jsonb);
  v_fingerprint TEXT;
  v_claim RECORD;
  v_result JSONB;
  v_attempt_number INTEGER;
  v_activity_attempt_created BOOLEAN := FALSE;
BEGIN
  IF p_external_subject IS NULL OR length(btrim(p_external_subject)) = 0
     OR p_activity_id IS NULL
     OR p_idempotency_key IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_INVALID_INPUT', ERRCODE = '22023';
  END IF;

  SELECT id INTO v_identity_id
  FROM public.hub_identities
  WHERE external_subject_reference = p_external_subject;

  SELECT activity.id AS activity_id,
         activity.module_id,
         activity.content AS activity_content,
         module.course_id
  INTO v_activity
  FROM public.hub_activities AS activity
  JOIN public.hub_modules AS module ON module.id = activity.module_id
  WHERE activity.id = p_activity_id;

  IF v_identity_id IS NULL OR v_activity.activity_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  -- Draft activities that still require an approved policy or a server-created
  -- artifact must fail closed at the persistence boundary. The browser cannot
  -- make either prerequisite authoritative by posting arbitrary state.
  IF v_activity.activity_content ->> 'policyStatus' = 'required'
     OR v_activity.activity_content ->> 'artifactStatus' = 'required' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACTIVITY_BLOCKED', ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_enrolment
  FROM public.hub_enrolments
  WHERE identity_id = v_identity_id
    AND course_id = v_activity.course_id
    AND status <> 'withdrawn';

  IF v_enrolment.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object('activityId', p_activity_id, 'state', v_state)::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.hub_idempotency_keys (
    identity_id, action_code, idempotency_key, request_fingerprint
  ) VALUES (
    v_identity_id, 'start_activity_attempt', p_idempotency_key, v_fingerprint
  )
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_claim
  FROM public.hub_idempotency_keys
  WHERE identity_id = v_identity_id
    AND action_code = 'start_activity_attempt'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_claim.request_fingerprint <> v_fingerprint THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_IDEMPOTENCY_CONFLICT', ERRCODE = 'P0001';
  END IF;
  IF v_claim.response IS NOT NULL THEN
    RETURN v_claim.response;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hub_module_prerequisites AS prerequisite
    WHERE prerequisite.module_id = v_activity.module_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.hub_module_progress AS progress
        WHERE progress.enrolment_id = v_enrolment.id
          AND progress.module_id = prerequisite.prerequisite_module_id
          AND progress.status = 'completed'
      )
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_PREREQUISITE_INCOMPLETE', ERRCODE = 'P0001';
  END IF;

  -- A missing progress row cannot itself be locked. Serialize starts for the
  -- enrolment before the absence check so two different idempotency keys cannot
  -- race into the unique (enrolment_id, module_id) insert.
  SELECT locked_enrolment.* INTO v_enrolment
  FROM public.hub_enrolments AS locked_enrolment
  WHERE locked_enrolment.id = v_enrolment.id
    AND locked_enrolment.status <> 'withdrawn'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_progress
  FROM public.hub_module_progress
  WHERE enrolment_id = v_enrolment.id
    AND module_id = v_activity.module_id
  FOR UPDATE;

  IF v_progress.id IS NULL THEN
    INSERT INTO public.hub_module_progress (
      enrolment_id, course_id, module_id, status, started_at
    ) VALUES (
      v_enrolment.id, v_activity.course_id, v_activity.module_id,
      'in_progress', NOW()
    ) RETURNING * INTO v_progress;
  ELSIF v_progress.status = 'completed' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_RETRY_POLICY_REQUIRED', ERRCODE = 'P0001';
  ELSE
    UPDATE public.hub_module_progress
    SET status = 'in_progress',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = v_progress.id
    RETURNING * INTO v_progress;
  END IF;

  UPDATE public.hub_enrolments
  SET status = CASE WHEN status = 'assigned' THEN 'in_progress' ELSE status END,
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
  WHERE id = v_enrolment.id;

  SELECT * INTO v_attempt
  FROM public.hub_attempts
  WHERE module_progress_id = v_progress.id
    AND status IN ('not_started', 'in_progress')
  ORDER BY attempt_number DESC
  LIMIT 1
  FOR UPDATE;

  IF v_attempt.id IS NULL THEN
    SELECT COALESCE(MAX(attempt_number), 0) + 1
    INTO v_attempt_number
    FROM public.hub_attempts
    WHERE module_progress_id = v_progress.id;

    INSERT INTO public.hub_attempts (
      module_progress_id, module_id, attempt_number, status, started_at
    ) VALUES (
      v_progress.id, v_activity.module_id, v_attempt_number,
      'in_progress', NOW()
    ) RETURNING * INTO v_attempt;
  ELSE
    UPDATE public.hub_attempts
    SET status = 'in_progress',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;
  END IF;

  INSERT INTO public.hub_activity_attempts (
    attempt_id, module_id, activity_id, status, state, started_at
  ) VALUES (
    v_attempt.id, v_activity.module_id, p_activity_id,
    'in_progress', v_state, NOW()
  )
  ON CONFLICT (attempt_id, activity_id) DO NOTHING
  RETURNING * INTO v_activity_attempt;

  IF v_activity_attempt.id IS NULL THEN
    SELECT * INTO v_activity_attempt
    FROM public.hub_activity_attempts
    WHERE attempt_id = v_attempt.id
      AND activity_id = p_activity_id;
  ELSE
    v_activity_attempt_created := TRUE;
  END IF;

  v_result := jsonb_build_object(
    'created', v_activity_attempt_created,
    'activityAttemptId', v_activity_attempt.id,
    'attemptId', v_attempt.id,
    'moduleProgressId', v_progress.id,
    'activityId', p_activity_id,
    'status', v_activity_attempt.status
  );

  UPDATE public.hub_idempotency_keys
  SET response = v_result
  WHERE identity_id = v_identity_id
    AND action_code = 'start_activity_attempt'
    AND idempotency_key = p_idempotency_key;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_complete_activity_attempt(
  p_external_subject TEXT,
  p_attempt_id UUID,
  p_state JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity_id UUID;
  v_context RECORD;
  v_state JSONB := COALESCE(p_state, '{}'::jsonb);
  v_fingerprint TEXT;
  v_claim RECORD;
  v_result JSONB;
  v_completed_at TIMESTAMP WITH TIME ZONE;
  v_sequence INTEGER;
  v_attempt_status TEXT;
  v_module_status TEXT;
BEGIN
  IF p_external_subject IS NULL OR length(btrim(p_external_subject)) = 0
     OR p_attempt_id IS NULL
     OR p_idempotency_key IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_INVALID_INPUT', ERRCODE = '22023';
  END IF;

  SELECT id INTO v_identity_id
  FROM public.hub_identities
  WHERE external_subject_reference = p_external_subject;

  SELECT activity_attempt.id AS activity_attempt_id,
         activity_attempt.activity_id,
         activity_attempt.status AS activity_status,
         activity_attempt.completed_at,
         attempt.id AS attempt_id,
         attempt.module_progress_id,
         attempt.module_id,
         progress.enrolment_id,
         enrolment.course_id,
         activity.content AS activity_content
  INTO v_context
  FROM public.hub_activity_attempts AS activity_attempt
  JOIN public.hub_attempts AS attempt ON attempt.id = activity_attempt.attempt_id
  JOIN public.hub_module_progress AS progress ON progress.id = attempt.module_progress_id
  JOIN public.hub_enrolments AS enrolment ON enrolment.id = progress.enrolment_id
  JOIN public.hub_activities AS activity ON activity.id = activity_attempt.activity_id
  WHERE activity_attempt.id = p_attempt_id
    AND enrolment.identity_id = v_identity_id
    AND enrolment.status <> 'withdrawn';

  IF v_identity_id IS NULL OR v_context.activity_attempt_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  IF v_context.activity_content ->> 'policyStatus' = 'required'
     OR v_context.activity_content ->> 'artifactStatus' = 'required' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACTIVITY_BLOCKED', ERRCODE = 'P0001';
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object('activityAttemptId', p_attempt_id, 'state', v_state)::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.hub_idempotency_keys (
    identity_id, action_code, idempotency_key, request_fingerprint
  ) VALUES (
    v_identity_id, 'complete_activity_attempt', p_idempotency_key, v_fingerprint
  )
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_claim
  FROM public.hub_idempotency_keys
  WHERE identity_id = v_identity_id
    AND action_code = 'complete_activity_attempt'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_claim.request_fingerprint <> v_fingerprint THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_IDEMPOTENCY_CONFLICT', ERRCODE = 'P0001';
  END IF;
  IF v_claim.response IS NOT NULL THEN
    RETURN v_claim.response;
  END IF;

  -- Match the start path's enrolment -> progress -> attempt lock order. Course
  -- completion updates the enrolment later in this transaction.
  PERFORM 1 FROM public.hub_enrolments
  WHERE id = v_context.enrolment_id
    AND status <> 'withdrawn'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.hub_module_progress
  WHERE id = v_context.module_progress_id FOR UPDATE;
  PERFORM 1 FROM public.hub_attempts
  WHERE id = v_context.attempt_id FOR UPDATE;

  SELECT status, completed_at
  INTO v_context.activity_status, v_context.completed_at
  FROM public.hub_activity_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF v_context.activity_status <> 'completed' THEN
    v_completed_at := NOW();
    UPDATE public.hub_activity_attempts
    SET status = 'completed',
        state = v_state,
        started_at = COALESCE(started_at, v_completed_at),
        completed_at = v_completed_at,
        updated_at = v_completed_at
    WHERE id = p_attempt_id;

    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO v_sequence
    FROM public.hub_evidence_events
    WHERE attempt_id = v_context.attempt_id;

    INSERT INTO public.hub_evidence_events (
      attempt_id,
      activity_attempt_id,
      sequence_number,
      event_type,
      occurred_at,
      payload
    ) VALUES (
      v_context.attempt_id,
      p_attempt_id,
      v_sequence,
      'ACTIVITY_COMPLETED',
      v_completed_at,
      jsonb_build_object('activityId', v_context.activity_id, 'state', v_state)
    );
  ELSE
    v_completed_at := v_context.completed_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hub_modules
    WHERE id = v_context.module_id AND is_scored = FALSE
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.hub_activities AS activity
    WHERE activity.module_id = v_context.module_id
      AND activity.publication_status <> 'archived'
      AND NOT EXISTS (
        SELECT 1
        FROM public.hub_activity_attempts AS activity_attempt
        WHERE activity_attempt.attempt_id = v_context.attempt_id
          AND activity_attempt.activity_id = activity.id
          AND activity_attempt.status = 'completed'
      )
  ) THEN
    UPDATE public.hub_attempts
    SET status = 'completed',
        completed_at = COALESCE(completed_at, v_completed_at),
        updated_at = v_completed_at
    WHERE id = v_context.attempt_id;

    UPDATE public.hub_module_progress
    SET status = 'completed',
        started_at = COALESCE(started_at, v_completed_at),
        completed_at = COALESCE(completed_at, v_completed_at),
        updated_at = v_completed_at
    WHERE id = v_context.module_progress_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.hub_modules AS module
      WHERE module.course_id = v_context.course_id
        AND module.publication_status <> 'archived'
        AND NOT EXISTS (
          SELECT 1
          FROM public.hub_module_progress AS progress
          WHERE progress.enrolment_id = v_context.enrolment_id
            AND progress.module_id = module.id
            AND progress.status = 'completed'
        )
    ) THEN
      UPDATE public.hub_enrolments
      SET status = 'completed',
          completed_at = COALESCE(completed_at, v_completed_at),
          updated_at = v_completed_at
      WHERE id = v_context.enrolment_id;
    END IF;
  END IF;

  SELECT status INTO v_attempt_status
  FROM public.hub_attempts WHERE id = v_context.attempt_id;
  SELECT status INTO v_module_status
  FROM public.hub_module_progress WHERE id = v_context.module_progress_id;

  v_result := jsonb_build_object(
    'activityAttemptId', p_attempt_id,
    'attemptId', v_context.attempt_id,
    'moduleProgressId', v_context.module_progress_id,
    'activityId', v_context.activity_id,
    'activityStatus', 'completed',
    'attemptStatus', v_attempt_status,
    'moduleStatus', v_module_status,
    'completedAt', v_completed_at
  );

  UPDATE public.hub_idempotency_keys
  SET response = v_result
  WHERE identity_id = v_identity_id
    AND action_code = 'complete_activity_attempt'
    AND idempotency_key = p_idempotency_key;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_complete_activity(
  p_external_subject TEXT,
  p_activity_id UUID,
  p_state JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity_id UUID;
  v_state JSONB := COALESCE(p_state, '{}'::jsonb);
  v_fingerprint TEXT;
  v_claim RECORD;
  v_start JSONB;
  v_result JSONB;
  v_subkey TEXT;
BEGIN
  IF p_external_subject IS NULL OR length(btrim(p_external_subject)) = 0
     OR p_activity_id IS NULL
     OR p_idempotency_key IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_INVALID_INPUT', ERRCODE = '22023';
  END IF;

  SELECT id INTO v_identity_id
  FROM public.hub_identities
  WHERE external_subject_reference = p_external_subject;
  IF v_identity_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object('activityId', p_activity_id, 'state', v_state)::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.hub_idempotency_keys (
    identity_id, action_code, idempotency_key, request_fingerprint
  ) VALUES (
    v_identity_id, 'complete_activity', p_idempotency_key, v_fingerprint
  )
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_claim
  FROM public.hub_idempotency_keys
  WHERE identity_id = v_identity_id
    AND action_code = 'complete_activity'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_claim.request_fingerprint <> v_fingerprint THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_IDEMPOTENCY_CONFLICT', ERRCODE = 'P0001';
  END IF;
  IF v_claim.response IS NOT NULL THEN
    RETURN v_claim.response;
  END IF;

  v_subkey := 'complete:' || encode(extensions.digest(p_idempotency_key, 'sha256'), 'hex');
  v_start := public.hub_start_activity_attempt(
    p_external_subject,
    p_activity_id,
    v_state,
    v_subkey || ':start'
  );
  v_result := public.hub_complete_activity_attempt(
    p_external_subject,
    (v_start ->> 'activityAttemptId')::uuid,
    v_state,
    v_subkey || ':finish'
  );

  UPDATE public.hub_idempotency_keys
  SET response = v_result
  WHERE identity_id = v_identity_id
    AND action_code = 'complete_activity'
    AND idempotency_key = p_idempotency_key;

  RETURN v_result;
END;
$$;

-- Browser database roles receive no direct Hub table, sequence, or function
-- access. The server-only service role retains access to the additive objects.
REVOKE ALL ON ALL TABLES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
