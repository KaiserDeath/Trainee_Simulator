import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DISPOSABLE_DATABASE_URL_ENV,
  resolveDisposableDatabaseTarget,
} from '../../src/db/databaseSafety.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '../..');
const fixture = path.join(backendRoot, 'test/fixtures/prototypeSchema.sql');
const migration = path.join(
  backendRoot,
  'migrations/0001_separate_histories_wallets_and_reservations.sql',
);
const assertions = path.join(here, 'milestone0Assertions.sql');

function findPsql() {
  if (process.env.PSQL_PATH && existsSync(process.env.PSQL_PATH)) {
    return process.env.PSQL_PATH;
  }

  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(root)) {
      const versions = readdirSync(root).sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true }),
      );
      for (const version of versions) {
        const candidate = path.join(root, version, 'bin', 'psql.exe');
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return 'psql';
}

const rawUrl = process.env[DISPOSABLE_DATABASE_URL_ENV];
const safeTarget = resolveDisposableDatabaseTarget(process.env);
const parsed = new URL(rawUrl);
const psql = findPsql();

const connectionArgs = [
  '-X',
  '-w',
  '-v',
  'ON_ERROR_STOP=1',
  '-h',
  parsed.hostname,
  '-p',
  parsed.port || '5432',
  '-U',
  decodeURIComponent(parsed.username),
  '-d',
  decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
];

const childEnvironment = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(parsed.password),
};
delete childEnvironment[DISPOSABLE_DATABASE_URL_ENV];

function runPsql(args, { expectFailure = false } = {}) {
  const result = spawnSync(psql, [...connectionArgs, ...args], {
    cwd: backendRoot,
    env: childEnvironment,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;

  if (expectFailure) {
    if (result.status === 0) {
      throw new Error('Expected PostgreSQL command to fail safely.');
    }
    return `${result.stdout || ''}\n${result.stderr || ''}`;
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`PostgreSQL command failed with exit code ${result.status}.`);
  }

  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
}

console.log(`[database] verified disposable target ${safeTarget.identity}`);

runPsql(['-f', fixture]);
runPsql([
  '-c',
  `INSERT INTO sandbox_operations (
     id, session_id, customer_id, game_account_id, type, amount, status
   ) VALUES (
     '99999999-9999-4999-8999-999999999999',
     '11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333331',
     'ADD CREDITS', 10, 'PENDING'
   );`,
]);

const preconditionOutput = runPsql(['-f', migration], { expectFailure: true });
if (!/Close or discard active sandbox sessions/i.test(preconditionOutput)) {
  throw new Error('Migration failed for an unexpected reason during precondition test.');
}
console.log('[database] pending-operation migration guard passed');

runPsql(['-f', fixture]);
runPsql([
  '-c',
  `UPDATE trainee_sessions SET status = 'completed';
   INSERT INTO sandbox_operations (
     id, session_id, customer_id, game_account_id, type, amount, status
   ) VALUES
   (
     '99999999-9999-4999-8999-999999999991',
     '11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333331',
     'ADD CREDITS', 10, 'PENDING'
   ),
   (
     '99999999-9999-4999-8999-999999999992',
     '11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '33333333-3333-4333-8333-333333333332',
     'WITHDRAW CREDITS', 10, 'PENDING'
   );`,
]);
runPsql(['-f', migration]);
runPsql([
  '-c',
  `DO $$
   DECLARE
     v_count INTEGER;
     v_balance NUMERIC;
   BEGIN
     SELECT COUNT(*) INTO v_count
     FROM sandbox_operations
     WHERE status = 'PENDING'
       AND queue_policy_version = 0;
     IF v_count <> 2 THEN
       RAISE EXCEPTION 'Historical pending rows were rewritten';
     END IF;

     SELECT balance INTO v_balance
     FROM sandbox_customers
     WHERE id = '22222222-2222-4222-8222-222222222222';
     IF v_balance <> 1000 THEN
       RAISE EXCEPTION 'Historical Add Credits was incorrectly reserved';
     END IF;
   END;
   $$;`,
]);
console.log('[database] historical pending preservation passed');

runPsql(['-f', fixture]);
runPsql(['-f', migration]);
runPsql(['-f', assertions]);

console.log('[database] Milestone 0 PostgreSQL integration passed');
