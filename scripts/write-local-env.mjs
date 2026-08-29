import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const output = execSync(
  'npx supabase status -o env',
  {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

const values = new Map();

for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (match) {
    values.set(match[1], match[2]);
  }
}

const apiUrl = values.get('API_URL');
const anonKey = values.get('ANON_KEY');
const serviceRoleKey = values.get('SERVICE_ROLE_KEY');

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'Local Supabase is not running or did not return its local API credentials.'
  );
}

const backendEnv = [
  '# Generated for the local Supabase stack. Do not commit.',
  `SUPABASE_URL=${apiUrl}`,
  `SUPABASE_ANON_KEY=${anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
  'HUB_PUBLIC_BACKEND_URL=http://localhost:8080',
  'HUB_COOKIE_SECURE=0',
  'PORT=8080',
  'HOST=127.0.0.1',
  'CLIENT_URL=http://localhost:5173',
  ''
].join('\n');

const frontendEnv = [
  '# Generated for local development. Do not commit.',
  'VITE_API_URL=http://localhost:8080',
  'VITE_TREZ_HUB_ENABLED=true',
  ''
].join('\n');

await Promise.all([
  writeFile(
    path.join(workspaceRoot, 'backend', '.env.local'),
    backendEnv,
    { mode: 0o600 }
  ),
  writeFile(
    path.join(workspaceRoot, 'frontend', '.env.local'),
    frontendEnv,
    { mode: 0o600 }
  )
]);

console.log(
  'Wrote ignored local environment files for the backend and frontend.'
);
