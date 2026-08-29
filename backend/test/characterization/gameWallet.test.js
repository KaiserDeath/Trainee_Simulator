import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGameWalletSeeds,
  MINIMUM_GAME_WALLET_SEED
} from '../../src/domain/gameWallet.js';

test('each seeded game receives its own 20,000 loading wallet', () => {
  assert.deepEqual(
    buildGameWalletSeeds({
      sessionId: 'session-a',
      games: [
        'Game A',
        'Game B',
        'Game A'
      ]
    }),
    [
      {
        session_id: 'session-a',
        game: 'Game A',
        balance: MINIMUM_GAME_WALLET_SEED
      },
      {
        session_id: 'session-a',
        game: 'Game B',
        balance: MINIMUM_GAME_WALLET_SEED
      }
    ]
  );
});

test('a game wallet cannot be seeded below 20,000', () => {
  assert.throws(
    () => buildGameWalletSeeds({
      sessionId: 'session-a',
      games: ['Game A'],
      openingBalance: 19999
    }),
    /at least 20000/
  );
});
