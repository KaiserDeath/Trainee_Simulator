import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const source = path.join(
  workspaceRoot,
  'backend',
  'migrations',
  '0001_separate_histories_wallets_and_reservations.sql'
);

const migrationsDirectory = path.join(
  workspaceRoot,
  'supabase',
  'migrations'
);

const destination = path.join(
  migrationsDirectory,
  '20260820001000_milestone0_generated.sql'
);

await mkdir(migrationsDirectory, { recursive: true });
await copyFile(source, destination);

console.log(
  'Prepared the local Supabase migration from the canonical backend migration.'
);
