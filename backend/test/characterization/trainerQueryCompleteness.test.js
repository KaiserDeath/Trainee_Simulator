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
test('statistics builder uses one summary RPC and never downloads operation rows', async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-characterization-only';
  const { supabase } = await import('../../src/config/supabase.js');
  const { buildOperationTimeStats } = await import('../../src/engine/SessionEngine.js');
  const originalRpc = supabase.rpc;
  const originalFrom = supabase.from;
  let calls = 0;
  supabase.from = () => assert.fail('Statistics must not download individual operations');
  supabase.rpc = async (name) => {
    assert.equal(name, 'trainer_operation_time_stats'); calls++;
    return { data: { overall: { count: 1503, totalSeconds: 20060, minSeconds: 10, maxSeconds: 20 },
      allOperations: [{ type: 'WITHDRAW CREDITS', count: 503, totalSeconds: 10060, minSeconds: 20, maxSeconds: 20 }], perPerson: [] } };
  };
  try {
    const stats = await buildOperationTimeStats();
    assert.equal(calls, 1);
    assert.equal(stats.overall.count, 1503);
    assert.equal(stats.overall.averageSeconds, Number((20060 / 1503).toFixed(2)));
    assert.equal(stats.allOperations[0].count, 503);
    supabase.rpc = async () => ({ error: new Error('summary unavailable') });
    await assert.rejects(buildOperationTimeStats(), /summary unavailable/);
    supabase.rpc = async () => ({ data: null });
    await assert.rejects(buildOperationTimeStats(), /Invalid operation statistics/);
  } finally { supabase.rpc = originalRpc; supabase.from = originalFrom; }
});
