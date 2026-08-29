import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReadOnlyInventory,
  READ_ONLY_SCHEMA_INVENTORY,
} from '../../src/db/schemaInventory.js';

test('the schema inventory contains only named, read-only SELECT statements', () => {
  assert.equal(
    assertReadOnlyInventory(READ_ONLY_SCHEMA_INVENTORY),
    READ_ONLY_SCHEMA_INVENTORY,
  );
  assert.deepEqual(
    READ_ONLY_SCHEMA_INVENTORY.map((query) => query.name),
    [
      'server_identity',
      'tables',
      'columns',
      'constraints',
      'indexes',
      'row_level_security',
    ],
  );
});

test('rejects mutating or multi-statement inventory queries', () => {
  assert.throws(
    () =>
      assertReadOnlyInventory([
        { name: 'unsafe', sql: 'DELETE FROM example RETURNING id' },
      ]),
    /must begin with SELECT/,
  );

  assert.throws(
    () =>
      assertReadOnlyInventory([
        { name: 'unsafe', sql: 'SELECT 1; DROP TABLE example' },
      ]),
    /not read-only/,
  );
});

test('rejects duplicate query names so inventory evidence is unambiguous', () => {
  assert.throws(
    () =>
      assertReadOnlyInventory([
        { name: 'tables', sql: 'SELECT 1' },
        { name: 'tables', sql: 'SELECT 2' },
      ]),
    /Duplicate inventory query name/,
  );
});

