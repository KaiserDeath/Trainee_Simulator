import { expect, test } from '@playwright/test';

const sessions = [
  { id: 'session-new', trainee_name: 'Alex Morgan', status: 'completed', started_at: '2026-10-30T14:00:00Z', ended_at: '2026-10-30T14:30:00Z' },
  { id: 'session-old', trainee_name: 'Alex Morgan', status: 'submitted', started_at: '2026-10-29T14:00:00Z', ended_at: '2026-10-29T14:30:00Z' },
];
const stats = {
  generatedAt: '2026-10-30T15:00:00Z',
  overall: { count: 1000, averageSeconds: 32.8, minSeconds: 5, maxSeconds: 90 },
  allOperations: [
    { type: 'ADD CREDITS', count: 207, averageSeconds: 37.4, minSeconds: 6.9, maxSeconds: 80 },
    { type: 'CREATE ACCOUNT', count: 143, averageSeconds: 41, minSeconds: 7, maxSeconds: 90 },
    { type: 'REFRESH BALANCE', count: 237, averageSeconds: 27.9, minSeconds: 5, maxSeconds: 70 },
    { type: 'RESET PASSWORD', count: 225, averageSeconds: 29.5, minSeconds: 8, maxSeconds: 65 },
    { type: 'WITHDRAW CREDITS', count: 188, averageSeconds: 28.2, minSeconds: 9, maxSeconds: 72 },
  ],
  perPerson: [
    { traineeName: 'Alex Morgan', sessionId: 'session-old', startedAt: sessions[1].started_at, overall: { count: 1, averageSeconds: 10, minSeconds: 10, maxSeconds: 10 }, operations: [{ type: 'ADD CREDITS', count: 1, averageSeconds: 10, minSeconds: 10, maxSeconds: 10 }] },
    { traineeName: 'Alex Morgan', sessionId: 'session-new', startedAt: sessions[0].started_at, overall: { count: 3, averageSeconds: 30, minSeconds: 20, maxSeconds: 40 }, operations: [{ type: 'ADD CREDITS', count: 3, averageSeconds: 30, minSeconds: 20, maxSeconds: 40 }] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'allow_trainer_access'));
  await page.routeWebSocket('**/socket.io/**', (socket) => socket.close());
  await page.route('**/api/trainer/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/operation-time-stats')) return route.fulfill({ json: stats });
    if (path.endsWith('/sessions')) return route.fulfill({ json: sessions });
    if (path.endsWith('/settings')) return route.fulfill({ json: { minOpm: 4, maxOpm: 8, sessionTimeoutMinutes: 30 } });
    if (path.endsWith('/report')) return route.fulfill({ json: { performance: { accuracy: 95, totalOperations: 1, completedOperations: 1 }, operations: [] } });
    return route.fulfill({ json: {} });
  });
});

test('statistics compare real values on a shared scale and navigate weighted trainee histories', async ({ page }) => {
  const mutations = [];
  page.on('request', (request) => { if (request.url().includes('/api/trainer/') && request.method() !== 'GET') mutations.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.goto('/trainer');
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operation performance' })).toBeVisible();
  await expect(page.locator('.trainer-comparison-row')).toHaveCount(5);
  const add = page.locator('.trainer-comparison-row').filter({ hasText: 'add credits' });
  const create = page.locator('.trainer-comparison-row').filter({ hasText: 'create account' });
  // Both use the same 45-second ceiling, rather than filling every row.
  await expect(add.locator('.trainer-comparison-track > span')).toHaveAttribute('style', /83\.111/);
  await expect(create.locator('.trainer-comparison-track > span')).toHaveAttribute('style', /91\.111/);
  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await expect(add.locator('.trainer-comparison-track > span')).toHaveAttribute('style', /86\.25/);
  await page.getByRole('button', { name: 'Handling time', exact: true }).click();
  await page.screenshot({ path: '../outputs/trainer-performance-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../outputs/trainer-performance-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'By trainee', exact: true }).click();
  await page.getByLabel('Find trainee timing').fill('Alex');
  await page.locator('.trainer-person-timing > summary').click();
  await expect(page.locator('.trainer-person-timing > summary')).toContainText('25s average');
  const history = page.locator('.trainer-person-detail .trainer-data-table');
  await expect(history.locator('tbody tr').first()).toContainText('session-');
  await history.getByRole('button', { name: 'View report' }).first().click();
  await expect(page.getByText('ID: session-new', { exact: true })).toBeVisible();
  await expect(page.getByText(/Prototype evaluation metrics/)).toBeVisible();
  expect(mutations).toEqual([]);
});

test('failed statistics requests can be retried without displaying missing values as zero', async ({ page }) => {
  let offline = true;
  await page.route('**/api/trainer/operation-time-stats', (route) => {
    return offline ? route.fulfill({ status: 503, json: { error: 'Offline' } }) : route.fulfill({ json: { overall: { count: 0, averageSeconds: 0 }, allOperations: [], perPerson: [] } });
  });
  await page.goto('/trainer');
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByText('Statistics could not be refreshed.', { exact: true })).toBeVisible();
  offline = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No timed operations recorded yet.')).toBeVisible();
  await expect(page.locator('.trainer-kpi-strip > div').nth(1)).toContainText('—');
});

test('settings stay editable through the existing simulator settings endpoint', async ({ page }) => {
  let saved;
  await page.route('**/api/trainer/settings', async (route) => {
    if (route.request().method() === 'POST') saved = route.request().postDataJSON();
    await route.fulfill({ json: { minOpm: 4, maxOpm: 8, sessionTimeoutMinutes: 30, ...saved } });
  });
  await page.goto('/trainer');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Min operations/min')).toHaveValue('4');
  await page.getByLabel('Min operations/min').fill('5');
  await expect(page.getByRole('status')).toContainText('Saved');
  expect(saved).toMatchObject({ minOpm: 5, maxOpm: 8, sessionTimeoutMinutes: 30 });
});
