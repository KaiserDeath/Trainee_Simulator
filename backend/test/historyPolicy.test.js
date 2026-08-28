import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterBackendHistoryRows,
  filterGameHistoryRows,
  gameHistoryMatchesOperation,
  isGameHistoryType
} from '../src/services/historyPolicy.js';

const games = [
  'Orion Stars',
  'Vblink',
  'Golden Dragon'
];

test('keeps game transaction records out of Backend customer history', () => {
  const rows = games.flatMap((game, index) => [
    {
      id: `game-${index}`,
      type: 'GAME ADD CREDITS',
      amount: 25,
      game
    },
    {
      id: `backend-${index}`,
      type: 'ADD CREDITS',
      amount: 25,
      game
    }
  ]);

  assert.deepEqual(
    filterBackendHistoryRows(rows)
      .map(row => row.id),
    games.map((_, index) =>
      `backend-${index}`
    )
  );
});

test('keeps Backend settlement records out of every game history', () => {
  const rows = games.flatMap((game, index) => [
    {
      id: `game-${index}`,
      type: 'GAME WITHDRAW CREDITS',
      amount: 10,
      game
    },
    {
      id: `backend-${index}`,
      type: 'WITHDRAW CREDITS',
      amount: 10,
      game
    }
  ]);

  assert.deepEqual(
    filterGameHistoryRows(rows)
      .map(row => row.id),
    games.map((_, index) =>
      `game-${index}`
    )
  );
});

test('recognizes all game-owned history actions', () => {
  assert.equal(
    isGameHistoryType(
      'GAME ADD CREDITS'
    ),
    true
  );
  assert.equal(
    isGameHistoryType(
      'GAME WITHDRAW CREDITS'
    ),
    true
  );
  assert.equal(
    isGameHistoryType(
      'GAME RESET PASSWORD'
    ),
    true
  );
  assert.equal(
    isGameHistoryType(
      'GAME CREATE ACCOUNT'
    ),
    true
  );
  assert.equal(
    isGameHistoryType('ADD CREDITS'),
    false
  );
});

test('matches new game history by exact account ID', () => {
  const operation = {
    game_account_id: 'account-1',
    game_account: {
      game: 'Orion Stars',
      game_username: 'player_one'
    }
  };

  assert.equal(
    gameHistoryMatchesOperation(
      {
        game_account_id: 'account-1',
        game: 'Wrong Game',
        game_username: 'wrong-player'
      },
      operation
    ),
    true
  );
  assert.equal(
    gameHistoryMatchesOperation(
      {
        game_account_id: 'account-2',
        game: 'Orion Stars',
        game_username: 'player_one'
      },
      operation
    ),
    false
  );
});

test('uses both game and username for unattributed legacy history', () => {
  const operation = {
    game_account_id: 'account-1',
    game_account: {
      game: 'Orion Stars',
      game_username: 'player_one'
    }
  };
  const legacyRow = {
    game_account_id: null,
    description: JSON.stringify({
      game: 'Orion Stars',
      mobileId: 'player_one'
    })
  };

  assert.equal(
    gameHistoryMatchesOperation(
      legacyRow,
      operation
    ),
    true
  );
  assert.equal(
    gameHistoryMatchesOperation(
      {
        ...legacyRow,
        description: JSON.stringify({
          game: 'Orion Stars',
          mobileId: 'different-player'
        })
      },
      operation
    ),
    false
  );
});
