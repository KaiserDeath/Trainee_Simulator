import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverActiveSessions } from '../../src/engine/sessionRecovery.js';

const now = Date.parse('2026-10-30T19:40:00Z');
const active = { id: 'active', started_at: '2026-10-30T19:35:00Z', duration_minutes: 10 };
function fixture(sessions, error = null) {
  const starts = [], stops = [], completed = [];
  const gameMaster = {
    autoCloseMs: 1800000,
    activeSessions: new Map(),
    async startSession(id, remaining) { starts.push([id, remaining]); this.activeSessions.set(id, {}); },
    stopSession(id) { stops.push(id); this.activeSessions.delete(id); }
  };
  return {
    starts, stops, completed, gameMaster,
    args: { now, gameMaster, db: { from: () => ({ select: () => ({ eq: async () => ({ data: sessions, error }) }) }) }, completeSession: async id => completed.push(id) }
  };
}

test('restart restores generation using the original remaining duration, without duplicate timers', async () => {
  const f = fixture([active]);
  await recoverActiveSessions(f.args);
  await recoverActiveSessions(f.args);
  assert.deepEqual(f.starts, [['active', 300000]]);
});

test('expired sessions complete without generating more operations', async () => {
  const f = fixture([{ ...active, duration_minutes: 2 }]);
  await recoverActiveSessions(f.args);
  assert.deepEqual(f.starts, []);
  assert.deepEqual(f.completed, ['active']);
});

test('recovery stops local timers for sessions no longer active in the database', async () => {
  const f = fixture([]);
  f.gameMaster.activeSessions.set('submitted', {});
  await recoverActiveSessions(f.args);
  assert.deepEqual(f.stops, ['submitted']);
});

test('database outage preserves timers and recovery succeeds on a later retry', async () => {
  const f = fixture([], new Error('database offline'));
  f.gameMaster.activeSessions.set('existing', {});
  await assert.rejects(recoverActiveSessions(f.args), /database offline/);
  assert.equal(f.gameMaster.activeSessions.has('existing'), true);
  const recovered = fixture([active]);
  f.args.db = recovered.args.db;
  await recoverActiveSessions(f.args);
  assert.deepEqual(f.starts, [['active', 300000]]);
});
