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
      return route.fulfill({ json: [session] });
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

  await page.goto('/sim/trainer');
  await expect(
    page.getByRole('heading', { name: 'Trainer Command' })
  ).toBeVisible();

  await page.getByRole('button', { name: /Neutral Trainer Fixture/ }).click();
  await page.getByRole('button', { name: 'Open' }).click();

  await expect(
    page.getByText(/Prototype evaluation metrics/)
  ).toBeVisible();
  await expect(page.getByText('Pending approval')).toBeVisible();

  await page.getByRole('button', { name: 'Audit Log' }).click();
  await expect(
    page.getByText('Audit log is currently unavailable.')
  ).toBeVisible();

  expect(
    requests.filter(request => request.method !== 'GET')
  ).toEqual([]);
});
