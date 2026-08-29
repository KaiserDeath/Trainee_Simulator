import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { assertLocalE2EBackendEnvironment } from '../backend/src/config/localE2EGuard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
if (!existsSync(cli)) throw new Error('Run npm run setup first.');

const status = spawnSync(process.execPath, [cli, 'status', '-o', 'env'], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
});
if (status.error) throw status.error;
if (status.status !== 0) throw new Error('Run npm run local:start first.');

const values = new Map();
for (const line of (status.stdout || '').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values.set(match[1], value);
}

for (const key of ['ANON_KEY', 'API_URL', 'DB_URL', 'SERVICE_ROLE_KEY']) {
  if (!values.get(key)) throw new Error(`Local Supabase status did not provide ${key}.`);
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  TREZ_LOCAL_E2E: '1',
  TREZ_E2E_BACKEND_URL: 'http://localhost:8080',
  TREZ_E2E_FRONTEND_URL: 'http://localhost:5173',
  TREZ_E2E_DATABASE_URL: values.get('DB_URL'),
  SUPABASE_URL: values.get('API_URL'),
  SUPABASE_ANON_KEY: values.get('ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: values.get('SERVICE_ROLE_KEY'),
  HUB_PUBLIC_BACKEND_URL: 'http://localhost:8080',
  HUB_COOKIE_SECURE: '0',
  CLIENT_URL: 'http://localhost:5173',
  HOST: '127.0.0.1',
  PORT: '8080',
};
assertLocalE2EBackendEnvironment(env);

const result = spawnSync(
  process.execPath,
  [path.join(root, 'backend', 'test', 'integration', 'runHubAuthLocal.mjs')],
  { cwd: root, env, stdio: 'inherit', shell: false, windowsHide: true }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
