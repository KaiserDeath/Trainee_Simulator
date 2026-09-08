import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';
import cors from 'cors';

import {
  createCorsOptions,
  sendApiError,
  setApiSecurityHeaders,
} from '../../src/security/httpSecurity.js';

async function withApi(environment, callback) {
  const app = express();
  app.use(cors(createCorsOptions(environment)));
  app.use(setApiSecurityHeaders);
  app.use(express.json({ limit: '64kb' }));
  app.post('/echo', (request, response) => response.json(request.body));
  app.use(sendApiError);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('API accepts the configured browser origin and returns defensive headers', async () => {
  await withApi(
    { NODE_ENV: 'development', CLIENT_URL: 'https://preview.example.test' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: {
          Origin: 'https://preview.example.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accepted: true }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://preview.example.test');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
      assert.deepEqual(await response.json(), { accepted: true });
    }
  );
});

test('API rejects a browser origin that is not explicitly allowed', async () => {
  await withApi(
    { NODE_ENV: 'production', CLIENT_URL: 'https://app.example.test' },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: {
          Origin: 'https://attacker.example.test',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
      });
    }
  );
});

test('production CORS requires a configured frontend origin', () => {
  assert.throws(
    () => createCorsOptions({ NODE_ENV: 'production' }),
    /explicit CLIENT_URL/
  );
});

test('API applies a bounded JSON body limit without exposing parser details', async () => {
  await withApi({ NODE_ENV: 'development' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(70 * 1024) }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'REQUEST_BODY_TOO_LARGE',
        message: 'Request body exceeds the allowed size.',
      },
    });
  });
});
