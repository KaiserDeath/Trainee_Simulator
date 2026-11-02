import assert from 'node:assert/strict';
import test from 'node:test';
import { readAllById } from '../../src/domain/readAllById.js';
function fixture(rows, { cap = 1000, failPage = -1 } = {}) {
  let calls = 0;
  return () => {
    let cursor = '', limit = 250;
    return {
      order() { return this; }, limit(value) { limit = value; return this; }, gt(field, value) { assert.equal(field, 'id'); cursor = value; return this; },
      then(resolve, reject) {
        const page = calls++;
        return Promise.resolve(page === failPage ? { error: new Error('page failed') } : { data: rows.filter((row) => row.id > cursor).slice(0, Math.min(cap, limit)), error: null }).then(resolve, reject);
      }
    };
  };
}
test('traverses beyond provider limits without dropped or duplicated rows, including short pages', async () => {
  const rows = Array.from({ length: 1503 }, (_, n) => ({ id: String(n).padStart(6, '0') }));
  assert.deepEqual(await readAllById(fixture(rows, { cap: 73 })), rows);
  assert.deepEqual(await readAllById(fixture([])), []);
});
test('page failure rejects the entire aggregation rather than returning partial totals', async () => {
  const rows = Array.from({ length: 501 }, (_, n) => ({ id: String(n).padStart(6, '0') }));
  await assert.rejects(readAllById(fixture(rows, { failPage: 1 })), /page failed/);
  await assert.rejects(readAllById(fixture(rows), { maxRows: 500 }), /row budget/);
});
test('nonadvancing provider results fail closed', async () => {
  const query = () => ({ order() { return this; }, limit() { return this; }, gt() { return this; }, then(resolve) { return Promise.resolve({ data: [{ id: 'same' }] }).then(resolve); } });
  await assert.rejects(readAllById(query), /did not advance/);
});
test('real statistics builder aggregates all timed samples past the 1000-row cap', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-characterization-only';
  const { supabase } = await import('../../src/config/supabase.js');
  const { buildOperationTimeStats } = await import('../../src/engine/SessionEngine.js');
  const rows = Array.from({ length: 1503 }, (_, n) => ({ id: String(n).padStart(6, '0'), type: n < 1000 ? 'ADD CREDITS' : 'WITHDRAW CREDITS', handling_time_seconds: n < 1000 ? 10 : 20, session: { id: 'session', trainee_name: 'Fixture' } }));
  const original = supabase.from;
  const factory = fixture(rows);
  supabase.from = (table) => {
    assert.equal(table, 'sandbox_operations');
    return { select() { return this; }, not() { return factory(); } };
  };
  try {
    const stats = await buildOperationTimeStats();
    assert.equal(stats.overall.count, 1503);
    assert.equal(stats.overall.averageSeconds, Number(((10000 + 503 * 20) / 1503).toFixed(2)));
    assert.equal(stats.allOperations.find((row) => row.type === 'WITHDRAW CREDITS').count, 503);
    assert.equal(stats.perPerson[0].overall.count, 1503);
  } finally { supabase.from = original; }
});
