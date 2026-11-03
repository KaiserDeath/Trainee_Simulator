import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { formatOperationTimeStats } from '../backend/src/domain/operationTimeStats.js';
import { legacyOperationTimeStats } from '../backend/test/fixtures/legacyOperationTimeStats.js';

const migration = readFileSync(new URL('../supabase/migrations/20261103193000_operation_time_statistics.sql', import.meta.url), 'utf8').replace('CREATE FUNCTION public.trainer_operation_time_stats()', 'CREATE OR REPLACE FUNCTION public.trainer_operation_time_stats()');
const tests = readFileSync(new URL('../backend/test/integration/operationTimeStats.sql', import.meta.url), 'utf8');
const manySessions = `DO $$ DECLARE v_session UUID;v_customer UUID;BEGIN
FOR n IN 1..1001 LOOP
  INSERT INTO public.trainee_sessions(trainee_name) VALUES('Large directory fixture') RETURNING id INTO v_session;
  INSERT INTO public.sandbox_customers(session_id,username,balance) VALUES(v_session,'directory_fixture',0) RETURNING id INTO v_customer;
  INSERT INTO public.sandbox_operations(session_id,customer_id,type,status,handling_time_seconds)
    VALUES(v_session,v_customer,'REFRESH BALANCE','APPROVED',n::numeric/100);
END LOOP;END;$$;
SELECT public.trainer_operation_time_stats();`;
// Fixed disposable local container; no environment files or hosted URL accepted.
const result = spawnSync('docker', ['exec', '-i', 'supabase_db_simulador-dos-local', 'psql', '-At', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
  input: `BEGIN;\n${migration}\nSELECT public.trainer_operation_time_stats();\n${tests}\n${manySessions}\nROLLBACK;`, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(result.stderr || 'Local statistics gate failed.');
const documents = result.stdout.split(/\r?\n/).filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
const { summary, operations } = documents[1];
const { generatedAt, ...actual } = formatOperationTimeStats(summary);
assert.ok(generatedAt);
assert.ok(operations.length > 1503);
assert.deepEqual(actual, legacyOperationTimeStats(operations));
const large = formatOperationTimeStats(documents[2]);
assert.equal(large.overall.count, actual.overall.count + 1001);
assert.equal(large.perPerson.length, actual.perPerson.length + 1001);
assert.equal(large.perPerson.filter((row) => row.traineeName === 'Large directory fixture').length, 1001);
const empty = formatOperationTimeStats({ overall: { count: 0, totalSeconds: 0, minSeconds: null, maxSeconds: null }, allOperations: [], perPerson: [] });
assert.deepEqual(empty.overall, { count: 0, averageSeconds: 0, minSeconds: null, maxSeconds: null });
const rawBytes = Buffer.byteLength(JSON.stringify(operations));
const summaryBytes = Buffer.byteLength(JSON.stringify(summary));
assert.ok(summaryBytes < rawBytes / 5, 'Summary must substantially reduce the fixture transfer');
console.log(JSON.stringify({ gate: 'PostgreSQL statistics parity', records: operations.length, rawBytes, summaryBytes, reductionPercent: Number((100 * (1 - summaryBytes / rawBytes)).toFixed(2)), passed: true, rolledBack: true }));
