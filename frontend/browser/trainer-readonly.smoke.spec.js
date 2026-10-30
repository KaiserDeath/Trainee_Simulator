import { expect, test } from '@playwright/test';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  trainee_name: 'Neutral Trainer Fixture',
  status: 'completed',
  started_at: '2026-08-20T12:00:00.000Z',
  ended_at: '2026-08-20T12:30:00.000Z'
};

test('trainer report is read-only, provisional, and distinguishes audit failure', async ({ page }) => {
  const requests = [];

  await page.addInitScript(() => {
    localStorage.setItem('token', 'allow_trainer_access');
  });

  await page.routeWebSocket('**/socket.io/**', webSocket => {
    webSocket.close();
  });

  await page.route('**/api/trainer/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push({ method: request.method(), pathname });

    if (pathname === '/api/trainer/settings') {
      return route.fulfill({ json: {} });
    }
    if (pathname === '/api/trainer/sessions') {
      return route.fulfill({ json: [session, { ...session, id: '22222222-2222-4222-8222-222222222222', started_at: '2026-08-19T12:00:00.000Z' }] });
    }
    if (pathname === '/api/trainer/operation-time-stats') {
      return route.fulfill({ json: {} });
    }
    if (pathname.endsWith('/report')) {
      return route.fulfill({
        json: {
          session,
          performance: {
            accuracy: 95,
            completedOperations: 1,
            totalOperations: 1
          },
          operationBreakdown: {},
          operations: []
        }
      });
    }
    if (pathname.endsWith('/audit-log')) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'fixture unavailable' })
      });
    }

    return route.fulfill({ status: 404, body: '{}' });
  });

  await page.goto('/trainer');
  await expect(
    page.getByRole('heading', { name: 'Trainer Command' })
  ).toBeVisible();

  await page.getByLabel('Find trainee or session').fill('no such trainee');
  await expect(page.getByText('No trainee sessions match the current filter.')).toBeVisible();
  await page.getByLabel('Find trainee or session').fill('');
  await page.getByLabel('Session status', { exact: true }).selectOption('active');
  await expect(page.getByText('No trainee sessions match the current filter.')).toBeVisible();
  await page.getByLabel('Session status', { exact: true }).selectOption('completed');
  await page.getByLabel('Order histories').selectOption('name');
  await page.getByRole('button', { name: /Neutral Trainer Fixture/ }).click();
  await expect(page.getByRole('button', { name: /Neutral Trainer Fixture/ })).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: '../outputs/trainer-console-directory-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Menu & controls' }).click();
  await expect(page.getByLabel('Min operations/min')).toBeVisible();
  await expect(page.getByLabel('Max operations/min')).toBeVisible();
  await page.screenshot({ path: '../outputs/trainer-console-controls-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close controls' }).click();
  await page.screenshot({ path: '../outputs/trainer-console-directory-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Open', exact: true }).first().click();

  await expect(
    page.getByText(/Prototype evaluation metrics/)
  ).toBeVisible();
  await expect(page.getByText('Pending approval')).toBeVisible();

  await page.getByRole('button', { name: 'Audit Log' }).click();
  await expect(
    page.getByText('Audit log is currently unavailable.')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByLabel('Session history for this entered name').selectOption('22222222-2222-4222-8222-222222222222');
  await expect(page.getByText('ID: 22222222-2222-4222-8222-222222222222', { exact: true })).toBeVisible();
  await expect(page.getByText(/Prototype evaluation metrics/)).toBeVisible();
  expect(requests.some((request) => request.pathname === '/api/trainer/sessions/22222222-2222-4222-8222-222222222222/report')).toBe(true);
  await page.screenshot({ path: '../outputs/trainer-console-report-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../outputs/trainer-console-report-mobile.png', fullPage: true });

  expect(
    requests.filter(request => request.method !== 'GET')
  ).toEqual([]);
});
