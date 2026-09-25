// Minimal stand-in for the Supabase API gateway, for a local machine running
// PostgREST directly. supabase-js calls <SUPABASE_URL>/rest/v1/<table>; PostgREST
// serves <table> at its root. Hosted Supabase puts Kong in between to strip that
// prefix, and this does only that job.
//
//   node scripts/local-api-gateway.mjs
//
//   LOCAL_API_GATEWAY_PORT  listen port                (default 8000)
//   POSTGREST_URL           upstream PostgREST origin  (default http://127.0.0.1:3000)
//
// Auth is not proxied. With HUB_AUTH_MODE=local the backend signs sessions
// in process and never issues HTTP auth calls, so /auth/v1 answers 501 rather
// than pretending a GoTrue is present.

import http from 'node:http';
import { URL } from 'node:url';

const REST_PREFIX = '/rest/v1';
const AUTH_PREFIX = '/auth/v1';

// Hop-by-hop headers must not be forwarded (RFC 9110).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function resolveUpstreamPath(requestUrl) {
  if (requestUrl === REST_PREFIX || requestUrl.startsWith(`${REST_PREFIX}/`)) {
    const rest = requestUrl.slice(REST_PREFIX.length);
    return rest === '' ? '/' : rest;
  }
  return null;
}

function forwardableHeaders(headers, upstream) {
  const forwarded = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    if (name.toLowerCase() === 'host') continue;
    forwarded[name] = value;
  }
  forwarded.host = upstream.host;
  return forwarded;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createGateway({ postgrestUrl }) {
  const upstream = new URL(postgrestUrl);

  return http.createServer((request, response) => {
    if (request.url === '/health') {
      return sendJson(response, 200, { status: 'ok', upstream: upstream.origin });
    }

    if (request.url === AUTH_PREFIX || request.url.startsWith(`${AUTH_PREFIX}/`)) {
      return sendJson(response, 501, {
        message:
          'This gateway does not provide Supabase Auth. Set HUB_AUTH_MODE=local so the backend signs sessions in process.',
      });
    }

    const upstreamPath = resolveUpstreamPath(request.url);
    if (upstreamPath === null) {
      return sendJson(response, 404, { message: `Unsupported path: ${request.url}` });
    }

    const proxied = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        method: request.method,
        path: upstreamPath,
        headers: forwardableHeaders(request.headers, upstream),
      },
      (upstreamResponse) => {
        const headers = {};
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (!HOP_BY_HOP.has(name.toLowerCase())) headers[name] = value;
        }
        response.writeHead(upstreamResponse.statusCode || 502, headers);
        upstreamResponse.pipe(response);
      },
    );

    proxied.on('error', (error) => {
      if (response.headersSent) return response.destroy();
      sendJson(response, 502, {
        message: `PostgREST is unreachable at ${upstream.origin}: ${error.message}`,
      });
    });

    request.pipe(proxied);
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href.replace(/\\/g, '/');

if (isDirectRun || process.env.LOCAL_API_GATEWAY_START === '1') {
  const port = Number(process.env.LOCAL_API_GATEWAY_PORT || 8000);
  const postgrestUrl = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';

  createGateway({ postgrestUrl }).listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `Local API gateway on http://127.0.0.1:${port} -> ${postgrestUrl}\n` +
        `Set SUPABASE_URL=http://127.0.0.1:${port}\n`,
    );
  });
}
