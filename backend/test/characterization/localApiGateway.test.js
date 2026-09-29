import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createHmac } from 'node:crypto';

import { createGateway, resolveUpstreamPath } from '../../../scripts/local-api-gateway.mjs';
import { buildApiKeys, buildPostgrestConfig, signJwt } from '../../../scripts/setup-local-api.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

function closeAll(...servers) {
  return Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
}

// Records what PostgREST would have received.
function createUpstream() {
  const seen = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      seen.push({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  return { server, seen };
}

async function request(port, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  const text = await response.text();
  return { status: response.status, text };
}

test('strips the /rest/v1 prefix PostgREST does not use', () => {
  assert.equal(resolveUpstreamPath('/rest/v1/hub_identities'), '/hub_identities');
  assert.equal(resolveUpstreamPath('/rest/v1/hub_identities?id=eq.1'), '/hub_identities?id=eq.1');
  assert.equal(resolveUpstreamPath('/rest/v1/'), '/');
  assert.equal(resolveUpstreamPath('/rest/v1'), '/');
});

test('refuses paths outside /rest/v1 instead of forwarding blindly', () => {
  assert.equal(resolveUpstreamPath('/hub_identities'), null);
  assert.equal(resolveUpstreamPath('/rest/v2/x'), null);
  assert.equal(resolveUpstreamPath('/rest/v1x/x'), null);
  assert.equal(resolveUpstreamPath('/'), null);
});

test('forwards a table read to PostgREST at the rewritten path', async () => {
  const upstream = createUpstream();
  const upstreamPort = await listen(upstream.server);
  const gateway = createGateway({ postgrestUrl: `http://127.0.0.1:${upstreamPort}` });
  const gatewayPort = await listen(gateway);

  const result = await request(gatewayPort, '/rest/v1/hub_identities?select=id');
  assert.equal(result.status, 200);
  assert.equal(upstream.seen[0].path, '/hub_identities?select=id');

  await closeAll(upstream.server, gateway);
});

test('forwards the schema and auth headers supabase-js relies on', async () => {
  const upstream = createUpstream();
  const upstreamPort = await listen(upstream.server);
  const gateway = createGateway({ postgrestUrl: `http://127.0.0.1:${upstreamPort}` });
  const gatewayPort = await listen(gateway);

  await request(gatewayPort, '/rest/v1/users', {
    headers: {
      'Accept-Profile': 'auth',
      apikey: 'test-key',
      Authorization: 'Bearer test-token',
    },
  });

  const seen = upstream.seen[0].headers;
  assert.equal(seen['accept-profile'], 'auth');
  assert.equal(seen.apikey, 'test-key');
  assert.equal(seen.authorization, 'Bearer test-token');

  await closeAll(upstream.server, gateway);
});

test('forwards a request body for writes', async () => {
  const upstream = createUpstream();
  const upstreamPort = await listen(upstream.server);
  const gateway = createGateway({ postgrestUrl: `http://127.0.0.1:${upstreamPort}` });
  const gatewayPort = await listen(gateway);

  await request(gatewayPort, '/rest/v1/hub_identities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Tuser' }),
  });

  assert.equal(upstream.seen[0].method, 'POST');
  assert.deepEqual(JSON.parse(upstream.seen[0].body), { username: 'Tuser' });

  await closeAll(upstream.server, gateway);
});

test('answers /auth/v1 with a clear 501 rather than a confusing proxy error', async () => {
  const upstream = createUpstream();
  const upstreamPort = await listen(upstream.server);
  const gateway = createGateway({ postgrestUrl: `http://127.0.0.1:${upstreamPort}` });
  const gatewayPort = await listen(gateway);

  const result = await request(gatewayPort, '/auth/v1/token', { method: 'POST' });
  assert.equal(result.status, 501);
  assert.match(result.text, /HUB_AUTH_MODE=local/);
  assert.equal(upstream.seen.length, 0);

  await closeAll(upstream.server, gateway);
});

test('reports 502 with the upstream origin when PostgREST is down', async () => {
  // Port 1 is reserved and never listening.
  const gateway = createGateway({ postgrestUrl: 'http://127.0.0.1:1' });
  const gatewayPort = await listen(gateway);

  const result = await request(gatewayPort, '/rest/v1/hub_identities');
  assert.equal(result.status, 502);
  assert.match(result.text, /unreachable/);

  await closeAll(gateway);
});

test('exposes a health endpoint that does not need PostgREST', async () => {
  const gateway = createGateway({ postgrestUrl: 'http://127.0.0.1:1' });
  const gatewayPort = await listen(gateway);

  const result = await request(gatewayPort, '/health');
  assert.equal(result.status, 200);
  assert.match(result.text, /"status":"ok"/);

  await closeAll(gateway);
});

test('generated keys are JWTs carrying the roles PostgREST switches on', () => {
  const secret = 'local-secret-for-tests-0123456789';
  const { anonKey, serviceRoleKey } = buildApiKeys(secret);

  for (const [token, role] of [[anonKey, 'anon'], [serviceRoleKey, 'service_role']]) {
    const [header, body, signature] = token.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
      alg: 'HS256',
      typ: 'JWT',
    });

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    assert.equal(payload.role, role);
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));

    const expected = createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    assert.equal(signature, expected);
  }
});

test('a key signed with another secret does not verify', () => {
  const token = signJwt({ role: 'service_role' }, 'secret-one-0123456789012345678901');
  const [header, body, signature] = token.split('.');
  const other = createHmac('sha256', 'secret-two-0123456789012345678901')
    .update(`${header}.${body}`)
    .digest('base64url');
  assert.notEqual(signature, other);
});

test('the PostgREST config exposes auth and defaults to the anon role', () => {
  const config = buildPostgrestConfig({
    databaseUrl: 'postgresql://postgres@127.0.0.1:5432/trez_local',
    port: 3000,
    jwtSecret: 'secret',
  });

  assert.match(config, /db-schemas = "public,auth"/);
  assert.match(config, /db-anon-role = "anon"/);
  assert.match(config, /server-host = "127\.0\.0\.1"/);
});
