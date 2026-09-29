import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPendingMovementRow }
  from '../src/services/customerService.js';

test('a pending credit request shows as a Pending customer movement', () => {
  const row = buildPendingMovementRow({
    id: 'abcdef12-3456-7890-abcd-ef1234567890',
    session_id: 'session-1',
    customer_id: 'customer-1',
    type: 'ADD CREDITS',
    amount: 40,
    created_at: '2026-09-29T10:00:00.000Z',
    game_account: {
      game: 'Orion Stars',
      game_username: 'OS-12345'
    }
  });

  assert.equal(row.status, 'PENDING');
  assert.equal(row.operation_code, 'ABCDEF12');
  assert.equal(row.game, 'Orion Stars');
  assert.equal(row.game_username, 'OS-12345');
  assert.equal(row.amount, 40);
  assert.equal(row.requested_at, '2026-09-29T10:00:00.000Z');
  assert.equal(row.processed_at, null);
});
