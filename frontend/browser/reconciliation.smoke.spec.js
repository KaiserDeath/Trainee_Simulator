import { expect, test } from '@playwright/test';

const session = {
  id: 'reconciliation-browser-session',
  trainee_name: 'Reconciliation Postulante',
  status: 'active',
  started_at: new Date().toISOString(),
  duration_minutes: 30
};

const customer = {
  username: 'DAREALSEEM',
  first_name: 'Quin',
  last_name: 'Cooper',
  email: 'quin.cooper7@mail.com',
  balance: 100
};

const reconciliation = {
  id: '0dyyft2n-0000-0000-0000-000000000001',
  session_id: session.id,
  type: 'ADD CREDITS',
  status: 'PENDING',
  amount: 50,
  created_at: new Date().toISOString(),
  customer,
  game_account: { game: 'Golden Dragon', game_username: 'M-959-957-628', balance: 3.5 },
  needs_reconciliation: true,
  reconciliation_note:
    'the platform accepted the movement but the balance did not end up as expected: ' +
    'before=3.50 expected at least=53.50 read=0.00 (amount=50.00)'
};

const plainMovement = {
  ...reconciliation,
  id: 'rsqm2c18-0000-0000-0000-000000000002',
  type: 'WITHDRAW CREDITS',
  amount: 15,
  needs_reconciliation: undefined,
  reconciliation_note: undefined
};

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/socket.io/**', (webSocket) => webSocket.close());
  await page.addInitScript((savedSession) => {
    window.localStorage.setItem('casino_trainer_session', JSON.stringify(savedSession));
  }, session);
  await page.route(`**/api/sessions/${session.id}`, (route) => route.fulfill({
    json: session
  }));
  await page.route(`**/api/trainer/sessions/${session.id}/**`, (route) => route.fulfill({
    json: { performance: {} }
  }));
});

// A pending reconciliation must never be operated: Pending only points the
// trainee to Needs reconciliation, where they answer with a reason.
test('a pending reconciliation is answered, never operated', async ({ page }) => {
  let pending = [plainMovement, reconciliation];
  const processed = [];

  await page.route(`**/api/operations/${session.id}`, (route) => route.fulfill({
    json: pending
  }));
  await page.route('**/api/operations/*/process', async (route) => {
    const id = route.request().url().split('/operations/')[1].split('/')[0];
    processed.push({ id, body: route.request().postDataJSON() });
    pending = pending.filter(operation => operation.id !== id);
    await route.fulfill({ json: { message: 'Operation processed', isCorrect: true } });
  });

  await page.goto('/');

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('button', { name: /New Movements\s*2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pending\s*2$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Needs reconciliation\s*1$/ })).toBeVisible();

  const reconCard = page.getByTestId(`operation-${reconciliation.id}`);
  await expect(reconCard).toContainText('Pending reconciliation');
  await expect(reconCard).toContainText('expected at least=53.50');
  await expect(reconCard.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(reconCard.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(
    page.getByTestId(`operation-${plainMovement.id}`).getByRole('button', { name: 'Approve' })
  ).toBeVisible();

  await reconCard.getByRole('button', { name: /Needs reconciliation/ }).click();

  const panel = page.getByTestId(`reconciliation-${reconciliation.id}`);
  await expect(panel).toContainText('GOLDEN_DRAGON - ADD_CREDITS');
  await expect(panel).toContainText('50.00');
  const applied = panel.getByRole('button', { name: /It applied/ });
  const notApplied = panel.getByRole('button', { name: /It did not apply/ });
  await expect(applied).toBeDisabled();
  await expect(notApplied).toBeDisabled();

  await panel.getByPlaceholder(/Reason \(required\)/).fill('No bot load in the game history');
  await notApplied.click();

  await expect(panel).toHaveCount(0);
  expect(processed).toEqual([{
    id: reconciliation.id,
    body: {
      action: 'CANCELLED',
      traineeName: session.trainee_name,
      requestData: {
        reconciliation: true,
        cancellationReason: 'No bot load in the game history'
      }
    }
  }]);
  await expect(page.getByRole('button', { name: /^Needs reconciliation\s*0$/ })).toBeVisible();
});
