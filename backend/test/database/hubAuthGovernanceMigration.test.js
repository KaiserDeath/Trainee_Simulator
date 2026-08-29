import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../../../supabase/migrations/20260821000000_hub_auth_governance.sql', import.meta.url),
  'utf8'
);

test('binds Hub identities to Supabase Auth and explicit assigned-learner visibility', () => {
  assert.match(sql, /auth_user_id UUID UNIQUE REFERENCES auth\.users\(id\)/i);
  assert.match(sql, /CREATE TABLE public\.hub_trainer_learner_assignments/i);
  assert.match(sql, /trainer_identity_id UUID NOT NULL/i);
  assert.match(sql, /learner_identity_id UUID NOT NULL/i);
});

test('records the approved locale and two-year retention policy', () => {
  assert.match(sql, /retention_years INTEGER NOT NULL CHECK \(retention_years = 2\)/i);
  assert.match(sql, /trainee_locales = '\["en"\]'/i);
  assert.match(sql, /administrator_locales = '\["en", "es"\]'/i);
  assert.match(sql, /INTERVAL '2 years'/i);
});

test('requires a different administrator to approve an immutable content version', () => {
  assert.match(sql, /CREATE TABLE public\.hub_content_versions/i);
  assert.match(sql, /reviewed_by_identity_id IS NULL[\s\S]*reviewed_by_identity_id <> author_identity_id/i);
  assert.match(sql, /HUB_SEPARATE_APPROVER_REQUIRED/i);
  assert.match(sql, /hub_content_review_events_append_only[\s\S]*BEFORE UPDATE OR DELETE/i);
  assert.match(sql, /ARRAY\['admin'\]/i);
});

test('keeps new identity and governance objects server-only', () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public[\s\S]*PUBLIC, anon, authenticated/i);
  assert.match(sql, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public[\s\S]*PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role/i);
});
