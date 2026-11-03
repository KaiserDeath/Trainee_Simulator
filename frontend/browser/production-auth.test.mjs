import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createHubCsrfProtection } from '../../backend/src/auth/hubCsrf.js';
import { readHubCookies, setHubSessionCookies } from '../../backend/src/auth/hubCookies.js';

// Exercise the built app and actual cookie/CSRF helpers, without hosted credentials.
test('production login uses same-origin API cookies and survives reload', async () => {
  const requests = [];
  let origin;
  let csrf;
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, origin).pathname;
      if (path.startsWith('/api/')) {
        requests.push({ path, method: req.method });
        res.set = (key, value) => res.setHeader(key, value);
        res.append = (key, value) => res.setHeader(key, [...(res.getHeader(key) || []), value]);
        req.get = (key) => req.headers[key.toLowerCase()];
        res.setHeader('Content-Type', 'application/json');
        const json = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
        if (path === '/api/hub/auth/csrf') return json({ csrfToken: csrf.issue(req, res) });
        let csrfError;
        csrf.middleware(req, res, (error) => { csrfError = error; });
        if (csrfError) return json({ error: { message: csrfError.message } }, 403);
        if (path === '/api/hub/auth/login') {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const body = JSON.parse(raw);
          if (body.username !== 'FixtureAdmin' || body.password !== 'FixturePassword') return json({}, 401);
          setHubSessionCookies(res, { secureCookies: false }, { access_token: 'fixture-access', refresh_token: 'fixture-refresh' });
          return json({ csrfToken: csrf.issue(req, res) });
        }
        if (readHubCookies(req).trez_hub_access !== 'fixture-access') return json({ error: { message: 'Authentication is required.' } }, 401);
        if (path === '/api/hub/context') return json({ subject: { id: 'fixture-admin', username: 'FixtureAdmin', displayName: 'Fixture Admin', roles: ['ADMIN'] } });
        if (path === '/api/hub/admin/profile') return json({ firstName: 'Fixture', surname: 'Admin', username: 'FixtureAdmin' });
        if (path === '/api/hub/admin/accounts') return json({ accounts: [] });
        if (path === '/api/hub/workspace/catalog') return json({ courses: [], modules: [], activities: [] });
        return json({});
      }
      const asset = path.startsWith('/assets/');
      const file = new URL(asset ? `../dist${path}` : '../dist/index.html', import.meta.url);
      const body = await readFile(file);
      res.setHeader('Content-Type', asset ? path.endsWith('.css') ? 'text/css' : 'text/javascript' : 'text/html');
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end('Fixture server failed');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  csrf = createHubCsrfProtection({ configured: true, clientOrigin: origin, secureCookies: false });
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const foreignRequests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && (url.pathname.startsWith('/api/') || url.pathname.includes('socket.io'))) foreignRequests.push(request.url());
    });
    await page.goto(`${origin}/hub`);
    await page.getByLabel('Username', { exact: true }).fill('FixtureAdmin');
    await page.getByLabel('Password', { exact: true }).fill('FixturePassword');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Administrator configuration', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Administrator configuration', exact: true }).waitFor();
    const cookie = (await page.context().cookies()).find((row) => row.name === 'trez_hub_access');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
    assert.equal(requests.filter((row) => row.path === '/api/hub/auth/login').length, 1);
    assert.deepEqual(foreignRequests, []);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
