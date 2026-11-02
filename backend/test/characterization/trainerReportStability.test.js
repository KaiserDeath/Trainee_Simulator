import assert from 'node:assert/strict';
import test from 'node:test';

// No DB or provider traffic: all report reads are intercepted before execution.
test('historical report exposes stored outcome separately when mutable balance evidence drifts', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-characterization-only';
  const { supabase } = await import('../../src/config/supabase.js');
  const { buildSessionReport } = await import('../../src/engine/SessionEngine.js');
  const operation = {
    id: 'refresh', session_id: 'session', type: 'REFRESH BALANCE', status: 'APPROVED', is_correct: true,
    request_data: { gameId: 'player', kiosk: 'Vblink', amount: 10, newPassword: 'private-literal' },
    game_account: { game: 'Vblink', game_username: 'player', balance: 10, password: 'private-literal' }
  };
  const original = supabase.from;
  supabase.from = (table) => {
    assert.ok(['trainee_sessions', 'sandbox_operations'].includes(table), `unexpected query: ${table}`);
    const result = { data: table === 'trainee_sessions' ? { id: 'session' } : [structuredClone(operation)], error: null };
    return { select() { return this; }, eq() { return this; }, single() { return Promise.resolve(result); }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  };
  try {
    const first = await buildSessionReport('session');
    const repeated = await buildSessionReport('session');
    assert.deepEqual(first, repeated);
    assert.equal(first.operations[0].is_correct, true);
    operation.game_account.balance = 20;
    const changed = await buildSessionReport('session');
    assert.equal(changed.operations[0].is_correct, false);
    assert.equal(changed.operations[0].original_is_correct, true);
    assert.equal(changed.operations[0].evidence_projection_version, 1);
    assert.equal(operation.is_correct, true);
    assert.doesNotMatch(JSON.stringify(changed), /private-literal/);
  } finally {
    supabase.from = original;
  }
});
