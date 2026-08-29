import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeDatabaseTarget,
  disposableTargetConfirmation,
  resolveDisposableDatabaseTarget,
} from '../../src/db/databaseSafety.js';

const DISPOSABLE_URL = 'postgresql://runner:secret@127.0.0.1:55432/trez_hub_test';

function disposableEnvironment(overrides = {}) {
  const target = describeDatabaseTarget(DISPOSABLE_URL);
  return {
    TREZ_DISPOSABLE_DATABASE_URL: DISPOSABLE_URL,
    TREZ_DISPOSABLE_DATABASE_CONFIRMATION:
      disposableTargetConfirmation(target),
    ...overrides,
  };
}

test('requires an explicit disposable target and never falls back to DATABASE_URL', () => {
  assert.throws(
    () => resolveDisposableDatabaseTarget({ DATABASE_URL: DISPOSABLE_URL }),
    /TREZ_DISPOSABLE_DATABASE_URL must be set explicitly/,
  );
});

test('requires an acknowledgement bound to the exact host, port, and database', () => {
  assert.throws(
    () =>
      resolveDisposableDatabaseTarget(
        disposableEnvironment({
          TREZ_DISPOSABLE_DATABASE_CONFIRMATION: 'DISPOSABLE_TEST_DATABASE:wrong',
        }),
      ),
    /must exactly equal/,
  );
});

test('rejects a disposable target that matches an application database target', () => {
  assert.throws(
    () =>
      resolveDisposableDatabaseTarget(
        disposableEnvironment({ DATABASE_URL: DISPOSABLE_URL }),
      ),
    /protected DATABASE_URL target/,
  );
});

test('allows a separately named disposable target beside a protected shared database', () => {
  assert.equal(
    resolveDisposableDatabaseTarget(
      disposableEnvironment({
        DATABASE_URL: 'postgresql://app:secret@db.example.test:5432/postgres',
      }),
    ).databaseName,
    'trez_hub_test',
  );
});

test('rejects shared PostgreSQL database names', () => {
  assert.throws(
    () =>
      describeDatabaseTarget(
        'postgresql://runner:secret@127.0.0.1:55432/postgres',
      ),
    /shared PostgreSQL database/,
  );
});

test('returns a redacted target description after all checks pass', () => {
  assert.deepEqual(resolveDisposableDatabaseTarget(disposableEnvironment()), {
    databaseName: 'trez_hub_test',
    hostname: '127.0.0.1',
    port: '55432',
    identity: '127.0.0.1:55432/trez_hub_test',
  });
});
