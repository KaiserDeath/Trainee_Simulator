-- Approved Hub identity, visibility, publishing, language, and retention
-- decisions recorded on 2026-08-21. Browser database roles remain revoked;
-- these records are accessed only through the server authorization boundary.

ALTER TABLE public.hub_identities
  ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN email TEXT UNIQUE,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deactivated')),
  ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en'
    CHECK (preferred_locale IN ('en', 'es')),
  ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.hub_identities
  ADD CONSTRAINT hub_identities_email_normalized
  CHECK (email IS NULL OR email = lower(btrim(email))),
  ADD CONSTRAINT hub_identities_deactivation_consistent
  CHECK (
    (status = 'active' AND deactivated_at IS NULL)
    OR (status = 'deactivated' AND deactivated_at IS NOT NULL)
  );

CREATE TABLE public.hub_trainer_learner_assignments (
  trainer_identity_id UUID NOT NULL
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  learner_identity_id UUID NOT NULL
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  assigned_by_identity_id UUID NOT NULL
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (trainer_identity_id, learner_identity_id),
  CHECK (trainer_identity_id <> learner_identity_id),
  CHECK (revoked_at IS NULL OR revoked_at >= assigned_at)
);

ALTER TABLE public.hub_enrolments
  ADD COLUMN assigned_by_identity_id UUID
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT;

CREATE TABLE public.hub_governance_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  retention_years INTEGER NOT NULL CHECK (retention_years = 2),
  trainee_locales JSONB NOT NULL
    CHECK (trainee_locales = '["en"]'::jsonb),
  administrator_locales JSONB NOT NULL
    CHECK (administrator_locales = '["en", "es"]'::jsonb),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO public.hub_governance_settings (
  singleton,
  retention_years,
  trainee_locales,
  administrator_locales
) VALUES (
  TRUE,
  2,
  '["en"]'::jsonb,
  '["en", "es"]'::jsonb
);

ALTER TABLE public.hub_attempts
  ADD COLUMN retention_until TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.hub_set_attempt_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.retention_until IS NULL THEN
    NEW.retention_until := NEW.completed_at + INTERVAL '2 years';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_attempts_retention
BEFORE INSERT OR UPDATE OF completed_at ON public.hub_attempts
FOR EACH ROW EXECUTE FUNCTION public.hub_set_attempt_retention();

UPDATE public.hub_attempts
SET retention_until = completed_at + INTERVAL '2 years'
WHERE completed_at IS NOT NULL AND retention_until IS NULL;

CREATE TABLE public.hub_content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_kind TEXT NOT NULL
    CHECK (definition_kind IN ('course', 'module', 'activity')),
  definition_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'es')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'published', 'rejected', 'archived')),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  change_rationale TEXT NOT NULL CHECK (length(btrim(change_rationale)) > 0),
  author_identity_id UUID NOT NULL
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_identity_id UUID
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (definition_kind, definition_id, locale, version_number),
  CHECK (
    reviewed_by_identity_id IS NULL
    OR reviewed_by_identity_id <> author_identity_id
  )
);

CREATE UNIQUE INDEX hub_one_published_content_version
  ON public.hub_content_versions(definition_kind, definition_id, locale)
  WHERE status = 'published';

CREATE TABLE public.hub_content_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_version_id UUID NOT NULL
    REFERENCES public.hub_content_versions(id) ON DELETE RESTRICT,
  actor_identity_id UUID NOT NULL
    REFERENCES public.hub_identities(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  rationale TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TRIGGER hub_content_review_events_append_only
BEFORE UPDATE OR DELETE ON public.hub_content_review_events
FOR EACH ROW EXECUTE FUNCTION public.hub_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.hub_require_active_role(
  p_external_subject TEXT,
  p_allowed_roles TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity_id UUID;
BEGIN
  SELECT identity.id INTO v_identity_id
  FROM public.hub_identities AS identity
  WHERE identity.external_subject_reference = p_external_subject
    AND identity.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.hub_role_assignments AS assignment
      JOIN public.hub_roles AS role ON role.id = assignment.role_id
      WHERE assignment.identity_id = identity.id
        AND role.code = ANY(p_allowed_roles)
    );

  IF v_identity_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;
  RETURN v_identity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_create_content_version(
  p_external_subject TEXT,
  p_definition_kind TEXT,
  p_definition_id UUID,
  p_locale TEXT,
  p_content JSONB,
  p_change_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID;
  v_version public.hub_content_versions%ROWTYPE;
  v_next_version INTEGER;
BEGIN
  v_actor := public.hub_require_active_role(
    p_external_subject,
    ARRAY['admin']::TEXT[]
  );

  IF p_definition_kind NOT IN ('course', 'module', 'activity')
     OR p_definition_id IS NULL
     OR p_locale NOT IN ('en', 'es')
     OR p_content IS NULL OR jsonb_typeof(p_content) <> 'object'
     OR p_change_rationale IS NULL OR length(btrim(p_change_rationale)) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_INVALID_INPUT', ERRCODE = '22023';
  END IF;

  IF (p_definition_kind = 'course' AND NOT EXISTS (
        SELECT 1 FROM public.hub_courses WHERE id = p_definition_id
      ))
     OR (p_definition_kind = 'module' AND NOT EXISTS (
        SELECT 1 FROM public.hub_modules WHERE id = p_definition_id
      ))
     OR (p_definition_kind = 'activity' AND NOT EXISTS (
        SELECT 1 FROM public.hub_activities WHERE id = p_definition_id
      )) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_OBJECT_NOT_FOUND', ERRCODE = 'P0001';
  END IF;

  LOCK TABLE public.hub_content_versions IN SHARE ROW EXCLUSIVE MODE;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.hub_content_versions
  WHERE definition_kind = p_definition_kind
    AND definition_id = p_definition_id
    AND locale = p_locale;

  INSERT INTO public.hub_content_versions (
    definition_kind, definition_id, version_number, locale, content,
    change_rationale, author_identity_id
  ) VALUES (
    p_definition_kind, p_definition_id, v_next_version, p_locale, p_content,
    btrim(p_change_rationale), v_actor
  ) RETURNING * INTO v_version;

  INSERT INTO public.hub_content_review_events (
    content_version_id, actor_identity_id, event_type, rationale
  ) VALUES (v_version.id, v_actor, 'CREATED', v_version.change_rationale);

  RETURN to_jsonb(v_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_submit_content_version(
  p_external_subject TEXT,
  p_content_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID;
  v_version public.hub_content_versions%ROWTYPE;
BEGIN
  v_actor := public.hub_require_active_role(
    p_external_subject,
    ARRAY['admin']::TEXT[]
  );
  SELECT * INTO v_version FROM public.hub_content_versions
  WHERE id = p_content_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_OBJECT_NOT_FOUND', ERRCODE = 'P0001';
  END IF;
  IF v_version.author_identity_id <> v_actor OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_ACCESS_DENIED', ERRCODE = 'P0001';
  END IF;

  UPDATE public.hub_content_versions
  SET status = 'pending_review', submitted_at = NOW()
  WHERE id = p_content_version_id
  RETURNING * INTO v_version;

  INSERT INTO public.hub_content_review_events (
    content_version_id, actor_identity_id, event_type
  ) VALUES (v_version.id, v_actor, 'SUBMITTED');
  RETURN to_jsonb(v_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_review_content_version(
  p_external_subject TEXT,
  p_content_version_id UUID,
  p_decision TEXT,
  p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID;
  v_version public.hub_content_versions%ROWTYPE;
  v_event TEXT;
BEGIN
  v_actor := public.hub_require_active_role(
    p_external_subject,
    ARRAY['admin']::TEXT[]
  );
  IF p_decision NOT IN ('approve', 'reject')
     OR p_rationale IS NULL OR length(btrim(p_rationale)) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_INVALID_INPUT', ERRCODE = '22023';
  END IF;

  SELECT * INTO v_version FROM public.hub_content_versions
  WHERE id = p_content_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_OBJECT_NOT_FOUND', ERRCODE = 'P0001';
  END IF;
  IF v_version.status <> 'pending_review'
     OR v_version.author_identity_id = v_actor THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_SEPARATE_APPROVER_REQUIRED', ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE public.hub_content_versions
    SET status = 'archived'
    WHERE definition_kind = v_version.definition_kind
      AND definition_id = v_version.definition_id
      AND locale = v_version.locale
      AND status = 'published';
    v_event := 'APPROVED';
    UPDATE public.hub_content_versions
    SET status = 'published', reviewed_by_identity_id = v_actor,
        reviewed_at = NOW(), published_at = NOW()
    WHERE id = v_version.id RETURNING * INTO v_version;
  ELSE
    v_event := 'REJECTED';
    UPDATE public.hub_content_versions
    SET status = 'rejected', reviewed_by_identity_id = v_actor,
        reviewed_at = NOW()
    WHERE id = v_version.id RETURNING * INTO v_version;
  END IF;

  INSERT INTO public.hub_content_review_events (
    content_version_id, actor_identity_id, event_type, rationale
  ) VALUES (v_version.id, v_actor, v_event, btrim(p_rationale));
  RETURN to_jsonb(v_version);
END;
$$;

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
