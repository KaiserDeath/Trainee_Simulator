import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { assertLocalE2EBackendEnvironment } from '../backend/src/config/localE2EGuard.js';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseCli = path.join(workspaceRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');

if (!existsSync(supabaseCli)) {
  throw new Error('The pinned Supabase CLI is not installed. Run npm run setup first.');
}

function parseEnvironment(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

const status = spawnSync(process.execPath, [supabaseCli, 'status', '-o', 'env'], {
  cwd: workspaceRoot,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
});

if (status.error) throw status.error;
if (status.status !== 0) {
  throw new Error('The isolated local Supabase stack is not running. Run npm run local:start first.');
}

const local = parseEnvironment(status.stdout || '');
for (const name of ['ANON_KEY', 'API_URL', 'DB_URL', 'JWT_SECRET', 'SERVICE_ROLE_KEY']) {
  if (!local.get(name)) throw new Error(`Local Supabase status did not provide ${name}.`);
}

const childEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TREZ_LOCAL_E2E: '1',
  TREZ_E2E_BACKEND_URL: 'http://127.0.0.1:8080',
  TREZ_E2E_FRONTEND_URL: 'http://127.0.0.1:4173',
  TREZ_E2E_DATABASE_URL: local.get('DB_URL'),
  SUPABASE_URL: local.get('API_URL'),
  SUPABASE_ANON_KEY: local.get('ANON_KEY'),
  SUPABASE_LOCAL_JWT_SECRET: local.get('JWT_SECRET'),
  SUPABASE_SERVICE_ROLE_KEY: local.get('SERVICE_ROLE_KEY'),
  CLIENT_URL: 'http://127.0.0.1:4173',
  HOST: '127.0.0.1',
};

assertLocalE2EBackendEnvironment(childEnvironment);

const result = spawnSync(
  process.execPath,
  [path.join(workspaceRoot, 'backend', 'test', 'integration', 'runHubLocal.mjs')],
  {
    cwd: workspaceRoot,
    env: childEnvironment,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
