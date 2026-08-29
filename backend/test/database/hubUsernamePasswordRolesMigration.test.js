import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../../../supabase/migrations/20260821002000_hub_username_password_roles.sql', import.meta.url),
  'utf8'
);

test('adds case-insensitive generated usernames without storing passwords', () => {
  assert.match(sql, /ADD COLUMN first_name TEXT[\s\S]*ADD COLUMN surname TEXT[\s\S]*ADD COLUMN username TEXT/i);
  assert.match(sql, /CREATE UNIQUE INDEX hub_identities_username_ci_unique[\s\S]*lower\(username\)/i);
  assert.doesNotMatch(sql, /ADD COLUMN (?:password|password_hash)/i);
});

test('migrates stable product role ids to ADMIN TRAINER POSTULANTE and RRHH', () => {
  assert.match(sql, /000000000201'[\s\S]*'postulante'/i);
  assert.match(sql, /000000000203'[\s\S]*'admin'/i);
  assert.match(sql, /000000000204'[\s\S]*'rrhh'/i);
});

test('keeps RRHH and POSTULANTE exclusive and Postulantes English-only under row locks', () => {
  assert.match(sql, /HUB_RRHH_ROLE_MUST_BE_EXCLUSIVE/i);
  assert.match(sql, /HUB_POSTULANTE_ROLE_MUST_BE_EXCLUSIVE/i);
  assert.match(sql, /FOR UPDATE[\s\S]*v_new_role_code IN \('rrhh', 'postulante'\)/i);
  assert.match(sql, /HUB_POSTULANTE_LOCALE_MUST_BE_ENGLISH/i);
  assert.match(sql, /v_role_code = 'postulante'[\s\S]*FOR UPDATE/i);
});

test('keeps identity and role records unavailable to browser database roles', () => {
  assert.match(sql, /REVOKE ALL ON public\.hub_identities[\s\S]*PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT ALL ON public\.hub_identities[\s\S]*TO service_role/i);
});
