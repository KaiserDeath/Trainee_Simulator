import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Fixed local container; never accept hosted URLs or read credential env files.
const container = 'supabase_db_simulador-dos-local';
const migration = readFileSync(new URL('../supabase/migrations/20261103190000_simulation_worker_next_wake.sql', import.meta.url), 'utf8').replace('CREATE FUNCTION public.hub_prepare_simulation_poll()', 'CREATE OR REPLACE FUNCTION public.hub_prepare_simulation_poll()');
const tests = readFileSync(new URL('../backend/test/integration/simulationWorkerScheduling.sql', import.meta.url), 'utf8');
// Also exercise a fresh main schema without the newer optional assessment helpers.
const hideOptionalHelpers = `DO $$ BEGIN
IF to_regprocedure('public.hub_process_worker_deadlines()') IS NOT NULL THEN
  ALTER FUNCTION public.hub_process_worker_deadlines() RENAME TO worker_fixture_deadlines_hidden;
END IF;
IF to_regprocedure('public.hub_next_worker_event()') IS NOT NULL THEN
  ALTER FUNCTION public.hub_next_worker_event() RENAME TO worker_fixture_next_event_hidden;
END IF;
END; $$;`;
const input = `BEGIN;\n${migration}\nSAVEPOINT fixture;\n${tests}\nROLLBACK TO fixture;\n${hideOptionalHelpers}\n${tests}\nROLLBACK;`;
const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || 'Local worker scheduling verification failed.');
  process.exit(1);
}
console.log('Local worker scheduling passed: due time, lease expiry/recovery, inactive/dead exclusion and service-role-only access. Transaction rolled back.');
