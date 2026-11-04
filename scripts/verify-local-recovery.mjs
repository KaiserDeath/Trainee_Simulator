import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {hubIntegrationCases,readHubIntegrationCase} from './hub-integration-cases.mjs';

// No environment files, credentials, database arguments or remote targets accepted.
const container = 'supabase_db_simulador-dos-local';
const token = randomUUID().replaceAll('-', '');
const restoredDatabase = `trez_restore_${token}`;
const payloadDatabase = `trez_restore_payload_${token}`;
const archive = `/tmp/${restoredDatabase}.dump`;
const output = new URL('../outputs/hub-recovery-local.json', import.meta.url);
const startedAt = performance.now();
const report = { target: 'named isolated local Supabase container; disposable restore database', generatedAt: new Date().toISOString(), checks: [] };
let created = false;
let payloadCreated = false;

function docker(args, input) {
  const result = spawnSync('docker', args, {
    input, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    // Do not print dump contents, stored user data or credentials on failure.
    const diagnostic = (result.stderr || '').split('\n').filter(line => /ERROR:|FATAL:/.test(line)).map(line => line.replace(/DETAIL:.*/, '')).slice(0, 3).join('\n');
    throw new Error(`Local ${args[args.indexOf(container) + 1] || 'Docker'} command failed (${result.status}): ${diagnostic}`);
  }
  return result.stdout;
}

function sql(database, input) {
  assert.ok(['postgres', restoredDatabase, payloadDatabase].includes(database));
  return docker(['exec', '-i', container, 'psql', '-XAtq', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], input);
}

// Hash all public table contents plus Auth users and Storage metadata without
// exporting their rows to the host. Compare schema/security definitions too.
function manifest(database) {
  return JSON.parse(sql(database, `
CREATE TEMP TABLE recovery_rows(name TEXT PRIMARY KEY, rows BIGINT, digest TEXT);
DO $$ DECLARE item RECORD; n BIGINT; h TEXT; BEGIN
  FOR item IN SELECT n.nspname AS schema_name,c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND (n.nspname='public' OR
      (n.nspname='auth' AND c.relname='users') OR
      (n.nspname='storage' AND c.relname IN('buckets','objects')))
  LOOP
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(body,E''\\n'' ORDER BY body),'''')) FROM (SELECT to_jsonb(t)::text AS body FROM %I.%I t) s',item.schema_name,item.table_name) INTO n,h;
    INSERT INTO recovery_rows VALUES(item.schema_name||'.'||item.table_name,n,h);
  END LOOP;
END $$;
SELECT jsonb_build_object(
  'tables',(SELECT jsonb_agg(to_jsonb(r) ORDER BY name) FROM recovery_rows r),
  'security',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'owner',pg_get_userbyid(c.relowner)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','v')),
  'views',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid,TRUE),'options',c.reloptions) ORDER BY c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname),'[]') FROM pg_policies p WHERE schemaname IN('public','storage')),
  'functions',(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||pg_get_userbyid(p.proowner),E'\\n' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
  'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'),
  'sequences',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY schemaname,sequencename),'[]') FROM pg_sequences s WHERE schemaname IN('public','auth','storage'))
);`));
}

try {
  assert.equal(docker(['inspect', '--format', '{{.State.Running}}', container]).trim(), 'true');
  const before = manifest('postgres');
  assert.ok(before.tables.some(table => table.name === 'public.hub_scored_evaluations' && table.rows === 4), 'Expected the seeded local Hub catalog');
  docker(['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', '--file', archive]);
  report.checks.push('Created a real PostgreSQL custom-format database backup inside the local container');
  // Creating a new database refuses an existing name; cleanup never targets postgres.
  docker(['exec', container, 'createdb', '-U', 'postgres', '--template=template0', restoredDatabase]);
  created = true;
  docker(['exec', container, 'pg_restore', '-U', 'supabase_admin', '--dbname', restoredDatabase, '--exit-on-error', archive]);
  const recovered = manifest(restoredDatabase);
  assert.deepEqual(recovered, before, 'Restored records, schema or access restrictions differ from the backup source');
  assert.deepEqual(manifest('postgres'), before, 'Source changed during rehearsal; rerun with other local writers stopped');
  report.tableCount = before.tables.length;
  report.checks.push('All public table hashes/counts, Auth users, Storage metadata, views, functions, triggers, constraints, indexes, sequences, RLS and table/view/function privileges match');
  // Exercise recovered functions and their authorization/immutable-evidence rules.
  for (const file of hubIntegrationCases) {
    sql(restoredDatabase, readHubIntegrationCase(file));
  }
  assert.deepEqual(manifest(restoredDatabase), before, 'Transactional recovery fixtures left changes behind');
  report.checks.push('Recovered database passed all ten transactional Hub workspace/evaluation/cohort/retention scenarios; fixtures rolled back');

  // A clean developer stack may have no learner history. Build real retained
  // records only in the restored copy, then prove a second backup recovers them.
  for (const file of ['hubEvaluationRuntime.sql', 'hubWorkspace.sql']) {
    const fixture = readFileSync(new URL(`../backend/test/integration/${file}`, import.meta.url), 'utf8');
    assert.match(fixture, /ROLLBACK;\s*$/);
    sql(restoredDatabase, fixture.replace(/ROLLBACK;\s*$/, 'COMMIT;'));
  }
  sql(restoredDatabase, `INSERT INTO auth.users(id,email,encrypted_password,aud,role,created_at,updated_at)
    VALUES('${randomUUID()}','restore-fixture@auth.trez.invalid',extensions.crypt('disposable-restore-fixture',extensions.gen_salt('bf')),'authenticated','authenticated',now(),now());`);
  const retained = manifest(restoredDatabase);
  for (const name of ['public.hub_scored_evaluation_attempts', 'public.hub_coaching_note_revisions', 'public.hub_activity_attempts', 'auth.users']) {
    assert.ok(retained.tables.find(table => table.name === name)?.rows > 0, `Missing retained fixture: ${name}`);
  }
  docker(['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', restoredDatabase, '--format=custom', '--file', archive]);
  docker(['exec', container, 'createdb', '-U', 'postgres', '--template=template0', payloadDatabase]);
  payloadCreated = true;
  docker(['exec', container, 'pg_restore', '-U', 'supabase_admin', '--dbname', payloadDatabase, '--exit-on-error', archive]);
  assert.deepEqual(manifest(payloadDatabase), retained, 'Retained attempt/coaching/lesson/Auth payload did not survive recovery');
  sql(payloadDatabase, `DO $$ BEGIN
    IF has_table_privilege('authenticated','public.hub_coaching_notes','SELECT') OR
       has_function_privilege('anon','public.hub_save_coaching_note(text,uuid,uuid,uuid,integer,text,text,uuid,text)','EXECUTE') THEN
      RAISE EXCEPTION 'Recovered private coaching permissions are unsafe';
    END IF;
    BEGIN
      UPDATE public.hub_activity_attempts SET definition_snapshot='{}' WHERE definition_snapshot IS NOT NULL;
      RAISE EXCEPTION 'Recovered snapshots unexpectedly editable';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'HUB_SNAPSHOT_IMMUTABLE' THEN RAISE; END IF; END;
  END $$;`);
  assert.deepEqual(manifest(payloadDatabase), retained, 'Recovered immutable snapshot guard changed data');
  assert.deepEqual(manifest('postgres'), before, 'Rehearsal modified the source database');
  report.checks.push('Second backup/restore preserved nonempty formal results/evidence, coaching revisions, lesson snapshots and an Auth credential record; privacy and snapshot immutability still hold');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  const cleanupFailures = [];
  for (const [database, exists, pattern] of [
    [payloadDatabase, payloadCreated, /^trez_restore_payload_[a-f0-9]{32}$/],
    [restoredDatabase, created, /^trez_restore_[a-f0-9]{32}$/],
  ]) {
    try {
      assert.match(database, pattern);
      if (exists) docker(['exec', container, 'dropdb', '-U', 'postgres', database]);
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_database WHERE datname='${database}';`).trim(), '0');
    } catch (error) { cleanupFailures.push(error.message); }
  }
  try { docker(['exec', container, 'rm', '-f', '--', archive]); }
  catch (error) { cleanupFailures.push(error.message); }
  report.cleanupPassed = cleanupFailures.length === 0;
  if (!report.cleanupPassed) { report.cleanupFailures = cleanupFailures; process.exitCode = 1; }
  report.elapsedSeconds = Math.round((performance.now() - startedAt) / 100) / 10;
  mkdirSync(new URL('../outputs/', import.meta.url), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
