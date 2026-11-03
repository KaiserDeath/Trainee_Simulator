import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readAllById } from '../src/domain/readAllById.js';

const config = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const host = new URL(config.SUPABASE_URL).hostname;
if (!host.endsWith('.supabase.co')) throw new Error('Expected hosted Supabase configuration.');
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const path = new URL('../../outputs/trainer-cleanup-manifest-2026-11-02.json', import.meta.url);
const resultPath = new URL('../../outputs/trainer-cleanup-result-2026-11-02.json', import.meta.url);
// Reviewed exact names only. Person-like names and abbreviations are preserved.
const allowed = new Set(['test test', 't6est test', 'test tes', 'capa capa', 'capacitacion -', 'asda asdasd', 'asdas asdasd', 'asdasd asdasd', 'asdasd asdasda', 'asdasd asdasdasd', 'sdasd asdasd', 'audit trainee', 'tedt tetd']);
const relatedTables = ['sandbox_operations', 'sandbox_customers', 'sandbox_game_accounts', 'sandbox_game_wallets', 'sandbox_transaction_history', 'sandbox_game_history', 'trainee_action_logs'];
const hubTables = ['hub_attempts', 'hub_practice_contexts', 'hub_assessment_attempts'];
async function count(table, column, ids) {
  if (!ids.length) return 0;
  const response = await db.from(table).select('id', { count: 'exact', head: true }).in(column, ids);
  if (response.error) throw new Error(`Reference check failed: ${table} (${response.error.code})`);
  return response.count;
}
async function relations(ids) {
  const related = Object.fromEntries(await Promise.all(relatedTables.map(async (table) => [table, await count(table, 'session_id', ids)])));
  const hub = Object.fromEntries(await Promise.all(hubTables.map(async (table) => [table, await count(table, 'legacy_trainee_session_id', ids)])));
  const operations = ids.length ? await readAllById(() => db.from('sandbox_operations').select('id').in('session_id', ids)) : [];
  for (const [table, column] of [['hub_practice_contexts', 'operation_id'], ['hub_assessment_operation_results', 'sandbox_operation_id']]) {
    let total = 0;
    for (let start = 0; start < operations.length; start += 100) total += await count(table, column, operations.slice(start, start + 100).map((row) => row.id));
    hub[`${table}.${column}`] = total;
  }
  return { related, hub };
}
function fingerprint(rows) { return JSON.stringify(rows.map(({ id, trainee_name, status }) => ({ id, trainee_name, status })).sort((a,b) => a.id.localeCompare(b.id))); }
function assertEligible(sessions) {
  if (!sessions.length || sessions.some((s) => !allowed.has((s.trainee_name || '').trim().toLowerCase()) || !['completed', 'submitted'].includes(s.status))) throw new Error('Invalid, active or changed cleanup scope.');
}
if (!process.argv.includes('--apply')) {
  const all = await readAllById(() => db.from('trainee_sessions').select('id,trainee_name,status,started_at'));
  const sessions = all.filter((s) => allowed.has((s.trainee_name || '').trim().toLowerCase()));
  assertEligible(sessions);
  const references = await relations(sessions.map((s) => s.id));
  if (Object.values(references.hub).some((value) => value !== 0)) throw new Error('Hub-linked records are excluded from this cleanup.');
  const byName = {};
  for (const session of sessions) byName[session.trainee_name] = (byName[session.trainee_name] || 0) + 1;
  const manifest = { createdAt: new Date().toISOString(), targetHost: host, totalSessionsBefore: all.length, byName, sessions, ...references, scope: 'Explicit user-authorized test/junk session cleanup; preserve plausible personal names and all Hub records.' };
  const content = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(path, content);
  console.log(JSON.stringify({ mode: 'preview', sessions: sessions.length, byName, ...references, manifestSha256: crypto.createHash('sha256').update(content).digest('hex') }, null, 2));
} else {
  const content = fs.readFileSync(path, 'utf8');
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const supplied = process.argv[process.argv.indexOf('--apply') + 1];
  if (digest !== supplied) throw new Error('Reviewed manifest hash required.');
  const manifest = JSON.parse(content);
  if (manifest.targetHost !== host || Date.now() - Date.parse(manifest.createdAt) > 30 * 60 * 1000) throw new Error('Wrong target or expired manifest.');
  assertEligible(manifest.sessions);
  const ids = manifest.sessions.map((s) => s.id);
  const { data: current, error: readError } = await db.from('trainee_sessions').select('id,trainee_name,status').in('id', ids);
  if (readError || fingerprint(current) !== fingerprint(manifest.sessions)) throw new Error('Session scope changed since preview.');
  const before = await relations(ids);
  if (Object.values(before.hub).some((value) => value !== 0)) throw new Error('Hub linkage appeared; no deletion performed.');
  // Per-session transactions avoid the hosted bulk statement timeout. Each
  // root delete and its FK cascades remain atomic; never delete children first.
  const removed = [];
  for (const session of manifest.sessions) {
    const { data: deleted, error } = await db.from('trainee_sessions').delete().eq('id', session.id).eq('trainee_name', session.trainee_name).eq('status', session.status).select('id');
    if (error || deleted?.length !== 1) {
      fs.writeFileSync(resultPath, JSON.stringify({ status: 'stopped', completedAt: new Date().toISOString(), manifestSha256: digest, deletedSessions: removed.length, deletedSessionIds: removed.map((row) => row.id), failedSessionId: session.id, errorCode: error?.code || 'SCOPE_CHANGED' }, null, 2) + '\n');
      throw new Error('Per-session deletion stopped (' + (error?.code || 'SCOPE_CHANGED') + '); inspect checkpoint before resuming.');
    }
    removed.push(...deleted);
    fs.writeFileSync(resultPath, JSON.stringify({ status: 'in-progress', manifestSha256: digest, deletedSessions: removed.length, deletedSessionIds: removed.map((row) => row.id) }, null, 2) + '\n');
    if (removed.length % 5 === 0 || removed.length === ids.length) console.log(JSON.stringify({ deletedSessions: removed.length, selectedSessions: ids.length }));
  }
  const after = await relations(ids);
  const remaining = await count('trainee_sessions', 'id', ids);
  const total = await db.from('trainee_sessions').select('id', { count: 'exact', head: true });
  if (total.error) throw new Error('Post-cleanup total unavailable.');
  const result = { completedAt: new Date().toISOString(), manifestSha256: digest, deletedSessions: removed.length, expectedSessions: ids.length, remainingSelectedSessions: remaining, remainingTotalSessions: total.count, before, after, verified: removed.length === ids.length && remaining === 0 && Object.values(after.related).every((value) => value === 0) };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) throw new Error('Cleanup completed with a verification mismatch; inspect result before any further action.');
}
