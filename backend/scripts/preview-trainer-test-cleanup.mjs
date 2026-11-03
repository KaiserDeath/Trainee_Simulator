import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Deliberately read-only: this script creates a review manifest, never deletes.
const config = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
if (!new URL(config.SUPABASE_URL).hostname.endsWith('.supabase.co')) throw new Error('Expected hosted Supabase configuration.');
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from('trainee_sessions').select('id,trainee_name,status,started_at').order('id').limit(1000);
if (error) throw new Error(`Session preview failed: ${error.code}`);
if (data.length === 1000) throw new Error('Preview requires pagination before selection.');
const allowedNames = new Set(['test test', 't6est test', 'test tes', 'capa capa']);
const sessions = data.filter((session) => allowedNames.has((session.trainee_name || '').trim().toLowerCase()));
const ids = sessions.map((session) => session.id);
const references = [
 ['sandbox_operations', 'session_id'], ['sandbox_customers', 'session_id'], ['sandbox_game_accounts', 'session_id'],
 ['sandbox_game_wallets', 'session_id'], ['sandbox_transaction_history', 'session_id'], ['trainee_action_logs', 'session_id'],
 ['hub_attempts', 'legacy_trainee_session_id'], ['hub_practice_contexts', 'legacy_trainee_session_id'], ['hub_assessment_attempts', 'legacy_trainee_session_id']
];
const counts = await Promise.all(references.map(async ([table, column]) => {
 if (!ids.length) return { table, count: 0 };
 const response = await db.from(table).select('id', { count: 'exact', head: true }).in(column, ids);
 return response.error ? { table, errorCode: response.error.code } : { table, count: response.count };
}));
const byName = {};
for (const session of sessions) byName[session.trainee_name] = (byName[session.trainee_name] || 0) + 1;
const manifest = { generatedAt: new Date().toISOString(), mode: 'preview-only', selectedNames: [...allowedNames], byName, sessions, relatedCounts: counts, activeSessions: sessions.filter((s) => s.status === 'active').length, excludedAmbiguousNames: data.filter((s) => /capa/i.test(s.trainee_name || '') && !allowedNames.has((s.trainee_name || '').trim().toLowerCase())).map((s) => s.trainee_name), deleted: 0 };
const output = new URL('../../outputs/trainer-cleanup-preview-2026-11-02.json', import.meta.url);
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ preview: fileURLToPath(output), sessions: sessions.length, byName, relatedCounts: counts, activeSessions: manifest.activeSessions, excludedAmbiguousNames: manifest.excludedAmbiguousNames, deleted: 0 }, null, 2));
