import assert from 'node:assert/strict';
import test from 'node:test';
import { startSimulationWorker } from '../../src/engine/simulationWorker.js';
import { notifySimulationWork } from '../../src/engine/simulationSignals.js';

const flush = () => new Promise(setImmediate);
test('Hub work signals wake the production scheduler and stop removes the listener',async()=>{
  const f=fixture();await flush();
  await f.timers.advance(31000);
  const before=f.calls.length;
  notifySimulationWork();await f.timers.advance(0);
  assert.equal(f.calls.length,before+2);
  f.worker.stop();notifySimulationWork();assert.equal(f.timers.tasks.size,0);
});
function clock() {
  let time = 0;
  let id = 0;
  const tasks = new Map();
  const intervals = new Map();
  return {
    now: () => time,
    tasks,
    intervals,
    setTimeout(callback, delay) { const key = ++id; tasks.set(key, { callback, at: time + delay }); return key; },
    clearTimeout(key) { tasks.delete(key); },
    setInterval(callback) { const key = ++id; intervals.set(key, callback); return key; },
    clearInterval(key) { intervals.delete(key); },
    async advance(ms) {
      const end = time + ms;
      while (tasks.size) {
        const [key, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (task.at > end) break;
        time = task.at;
        tasks.delete(key);
        await task.callback();
      }
      time = end;
    },
  };
}
function fixture(handler = () => null, generate = async () => {}) {
  const timers = clock();
  const calls = [];
  const errors = [];
  const worker = startSimulationWorker({ timers, now: timers.now,
    client: { async rpc(name, args) { calls.push([name, args]); return handler(name, args, timers.now()) || { data: null }; } },
    gameMaster: { generateOperations: generate }, onError: (error) => errors.push(error),
  });
  return { worker, timers, calls, errors };
}

test('empty worker backs off to 30 seconds and reduces total idle RPCs', async () => {
  const f = fixture();
  await flush();
  await f.timers.advance(120000);
  assert.equal(f.calls.filter(([name]) => name === 'hub_claim_simulation_job').length, 8);
  assert.equal(f.calls.length, 16); // Includes the scalar next-wake lookup.
  assert.equal([...f.timers.tasks.values()][0].at, 121000);
  f.worker.stop();
  assert.equal(f.timers.tasks.size, 0);
});

test('next due time avoids empty polling without delaying the scheduled claim', async () => {
  const f = fixture((name) => ({ data: name === 'hub_prepare_simulation_poll' ? new Date(12000).toISOString() : [] }));
  await flush();
  assert.equal([...f.timers.tasks.values()][0].at, 12000);
  await f.timers.advance(11999);
  assert.equal(f.calls.length, 2);
  await f.timers.advance(1);
  assert.equal(f.calls.length, 4);
  f.worker.stop();
});

test('new local session wakes an idle worker immediately with fenced delivery', async () => {
  let ready = false;
  const generated = [];
  const job = { id: 'job', session_id: 'session', lease_token: 'lease', sequence_number: 7, deadline: new Date(180000).toISOString() };
  const f = fixture((name) => {
    if (name === 'hub_claim_simulation_job' && ready) { ready = false; return { data: [job] }; }
    return { data: null };
  }, async (...args) => generated.push(args));
  await flush();
  await f.timers.advance(31000);
  ready = true;
  f.worker.wake();
  await f.timers.advance(0);
  assert.equal(generated.length, 1);
  assert.equal(generated[0][1].deliveryId, 'job:7');
  assert.equal(generated[0][1].leaseToken, 'lease');
  assert.equal(f.calls.at(-1)[1].p_success, true);
  assert.equal(f.timers.intervals.size, 0);
  f.worker.stop();
});

test('wake during a pending claim is retained, without overlapping claims', async () => {
  let release;
  let count = 0;
  const f = fixture(async (name) => {
    if (name === 'hub_claim_simulation_job' && ++count === 1) await new Promise((resolve) => { release = resolve; });
    return { data: null };
  });
  await flush();
  f.worker.wake();
  await f.worker.tick();
  assert.equal(count, 1);
  release();
  await flush();
  assert.equal([...f.timers.tasks.values()][0].at, 0);
  await f.timers.advance(0);
  assert.equal(f.calls.filter(([name]) => name === 'hub_claim_simulation_job').length, 2);
  f.worker.stop();
});

test('database outages back off, recover, and shutdown prevents rescheduling', async () => {
  let failed = true;
  const f = fixture(() => failed ? { error: new Error('offline') } : { data: null });
  await flush();
  await f.timers.advance(7000);
  assert.equal(f.calls.length, 4);
  assert.equal(f.errors.length, 4);
  failed = false;
  f.worker.wake();
  await f.timers.advance(0);
  assert.equal([...f.timers.tasks.values()][0].at, 8000);
  f.worker.stop();
  f.worker.wake();
  await f.timers.advance(60000);
  assert.equal(f.calls.length, 6);
});

test('expired jobs finish without generation; failed generation releases the lease for retry', async () => {
  for (const expired of [true, false]) {
    let generated = 0;
    const job = { id: 'job', session_id: 'session', lease_token: 'lease', sequence_number: 1, deadline: new Date(expired ? -1 : 10000).toISOString() };
    const f = fixture((name) => ({ data: name === 'hub_claim_simulation_job' ? [job] : true }), async () => { generated++; throw new Error('generation failed'); });
    await flush();
    assert.equal(generated, expired ? 0 : 1);
    assert.equal(f.calls.at(-1)[1].p_success, expired);
    assert.equal(f.timers.intervals.size, 0);
    f.worker.stop();
  }
});

test('in-flight work renews its lease and finishes on shutdown without another poll', async () => {
  let release;
  const job = { id: 'job', session_id: 'session', lease_token: 'lease', sequence_number: 1, deadline: new Date(10000).toISOString() };
  const f = fixture((name) => ({ data: name === 'hub_claim_simulation_job' ? [job] : true }), () => new Promise((resolve) => { release = resolve; }));
  await flush();
  assert.equal(f.timers.intervals.size, 1);
  for (const heartbeat of f.timers.intervals.values()) heartbeat();
  await flush();
  assert.equal(f.calls.at(-1)[0], 'hub_renew_simulation_job');
  await f.worker.tick();
  assert.equal(f.calls.filter(([name]) => name === 'hub_claim_simulation_job').length, 1);
  f.worker.stop();
  release();
  await flush();
  assert.equal(f.calls.at(-1)[0], 'hub_finish_simulation_job');
  assert.equal(f.timers.intervals.size, 0);
  assert.equal(f.timers.tasks.size, 0);
});
