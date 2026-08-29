-- Approved username/password authentication and product role names, 2026-08-21.
-- Supabase Auth still owns password hashing and JWT issuance. The Hub stores
-- only the generated username and never stores a password or browser token.

ALTER TABLE public.hub_identities
  ADD COLUMN first_name TEXT,
  ADD COLUMN surname TEXT,
  ADD COLUMN username TEXT;

ALTER TABLE public.hub_identities
  ADD CONSTRAINT hub_identities_first_name_present
    CHECK (first_name IS NULL OR length(btrim(first_name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT hub_identities_surname_present
    CHECK (surname IS NULL OR length(btrim(surname)) BETWEEN 1 AND 120),
  ADD CONSTRAINT hub_identities_username_shape
    CHECK (username IS NULL OR username ~ '^[A-Z][a-z0-9]{2,63}$');

CREATE UNIQUE INDEX hub_identities_username_ci_unique
  ON public.hub_identities (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.hub_identities.email IS
  'Internal Supabase Auth login identifier only; never a user-facing Hub credential.';

UPDATE public.hub_roles
SET code = CASE id
    WHEN '10000000-0000-4000-8000-000000000201'::uuid THEN 'postulante'
    WHEN '10000000-0000-4000-8000-000000000203'::uuid THEN 'admin'
    WHEN '10000000-0000-4000-8000-000000000204'::uuid THEN 'rrhh'
    ELSE code
  END,
  display_name = CASE id
    WHEN '10000000-0000-4000-8000-000000000201'::uuid THEN 'Postulante'
    WHEN '10000000-0000-4000-8000-000000000203'::uuid THEN 'Admin'
    WHEN '10000000-0000-4000-8000-000000000204'::uuid THEN 'RRHH'
    ELSE display_name
  END
WHERE id IN (
  '10000000-0000-4000-8000-000000000201'::uuid,
  '10000000-0000-4000-8000-000000000203'::uuid,
  '10000000-0000-4000-8000-000000000204'::uuid
);

ALTER TABLE public.hub_governance_settings
  RENAME COLUMN trainee_locales TO postulante_locales;

ALTER TABLE public.hub_governance_settings
  ADD COLUMN rrhh_locales JSONB NOT NULL DEFAULT '["en", "es"]'::jsonb
    CHECK (rrhh_locales = '["en", "es"]'::jsonb);

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

  IF v_new_role_code IN ('rrhh', 'postulante') AND EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS assignment
    JOIN public.hub_roles AS role ON role.id = assignment.role_id
    WHERE assignment.identity_id = NEW.identity_id
      AND role.code <> v_new_role_code
  ) THEN
    RAISE EXCEPTION USING MESSAGE = CASE v_new_role_code
      WHEN 'rrhh' THEN 'HUB_RRHH_ROLE_MUST_BE_EXCLUSIVE'
      ELSE 'HUB_POSTULANTE_ROLE_MUST_BE_EXCLUSIVE'
    END, ERRCODE = 'P0001';
  END IF;

  IF v_new_role_code NOT IN ('rrhh', 'postulante') AND EXISTS (
    SELECT 1
    FROM public.hub_role_assignments AS assignment
    JOIN public.hub_roles AS role ON role.id = assignment.role_id
    WHERE assignment.identity_id = NEW.identity_id
      AND role.code IN ('rrhh', 'postulante')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'HUB_EXCLUSIVE_ROLE_CONFLICT', ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

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

    IF v_role_code = 'postulante' THEN
      SELECT identity.preferred_locale INTO v_locale
      FROM public.hub_identities AS identity
      WHERE identity.id = NEW.identity_id
      FOR UPDATE;

      IF v_locale <> 'en' THEN
        RAISE EXCEPTION USING MESSAGE = 'HUB_POSTULANTE_LOCALE_MUST_BE_ENGLISH', ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hub_identities' AND NEW.preferred_locale <> 'en' THEN
    IF EXISTS (
      SELECT 1
      FROM public.hub_role_assignments AS assignment
      JOIN public.hub_roles AS role ON role.id = assignment.role_id
      WHERE assignment.identity_id = NEW.id
        AND role.code = 'postulante'
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'HUB_POSTULANTE_LOCALE_MUST_BE_ENGLISH', ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hub_enforce_auditor_role_exclusivity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_enforce_auditor_role_exclusivity()
  TO service_role;

REVOKE ALL ON FUNCTION public.hub_enforce_trainee_locale()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hub_enforce_trainee_locale()
  TO service_role;

REVOKE ALL ON public.hub_identities, public.hub_roles,
  public.hub_role_assignments, public.hub_governance_settings
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.hub_identities, public.hub_roles,
  public.hub_role_assignments, public.hub_governance_settings
  TO service_role;
