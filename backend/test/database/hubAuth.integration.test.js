// Drives a real Hub sign-in and authenticated reads against PostgreSQL, with no
// Supabase and no PostgREST running. This is the path that unit tests cannot
// cover: session cookies, CSRF, the local identity provider, and the nested
// role embed all have to work together.
//
// Set TREZ_PG_TEST_URL to a disposable database with the migrations applied.

import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const connectionString = process.env.TREZ_PG_TEST_URL;
const describe = connectionString ? test : test.skip;

const ORIGIN = 'http://localhost:5173';
const suffix = randomUUID().slice(0, 6);
const username = `Aadmin${suffix}`;
const password = 'AdminPassword123';
const email = `${username.toLowerCase()}@auth.trez.invalid`;
const authUserId = randomUUID();
const identityId = randomUUID();

let client = null;
let server = null;
let base = '';
let csrfToken = null;
const jar = new Map();

if (connectionString) {
  // The data layer and auth mode are chosen at import time.
  process.env.DATABASE_URL = connectionString;
  process.env.HUB_AUTH_MODE = 'local';
  process.env.HUB_LOCAL_AUTH_SECRET = 'hub-integration-secret-0123456789abc';
  process.env.CLIENT_URL = ORIGIN;
  process.env.HUB_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  process.env.SUPABASE_URL = 'http://127.0.0.1:8000';
  process.env.SUPABASE_ANON_KEY = 'unused-in-direct-mode';
  process.env.HUB_COOKIE_SECURE = '0';

  const config = await import('../../src/config/supabase.js');
  const { hashPassword } = await import('../../src/auth/localHubAuth.js');
  const { createApp } = await import('../../src/app.js');

  client = config.supabase;
  assert.equal(config.usingDirectPostgres, true, 'the suite must run against PostgreSQL directly');

  await client.schema('auth').from('users').insert({
    id: authUserId,
    email,
    encrypted_password: await hashPassword(password),
    raw_user_meta_data: JSON.stringify({ display_name: 'Integration Admin' }),
  });

  await client.from('hub_identities').insert({
    id: identityId,
    auth_user_id: authUserId,
    external_subject_reference: authUserId,
    email,
    username,
    first_name: 'Integration',
    surname: 'Admin',
    display_name: 'Integration Admin',
    status: 'active',
  });

  const roles = await client.from('hub_roles').select('id, code');
  await client.from('hub_role_assignments').insert({
    identity_id: identityId,
    role_id: roles.data.find((row) => row.code === 'admin').id,
  });

  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
}

async function call(path, options = {}) {
  const headers = { Origin: ORIGIN, ...(options.headers || {}) };
  if (jar.size > 0) {
    headers.Cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  const response = await fetch(base + path, { ...options, headers });
  storeCookies(response);
  return { status: response.status, text: await response.text() };
}

test.after(async () => {
  if (!client) return;
  if (server) server.close();
  await client.from('hub_role_assignments').delete().eq('identity_id', identityId);
  await client.from('hub_identities').delete().eq('id', identityId);
  await client.schema('auth').from('users').delete().eq('id', authUserId);
  await client.end();
});

describe('issues a CSRF token before sign-in', async () => {
  const result = await call('/api/hub/auth/csrf');
  assert.equal(result.status, 200, result.text);

  csrfToken = JSON.parse(result.text).csrfToken;
  assert.ok(csrfToken, 'a CSRF token is required to sign in');
});

describe('signs in with the local identity provider', async () => {
  const result = await call('/api/hub/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trez-Csrf': csrfToken },
    body: JSON.stringify({ username, password }),
  });

  assert.equal(result.status, 200, result.text);
  assert.ok(jar.has('trez_hub_access'), 'an access cookie must be set');
  assert.ok(jar.has('trez_hub_refresh'), 'a refresh cookie must be set');
});

describe('reports the signed-in identity and its role', async () => {
  const result = await call('/api/hub/context');
  assert.equal(result.status, 200, result.text);

  const parsed = JSON.parse(result.text);
  assert.equal(parsed.subject.username, username);
  assert.deepEqual(parsed.subject.roles, ['ADMIN']);
});

describe('resolves the nested role embed through a real route', async () => {
  // hub_identities -> hub_role_assignments -> hub_roles, compiled to nested
  // JSON subqueries by the pg adapter.
  const result = await call('/api/hub/admin/accounts');
  assert.equal(result.status, 200, result.text);

  const parsed = JSON.parse(result.text);
  const accounts = Array.isArray(parsed) ? parsed : parsed.accounts || [];
  const account = accounts.find((row) => row.username === username);

  assert.ok(account, 'the provisioned admin must appear in the directory');
  assert.deepEqual(account.roles, ['ADMIN'], 'roles come from the nested embed');
  assert.equal(account.displayName, 'Integration Admin');
});

describe('rejects a wrong password without revealing the account', async () => {
  const session = new Map(jar);
  jar.clear();

  const csrf = await call('/api/hub/auth/csrf');
  const result = await call('/api/hub/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Trez-Csrf': JSON.parse(csrf.text).csrfToken,
    },
    body: JSON.stringify({ username, password: 'WrongPassword999' }),
  });

  assert.equal(result.status, 401, result.text);
  assert.match(result.text, /HUB_LOGIN_FAILED/);

  jar.clear();
  for (const [name, value] of session) jar.set(name, value);
});

describe('rejects an unauthenticated read', async () => {
  const session = new Map(jar);
  jar.clear();

  const result = await call('/api/hub/context');
  assert.equal(result.status, 401, result.text);

  for (const [name, value] of session) jar.set(name, value);
});

describe('rejects a request from a foreign origin', async () => {
  const result = await call('/api/hub/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Trez-Csrf': csrfToken,
      Origin: 'https://attacker.example',
    },
    body: JSON.stringify({ username, password }),
  });

  assert.notEqual(result.status, 200, 'a foreign origin must not be able to sign in');
});

describe('signs out and clears the session', async () => {
  const csrf = await call('/api/hub/auth/csrf');
  const result = await call('/api/hub/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Trez-Csrf': JSON.parse(csrf.text).csrfToken,
    },
  });

  // Logout answers 204 No Content.
  assert.ok(result.status === 200 || result.status === 204, `unexpected ${result.status}`);

  const after = await call('/api/hub/context');
  assert.equal(after.status, 401, 'the session must not survive logout');
});
