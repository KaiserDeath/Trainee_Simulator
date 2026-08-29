import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIlikeFilter,
  gameNamesMatch,
  normalizeGameName
} from '../../src/utils/search.js';

test('prototype customer search trims one term and applies it to its four current fields', () => {
  assert.equal(
    buildIlikeFilter(
      [
        'username',
        'first_name',
        'last_name',
        'email'
      ],
      '  exact-player-id  '
    ),
    'username.ilike.%exact-player-id%,' +
      'first_name.ilike.%exact-player-id%,' +
      'last_name.ilike.%exact-player-id%,' +
      'email.ilike.%exact-player-id%'
  );
});

test('prototype search omits the Supabase OR filter for an empty query', () => {
  assert.equal(
    buildIlikeFilter(['game_username', 'game'], '   '),
    null
  );
});

test('prototype game search currently treats hyphens, spaces, and case as equivalent', () => {
  assert.equal(normalizeGameName(' Orion-Stars '), 'orion stars');
  assert.equal(gameNamesMatch('Orion-Stars', 'orion stars'), true);
  assert.equal(gameNamesMatch('Vblink', 'Orion Stars'), false);
});
