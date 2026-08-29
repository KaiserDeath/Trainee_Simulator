import { createHash } from 'node:crypto';

export const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export function migrationChecksum(sql) {
  if (typeof sql !== 'string') {
    throw new TypeError('Migration SQL must be a string.');
  }

  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export function parseMigrationFile(file) {
  const match = MIGRATION_FILE_PATTERN.exec(file.name);
  if (!match) {
    throw new Error(
      `Invalid migration filename "${file.name}"; expected NNNN_description.sql.`,
    );
  }

  return {
    version: Number(match[1]),
    name: file.name,
    checksum: migrationChecksum(file.sql),
  };
}

export function planMigrations(files, ledgerRows) {
  const migrations = files.map(parseMigrationFile).sort((left, right) => {
    return left.version - right.version;
  });

  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}.`);
    }
    versions.add(migration.version);
  }

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index].version !== migrations[index - 1].version + 1) {
      throw new Error(
        `Migration sequence has a gap between ${migrations[index - 1].version} ` +
          `and ${migrations[index].version}.`,
      );
    }
  }

  const ledgerByVersion = new Map();
  for (const row of ledgerRows) {
    if (!Number.isInteger(row.version) || row.version < 0) {
      throw new Error('Ledger versions must be non-negative integers.');
    }
    if (ledgerByVersion.has(row.version)) {
      throw new Error(`Ledger contains duplicate version ${row.version}.`);
    }
    ledgerByVersion.set(row.version, row);
  }

  for (const [version, row] of ledgerByVersion) {
    const migration = migrations.find((item) => item.version === version);
    if (!migration) {
      throw new Error(`Applied migration ${version} is missing from the repository.`);
    }
    if (migration.name !== row.name) {
      throw new Error(`Applied migration ${version} was renamed.`);
    }
    if (migration.checksum !== row.checksum) {
      throw new Error(`Applied migration ${version} checksum does not match.`);
    }
  }

  return {
    applied: migrations.filter((item) => ledgerByVersion.has(item.version)),
    pending: migrations.filter((item) => !ledgerByVersion.has(item.version)),
  };
}

