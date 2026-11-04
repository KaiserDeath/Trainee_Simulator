import { expect, test } from '@playwright/test';
const session = { id: 'review-session', trainee_name: 'Evidence Fixture', status: 'completed', started_at: '2026-11-02T12:00:00Z' };
const operations = [
  { id: 'wrong-amount', type: 'ADD CREDITS', game: 'Orion Stars', customerName: 'Example', status: 'APPROVED', original_is_correct: false, handling_time_seconds: null, validationRequirements: [{ label: 'Game amount', expected: 50, sent: 40, ok: false }] },
  { id: 'missing-evidence', type: 'WITHDRAW CREDITS', status: 'APPROVED', validationRequirements: [{ label: 'Game action', expected: 'Posted', sent: 'Missing', ok: false }] },
  { id: 'correct-zero', type: 'REFRESH BALANCE', status: 'APPROVED', handling_time_seconds: 0, validationRequirements: [{ label: 'Balance', expected: 0, sent: 0, ok: true }] },
  { id: 'pending', type: 'CREATE ACCOUNT', status: 'PENDING', validationRequirements: [] },
  { id: 'redacted', type: 'RESET PASSWORD', status: 'APPROVED', validationRequirements: [{ label: 'Password', expected: 'do-not-display', sent: 'secret-literal', ok: false }] }
];
async function fixture(page, options = {}) {
  const writes = [];
  await page.addInitScript(() => localStorage.setItem('token', 'allow_trainer_access'));
  await page.routeWebSocket('**/socket.io/**', (socket) => socket.close());
  await page.route(/\/api\/(?:trainer|operations)(?:\/|$)/, (route) => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(request.url());
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/settings') || path.endsWith('/operation-time-stats')) return route.fulfill({ json: {} });
    if (path.endsWith('/sessions')) return route.fulfill({ json: [{ ...session, status: options.status?.() || 'completed' }] });
    if (path.endsWith('/report')) return options.fail?.() ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { performance: { accuracy: 20 }, operations } });
    if (path.endsWith('/audit-log')) return route.fulfill({ json: [
      { operation_id: 'wrong-amount', action_type: 'OPERATION_STARTED', timestamp: '2026-11-02T12:01:00Z' },
      { operation_id: 'other-operation', action_type: 'UNRELATED_EVENT', timestamp: '2026-11-02T12:02:00Z' }
    ] });
    if (path.includes('/operations/')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/trainer');
  await page.getByRole('button', { name: /Evidence Fixture/ }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  return writes;
}
test('populated review filters mistakes, explains evidence, links only exact audit events and redacts passwords', async ({ page }) => {
  const writes = await fixture(page);
  const review = page.getByRole('region', { name: 'Operation review' });
  await expect(page.getByText(/Report loaded:/)).not.toContainText('Invalid Date');
  await expect(review.getByText('Game amount differs')).toBeVisible();
  await expect(review.getByText('Report check: expected 50 credits; recorded 40 credits.')).toBeVisible();
  await expect(review.getByText(/Handling: Not recorded/)).toBeVisible();
  await review.getByText('Linked trainee evidence timeline', { exact: true }).click();
  await expect(review.getByRole('cell', { name: 'Operation Started', exact: true })).toBeVisible();
  await expect(review.getByRole('cell', { name: /11\/02\/2026/ })).toBeVisible();
  await expect(review.getByText('UNRELATED_EVENT')).toHaveCount(0);
  await page.getByLabel('Operation result').selectOption('Unverified');
  await expect(review.getByText(/Unable to verify from available evidence/)).toBeVisible();
  await page.getByLabel('Operation result').selectOption('Correct');
  await expect(review.getByText(/Handling: 0s/)).toBeVisible();
  await page.getByLabel('Operation result').selectOption('All');
  await page.getByRole('textbox', { name: 'Find operation' }).fill('redacted');
  await expect(review.getByText(/expected Redacted; recorded Redacted/)).toBeVisible();
  await expect(page.getByText(/secret-literal|do-not-display/)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../outputs/trainer-review-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('textbox', { name: 'Find operation' }).fill('wrong-amount');
  await page.screenshot({ path: '../outputs/trainer-review-desktop.png', fullPage: true });
  expect(writes).toEqual([]);
});
test('open session updates only on request and removes live actions', async ({ page }) => {
  let status = 'active';
  await fixture(page, { status: () => status });
  await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeVisible();
  status = 'completed';
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Operations', exact: true })).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole('region', { name: 'Operation review' })).toBeVisible();
});
test('report failure retries without exposing stale data', async ({ page }) => {
  let failed = true;
  await fixture(page, { fail: () => failed });
  await expect(page.getByRole('alert')).toContainText('Failed to load report');
  failed = false;
  await page.getByRole('button', { name: 'Retry report' }).click();
  await expect(page.getByRole('region', { name: 'Operation review' })).toBeVisible();
});


test('trainer stays idle until Update and loads statistics only on demand', async ({ page }) => {
  const reads = [];
  page.on('request', request => { const path=new URL(request.url()).pathname;if(path.startsWith('/api/'))reads.push(path); });
  await page.clock.install();
  await fixture(page);
  await expect(page.getByRole('region', { name: 'Operation review' })).toBeVisible();
  expect(reads.filter(path => path.endsWith('/operation-time-stats'))).toHaveLength(0);
  await expect(page.getByText('Loading audit log...', {exact:true})).toHaveCount(0);
  await expect(page.getByRole('cell',{name:'Operation Started',exact:true,includeHidden:true}).first()).toBeAttached();
  const before = reads.length;
  await page.clock.fastForward(120000);
  expect(reads).toHaveLength(before);
  const reports = reads.filter(path => path.endsWith('/report')).length;
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect.poll(() => reads.filter(path => path.endsWith('/report')).length).toBe(reports + 1);
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect.poll(() => reads.filter(path => path.endsWith('/operation-time-stats')).length).toBe(1);
  const statsReads = reads.length;
  await page.clock.fastForward(120000);
  expect(reads).toHaveLength(statsReads);
});
