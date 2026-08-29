import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL(
    '../../../supabase/migrations/20260825000000_orion_player_nickname.sql',
    import.meta.url
  ),
  'utf8'
);

test('stores an optional game nickname separately and backfills existing accounts', () => {
  assert.match(
    sql,
    /ALTER TABLE public\.sandbox_game_accounts[\s\S]*ADD COLUMN nickname TEXT/i
  );
  assert.match(
    sql,
    /SET nickname = game_username[\s\S]*WHERE nickname IS NULL/i
  );
});

test('does not encode a new password policy in the nickname migration', () => {
  assert.doesNotMatch(
    sql,
    /password|complexity|lockout|recovery/i
  );
});
