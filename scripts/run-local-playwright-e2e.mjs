import {
  spawnSync
} from 'node:child_process';
import {
  existsSync
} from 'node:fs';
import {
  fileURLToPath
} from 'node:url';
import path from 'node:path';

import {
  assertLocalE2EBackendEnvironment
} from '../backend/src/config/localE2EGuard.js';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const frontendRoot = path.join(
  workspaceRoot,
  'frontend'
);

if (process.env.TREZ_LOCAL_E2E !== '1') {
  throw new Error(
    'Local Playwright E2E is opt-in. Set TREZ_LOCAL_E2E=1 before running this command.'
  );
}

function parseEnvironmentOutput(output) {
  const values = new Map();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /^([A-Z][A-Z0-9_]*)=(.*)$/
    );

    if (!match) {
      continue;
    }

    let value = match[2].trim();
    if (
      value.length >= 2 &&
      (
        (value.startsWith('"') &&
          value.endsWith('"')) ||
        (value.startsWith("'") &&
          value.endsWith("'"))
      )
    ) {
      value = value.slice(1, -1);
    }

    values.set(match[1], value);
  }

  return values;
}

const supabaseCli = path.join(
  workspaceRoot,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js'
);

if (!existsSync(supabaseCli)) {
  throw new Error(
    'The pinned Supabase CLI is not installed. Run npm run setup first.'
  );
}

const statusResult = spawnSync(
  process.execPath,
  [supabaseCli, 'status', '-o', 'env'],
  {
    cwd: workspaceRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  }
);

if (statusResult.error) {
  throw statusResult.error;
}

if (statusResult.status !== 0) {
  throw new Error(
    'The isolated local Supabase stack is not running. Run npm run local:start first.'
  );
}

const localValues = parseEnvironmentOutput(
  statusResult.stdout || ''
);

for (const name of [
  'API_URL',
  'DB_URL',
  'SERVICE_ROLE_KEY'
]) {
  if (!localValues.get(name)) {
    throw new Error(
      `Local Supabase status did not provide ${name}.`
    );
  }
}

const backendUrl =
  process.env.TREZ_E2E_BACKEND_URL ||
  'http://127.0.0.1:8080';
const frontendUrl =
  process.env.TREZ_E2E_FRONTEND_URL ||
  'http://127.0.0.1:4173';

const childEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TREZ_LOCAL_E2E: '1',
  TREZ_E2E_DISABLE_RANDOM_OPERATIONS:
    '1',
  TREZ_E2E_BACKEND_URL: backendUrl,
  TREZ_E2E_FRONTEND_URL: frontendUrl,
  TREZ_E2E_DATABASE_URL:
    localValues.get('DB_URL'),
  SUPABASE_URL:
    localValues.get('API_URL'),
  SUPABASE_SERVICE_ROLE_KEY:
    localValues.get('SERVICE_ROLE_KEY'),
  CLIENT_URL: frontendUrl,
  VITE_API_URL: backendUrl,
  HOST: '127.0.0.1',
  PORT: '8080'
};

assertLocalE2EBackendEnvironment(
  childEnvironment
);

const playwrightCli = path.join(
  frontendRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js'
);

if (!existsSync(playwrightCli)) {
  throw new Error(
    'Playwright is not installed. Run npm run setup first.'
  );
}

const testResult = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    '--config',
    'browser/playwright.local.config.js'
  ],
  {
    cwd: frontendRoot,
    env: childEnvironment,
    stdio: 'inherit',
    shell: false,
    windowsHide: true
  }
);

if (testResult.error) {
  throw testResult.error;
}

process.exitCode =
  testResult.status ?? 1;
