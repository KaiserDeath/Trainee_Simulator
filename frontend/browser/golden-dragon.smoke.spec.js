import { expect, test } from '@playwright/test';

const session = {
  id: 'golden-dragon-browser-session',
  trainee_name: 'Golden Dragon Postulante',
  status: 'active'
};

const customerId = '4815162';

const changedAccount = {
  id: 'gd-changed-account',
  session_id: session.id,
  customer_id: 'gd-customer',
  game: 'Golden Dragon',
  game_username: 'M-123-456-789',
  password: `CHANGED:${customerId}`,
  balance: 300,
  customer: { first_name: 'Quin', last_name: 'Cooper' },
  created_at: '2026-10-29T10:00:00.000Z'
};

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/socket.io/**', (webSocket) => webSocket.close());
  await page.addInitScript((savedSession) => {
    window.localStorage.setItem('casino_trainer_session', JSON.stringify(savedSession));
  }, session);
  await page.route(`**/api/sessions/${session.id}`, (route) => route.fulfill({
    json: session
  }));
  await page.route(`**/api/games/${session.id}/customers/**`, (route) => route.fulfill({
    json: []
  }));
});

// A changed password hides the Customer ID behind Reset; only Reset → OK
// puts the Customer ID back so the trainee can copy it into the Backend.
test('a changed Golden Dragon password shows the Customer ID only after Reset', async ({ page }) => {
  let account = { ...changedAccount };
  const resets = [];

  await page.route(`**/api/games/${session.id}/Golden-Dragon/accounts**`, (route) => route.fulfill({
    json: [account]
  }));
  await page.route(`**/api/games/accounts/${changedAccount.id}/reset-password`, async (route) => {
    const body = route.request().postDataJSON();
    resets.push(body);
    account = { ...account, password: body.newPassword };
    await route.fulfill({ json: account });
  });

  await page.goto(`/games/golden-dragon/${session.id}`);
  await page.getByRole('row', { name: /M-123-456-789/ }).getByRole('button', { name: 'Select' }).click();

  // Customer ID row only; Mobile Password shows Reset instead of the ID.
  await expect(page.getByText(customerId, { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Reset password to Customer ID?')).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();

  expect(resets).toEqual([{ newPassword: customerId }]);
  await expect(page.getByText('Password reset successfully')).toBeVisible();
  // Mobile Password now shows the Customer ID too.
  await expect(page.getByText(customerId, { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);
});
