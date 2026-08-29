-- Approved trainer locale and auditor reporting support, 2026-08-21.
-- This migration adds no browser grants and creates no inferred identity link.

ALTER TABLE public.hub_governance_settings
  ADD COLUMN trainer_locales JSONB NOT NULL DEFAULT '["en", "es"]'::jsonb
    CHECK (trainer_locales = '["en", "es"]'::jsonb);

CREATE INDEX hub_attempts_legacy_session_idx
  ON public.hub_attempts(legacy_trainee_session_id)
  WHERE legacy_trainee_session_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS auditor_assignment
    JOIN public.hub_roles AS auditor_role
      ON auditor_role.id = auditor_assignment.role_id
    WHERE auditor_role.code = 'auditor'
      AND EXISTS (
        SELECT 1
        FROM public.hub_role_assignments AS other_assignment
        JOIN public.hub_roles AS other_role
          ON other_role.id = other_assignment.role_id
        WHERE other_assignment.identity_id = auditor_assignment.identity_id
          AND other_role.code <> 'auditor'
      )
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_AUDITOR_ROLE_MUST_BE_EXCLUSIVE', ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS assignment
    JOIN public.hub_roles AS role ON role.id = assignment.role_id
    JOIN public.hub_identities AS identity ON identity.id = assignment.identity_id
    WHERE role.code = 'trainee'
      AND identity.preferred_locale <> 'en'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_TRAINEE_LOCALE_MUST_BE_ENGLISH', ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.hub_enforce_auditor_role_exclusivity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_role_code TEXT;
BEGIN
  PERFORM 1
  FROM public.hub_identities AS identity
  WHERE identity.id = NEW.identity_id
  FOR UPDATE;

  SELECT role.code INTO v_new_role_code
  FROM public.hub_roles AS role
  WHERE role.id = NEW.role_id;

  IF v_new_role_code = 'auditor' AND EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS assignment
    JOIN public.hub_roles AS role ON role.id = assignment.role_id
    WHERE assignment.identity_id = NEW.identity_id
      AND role.code <> 'auditor'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_AUDITOR_ROLE_MUST_BE_EXCLUSIVE', ERRCODE = 'P0001';
  END IF;

  IF v_new_role_code <> 'auditor' AND EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS assignment
    JOIN public.hub_roles AS role ON role.id = assignment.role_id
    WHERE assignment.identity_id = NEW.identity_id
      AND role.code = 'auditor'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_AUDITOR_ROLE_MUST_BE_EXCLUSIVE', ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_role_assignments_auditor_exclusive
BEFORE INSERT OR UPDATE OF identity_id, role_id
ON public.hub_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.hub_enforce_auditor_role_exclusivity();

CREATE OR REPLACE FUNCTION public.hub_enforce_trainee_locale()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_code TEXT;
  v_locale TEXT;
BEGIN
  IF TG_TABLE_NAME = 'hub_role_assignments' THEN
    SELECT role.code INTO v_role_code
    FROM public.hub_roles AS role
    WHERE role.id = NEW.role_id;

    IF v_role_code = 'trainee' THEN
      SELECT identity.preferred_locale INTO v_locale
      FROM public.hub_identities AS identity
      WHERE identity.id = NEW.identity_id
      FOR UPDATE;

      IF v_locale <> 'en' THEN
        RAISE EXCEPTION USING MESSAGE = 'HUB_TRAINEE_LOCALE_MUST_BE_ENGLISH', ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hub_identities' AND NEW.preferred_locale <> 'en' THEN
    IF EXISTS (
      SELECT 1
      FROM public.hub_role_assignments AS assignment
      JOIN public.hub_roles AS role ON role.id = assignment.role_id
      WHERE assignment.identity_id = NEW.id
        AND role.code = 'trainee'
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'HUB_TRAINEE_LOCALE_MUST_BE_ENGLISH', ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER hub_role_assignments_trainee_locale
BEFORE INSERT OR UPDATE OF identity_id, role_id
ON public.hub_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.hub_enforce_trainee_locale();

CREATE TRIGGER hub_identities_trainee_locale
BEFORE UPDATE OF preferred_locale
ON public.hub_identities
FOR EACH ROW EXECUTE FUNCTION public.hub_enforce_trainee_locale();

REVOKE ALL ON public.hub_governance_settings
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.hub_governance_settings TO service_role;

REVOKE ALL ON FUNCTION public.hub_enforce_auditor_role_exclusivity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_enforce_auditor_role_exclusivity()
  TO service_role;

REVOKE ALL ON FUNCTION public.hub_enforce_trainee_locale()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_enforce_trainee_locale()
  TO service_role;
