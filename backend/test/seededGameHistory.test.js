import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMirroredGameHistory }
  from '../src/services/sandboxService.js';

const account = {
  id: 'account-1',
  session_id: 'session-1',
  customer_id: 'customer-1',
  game: 'Golden Dragon',
  game_username: 'M-123-456-789'
};

const movement = (overrides = {}) => ({
  session_id: 'session-1',
  customer_id: 'customer-1',
  type: 'WITHDRAW CREDITS',
  amount: 150,
  description: JSON.stringify({
    kind: 'MOVEMENT_HISTORY',
    playerId: 'M-123-456-789',
    game: 'Golden Dragon',
    acceptedAt: '2026-09-28T10:00:15.000Z',
    manager: 'Bot-V3',
    status: 'Approved'
  }),
  created_at: '2026-09-28T10:00:15.000Z',
  ...overrides
});

test('a seeded Backend movement on a seeded game account also appears in that game history', () => {
  const row = buildMirroredGameHistory(
    movement(),
    [account]
  );

  assert.equal(row.type, 'GAME WITHDRAW CREDITS');
  assert.equal(row.amount, 150);
  assert.equal(row.game_account_id, 'account-1');
  assert.equal(row.game, 'Golden Dragon');
  assert.equal(row.game_username, 'M-123-456-789');
  assert.equal(row.created_at, '2026-09-28T10:00:15.000Z');
  assert.equal(
    JSON.parse(row.description).kind,
    'GAME_HISTORY'
  );
});

test('a seeded movement on a game with no simulated account stays Backend-only', () => {
  const row = buildMirroredGameHistory(
    movement({
      description: JSON.stringify({
        kind: 'MOVEMENT_HISTORY',
        playerId: 'johndoeyol',
        game: 'Yolo',
        acceptedAt: '2026-09-28T10:00:15.000Z'
      })
    }),
    [account]
  );

  assert.equal(row, null);
});
