import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../../../supabase/migrations/20260821001000_hub_auditor_reporting.sql', import.meta.url),
  'utf8'
);

test('records the approved bilingual trainer locale without changing trainee locale', () => {
  assert.match(
    sql,
    /trainer_locales JSONB NOT NULL DEFAULT '\["en", "es"\]'::jsonb/i
  );
  assert.doesNotMatch(sql, /ALTER[^;]*trainee_locales/is);
});

test('indexes only the existing explicit Hub-to-simulator session lineage', () => {
  assert.match(
    sql,
    /CREATE INDEX hub_attempts_legacy_session_idx[\s\S]*legacy_trainee_session_id[\s\S]*IS NOT NULL/i
  );
  assert.doesNotMatch(sql, /trainee_name\s*=/i);
});

test('keeps governance settings unavailable to browser database roles', () => {
  assert.match(
    sql,
    /REVOKE ALL ON public\.hub_governance_settings[\s\S]*PUBLIC, anon, authenticated/i
  );
  assert.match(
    sql,
    /GRANT ALL ON public\.hub_governance_settings TO service_role/i
  );
});

test('makes the read-only auditor role exclusive at the database boundary', () => {
  assert.match(
    sql,
    /CREATE TRIGGER hub_role_assignments_auditor_exclusive[\s\S]*BEFORE INSERT OR UPDATE/i
  );
  assert.match(sql, /HUB_AUDITOR_ROLE_MUST_BE_EXCLUSIVE/i);
  assert.match(
    sql,
    /hub_enforce_auditor_role_exclusivity[\s\S]*hub_identities[\s\S]*FOR UPDATE/i
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.hub_enforce_auditor_role_exclusivity\(\)[\s\S]*PUBLIC, anon, authenticated/i
  );
});

test('enforces English for trainee identities at role assignment and locale update boundaries', () => {
  assert.match(sql, /HUB_TRAINEE_LOCALE_MUST_BE_ENGLISH/i);
  assert.match(
    sql,
    /CREATE TRIGGER hub_role_assignments_trainee_locale[\s\S]*BEFORE INSERT OR UPDATE/i
  );
  assert.match(
    sql,
    /CREATE TRIGGER hub_identities_trainee_locale[\s\S]*BEFORE UPDATE OF preferred_locale/i
  );
  assert.match(
    sql,
    /hub_enforce_trainee_locale[\s\S]*preferred_locale INTO v_locale[\s\S]*FOR UPDATE/i
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.hub_enforce_trainee_locale\(\)[\s\S]*PUBLIC, anon, authenticated/i
  );
});
