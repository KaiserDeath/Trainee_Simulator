import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLocalE2EBackendEnvironment,
  shouldDisableRandomOperationGeneration
} from '../../src/config/localE2EGuard.js';

function localEnvironment(overrides = {}) {
  return {
    TREZ_LOCAL_E2E: '1',
    TREZ_E2E_DISABLE_RANDOM_OPERATIONS:
      '1',
    TREZ_E2E_BACKEND_URL:
      'http://127.0.0.1:8080',
    TREZ_E2E_FRONTEND_URL:
      'http://127.0.0.1:4173',
    TREZ_E2E_DATABASE_URL:
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    SUPABASE_URL:
      'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY:
      'local-test-only-key',
    CLIENT_URL:
      'http://127.0.0.1:4173',
    HOST: '127.0.0.1',
    PORT: '8080',
    ...overrides
  };
}

test('guard accepts a fully loopback local E2E environment', () => {
  const urls =
    assertLocalE2EBackendEnvironment(
      localEnvironment()
    );

  assert.equal(
    urls.database.hostname,
    '127.0.0.1'
  );
  assert.equal(
    shouldDisableRandomOperationGeneration(
      localEnvironment()
    ),
    true
  );
});

test('guard fails closed without explicit opt-in', () => {
  assert.throws(
    () =>
      assertLocalE2EBackendEnvironment(
        localEnvironment({
          TREZ_LOCAL_E2E: undefined
        })
      ),
    /opt-in/i
  );
});

for (const [name, value] of [
  [
    'TREZ_E2E_BACKEND_URL',
    'https://backend.example.com'
  ],
  [
    'TREZ_E2E_FRONTEND_URL',
    'https://frontend.example.com'
  ],
  [
    'TREZ_E2E_DATABASE_URL',
    'postgresql://user:secret@db.example.com/app'
  ],
  [
    'SUPABASE_URL',
    'https://project.supabase.co'
  ],
  [
    'CLIENT_URL',
    'https://frontend.example.com'
  ]
]) {
  test(`guard rejects non-loopback ${name}`, () => {
    assert.throws(
      () =>
        assertLocalE2EBackendEnvironment(
          localEnvironment({
            [name]: value
          })
        ),
      /localhost or 127\.0\.0\.1/i
    );
  });
}

test('random-generation flag cannot bypass the local E2E guard', () => {
  assert.throws(
    () =>
      shouldDisableRandomOperationGeneration(
        localEnvironment({
          SUPABASE_URL:
            'https://project.supabase.co'
        })
      ),
    /localhost or 127\.0\.0\.1/i
  );
});
