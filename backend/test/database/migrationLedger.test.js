import assert from 'node:assert/strict';
import test from 'node:test';

import {
  migrationChecksum,
  parseMigrationFile,
  planMigrations,
} from '../../src/db/migrationLedger.js';

const first = { name: '0001_create_example.sql', sql: 'SELECT 1;\n' };
const second = { name: '0002_add_example_index.sql', sql: 'SELECT 2;\n' };

test('accepts numbered migration filenames and computes a stable checksum', () => {
  assert.deepEqual(parseMigrationFile(first), {
    version: 1,
    name: first.name,
    checksum: migrationChecksum(first.sql),
  });
  assert.equal(migrationChecksum(first.sql), migrationChecksum(first.sql));
});

test('rejects ad-hoc filenames instead of treating prototype SQL as a ledger', () => {
  assert.throws(
    () => parseMigrationFile({ name: 'migrations.sql', sql: 'SELECT 1;' }),
    /Invalid migration filename/,
  );
});

test('plans only unapplied immutable migrations', () => {
  const plan = planMigrations([second, first], [
    {
      version: 1,
      name: first.name,
      checksum: migrationChecksum(first.sql),
    },
  ]);

  assert.deepEqual(plan.applied.map((item) => item.name), [first.name]);
  assert.deepEqual(plan.pending.map((item) => item.name), [second.name]);
});

test('rejects changed or renamed applied migrations', () => {
  assert.throws(
    () =>
      planMigrations([first], [
        { version: 1, name: first.name, checksum: migrationChecksum('changed') },
      ]),
    /checksum does not match/,
  );

  assert.throws(
    () =>
      planMigrations([first], [
        {
          version: 1,
          name: '0001_renamed.sql',
          checksum: migrationChecksum(first.sql),
        },
      ]),
    /was renamed/,
  );
});

test('rejects duplicate and non-contiguous migration versions', () => {
  assert.throws(
    () =>
      planMigrations(
        [first, { name: '0001_other.sql', sql: 'SELECT 2;' }],
        [],
      ),
    /Duplicate migration version/,
  );

  assert.throws(
    () =>
      planMigrations(
        [first, { name: '0003_skip.sql', sql: 'SELECT 3;' }],
        [],
      ),
    /Migration sequence has a gap/,
  );
});

