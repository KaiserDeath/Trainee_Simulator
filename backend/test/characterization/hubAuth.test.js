import assert from 'node:assert/strict';
import test from 'node:test';

import { getHubAuthConfig } from '../../src/config/hubAuthConfig.js';
import { createHubCsrfProtection } from '../../src/auth/hubCsrf.js';
import { buildHubUsername, createHubAccountService } from '../../src/auth/hubAccountService.js';
import { createSupabaseHubIdentityVerifier } from '../../src/identity/supabaseHubIdentityVerifier.js';

const localEnvironment = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'local-anon-key',
  HUB_PUBLIC_BACKEND_URL: 'http://localhost:8080',
  CLIENT_URL: 'http://localhost:5173',
};

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    append(name, value) {
      const values = headers.get(name) || [];
      values.push(value);
      headers.set(name, values);
    },
    set(name, value) { headers.set(name, value); },
  };
}

function chainResult(result) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return chain;
}

test('Hub auth configuration uses explicit local origins and rejects insecure production origins', () => {
  const local = getHubAuthConfig(localEnvironment);
  assert.equal(local.configured, true);
  assert.equal(local.publicBackendOrigin, 'http://localhost:8080');
  assert.equal(local.secureCookies, false);
  assert.equal(getHubAuthConfig({}).configured, false);
  assert.throws(
    () => getHubAuthConfig({ ...localEnvironment, NODE_ENV: 'production' }),
    /non-local HTTPS/
  );
});

test('cookie-authenticated mutations require the exact frontend origin and double-submit token', () => {
  const config = getHubAuthConfig(localEnvironment);
  const csrf = createHubCsrfProtection(config);
  const response = responseRecorder();
  const token = csrf.issue({}, response);
  const setCookie = response.headers.get('Set-Cookie').join('; ');
  assert.match(setCookie, /trez_hub_csrf=/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /HttpOnly/);

  const validRequest = {
    method: 'POST',
    headers: { cookie: `trez_hub_csrf=${token}` },
    get(name) {
      return name === 'origin' ? config.clientOrigin : name === 'x-trez-csrf' ? token : undefined;
    },
  };
  let validNext;
  csrf.middleware(validRequest, response, (error) => { validNext = error || 'next'; });
  assert.equal(validNext, 'next');

  const invalidOrigin = { ...validRequest, get: (name) => name === 'origin' ? 'https://attacker.invalid' : token };
  let rejected;
  csrf.middleware(invalidOrigin, response, (error) => { rejected = error; });
  assert.equal(rejected.code, 'HUB_CSRF_REJECTED');
});

test('Supabase verifier derives active roles from the server directory, not request claims', async () => {
  const authClient = {
    auth: {
      async getUser(token) {
        assert.equal(token, 'verified-access');
        return { data: { user: { id: 'auth-user-id' } }, error: null };
      },
      async refreshSession() { throw new Error('not used'); },
    },
  };
  let table;
  const serviceClient = {
    from(name) {
      table = name;
      if (name === 'hub_identities') {
        return chainResult({
          data: {
            id: 'hub-identity-id',
            external_subject_reference: 'auth-user-id',
            username: 'Jperez',
            display_name: 'Invited User',
            preferred_locale: 'en',
            status: 'active',
          },
          error: null,
        });
      }
      assert.equal(name, 'hub_role_assignments');
      return chainResult({ data: [{ hub_roles: { code: 'postulante' } }], error: null });
    },
  };
  const verifier = createSupabaseHubIdentityVerifier({
    authClientFactory: () => authClient,
    serviceClient,
    config: getHubAuthConfig(localEnvironment),
  });
  const identity = await verifier.verify({
    headers: { cookie: 'trez_hub_access=verified-access' },
    get(name) { return name === 'x-browser-role' ? 'admin' : undefined; },
  }, responseRecorder());
  assert.equal(table, 'hub_role_assignments');
  assert.deepEqual(identity.roles, ['POSTULANTE']);
  assert.equal(identity.username, 'Jperez');
  assert.equal(identity.subjectId, 'auth-user-id');
  assert.equal(identity.hubIdentityId, 'hub-identity-id');
});

test('Jperez usernames normalize accents and allocate deterministic suffixes', () => {
  assert.equal(buildHubUsername('Juan', 'Pérez'), 'Jperez');
  assert.equal(buildHubUsername('Juan', 'Pérez', 2), 'Jperez2');
});

test('RRHH account creation rejects every additional role before contacting Supabase Auth', async () => {
  let authCalls = 0;
  const service = createHubAccountService({
    authClientFactory() {
      authCalls += 1;
      throw new Error('must not be called');
    },
    serviceClient: {},
    authConfig: getHubAuthConfig(localEnvironment),
    csrfProtection: {},
  });

  await assert.rejects(
    () => service.createAccount({
      firstName: 'Rosa',
      surname: 'Ramos',
      roles: ['rrhh', 'admin'],
      preferredLocale: 'en',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'HUB_VALIDATION_ERROR');
      assert.match(error.message, /read-only.*exclusively/i);
      return true;
    }
  );
  assert.equal(authCalls, 0);
});

test('Postulante account creation rejects Spanish before contacting Supabase Auth', async () => {
  let authCalls = 0;
  const service = createHubAccountService({
    authClientFactory() {
      authCalls += 1;
      throw new Error('must not be called');
    },
    serviceClient: {},
    authConfig: getHubAuthConfig(localEnvironment),
    csrfProtection: {},
  });

  await assert.rejects(
    () => service.createAccount({
      firstName: 'Paola',
      surname: 'Torres',
      roles: ['postulante'],
      preferredLocale: 'es',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'HUB_VALIDATION_ERROR');
      assert.match(error.message, /must use English/i);
      return true;
    }
  );
  assert.equal(authCalls, 0);
});

test('POSTULANTE account creation rejects every additional role before contacting Supabase Auth', async () => {
  const service = createHubAccountService({
    authClientFactory() { throw new Error('must not be called'); },
    serviceClient: {},
    authConfig: getHubAuthConfig(localEnvironment),
    csrfProtection: {},
  });

  await assert.rejects(
    () => service.createAccount({
      firstName: 'Pedro',
      surname: 'Lopez',
      roles: ['postulante', 'admin'],
      preferredLocale: 'en',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'HUB_VALIDATION_ERROR');
      assert.match(error.message, /POSTULANTE.*exclusively/i);
      return true;
    }
  );
});
