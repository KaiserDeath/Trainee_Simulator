import { expect, test } from '@playwright/test';

const session = {
  id: 'vblink-browser-session',
  trainee_name: 'Vblink Browser Postulante',
  status: 'active'
};

const existingAccount = {
  id: 'vblink-existing-account',
  session_id: session.id,
  customer_id: 'vblink-existing-customer',
  game: 'Vblink',
  game_username: 'existing_vb',
  balance: 0,
  game_wallet_balance: 5000,
  created_at: '2026-09-29T10:00:00.000Z'
};

async function openAddPlayer(page) {
  await page.goto(`/games/vblink/${session.id}`);
  await page.getByRole('button', { name: /^👤 User Management$/ }).click();
  await page.getByTestId('vblink-add-player-btn').click();
}

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/socket.io/**', (webSocket) => webSocket.close());
  await page.addInitScript((savedSession) => {
    window.localStorage.setItem('casino_trainer_session', JSON.stringify(savedSession));
  }, session);
  await page.route('**/api/sessions/vblink-browser-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(session)
  }));
});

// Grading identifies the created account by the User Name and password
// alone, so the form must send exactly what the trainee typed and never
// the customer of an existing player row.
test('Vblink Add Player sends the typed User Name and password as the new account', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  const creationRequests = [];
  let createdAccount = null;

  await page.route('**/api/games/vblink-browser-session/Vblink/accounts**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      creationRequests.push(body);
      createdAccount = {
        ...existingAccount,
        id: 'vblink-new-account',
        customer_id: 'vblink-new-customer',
        game_username: body.gameUsername,
        created_at: '2026-09-29T10:05:00.000Z'
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createdAccount)
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createdAccount ? [existingAccount, createdAccount] : [existingAccount]
      )
    });
  });

  await openAddPlayer(page);
  const dialog = page.getByRole('heading', { name: 'Add Player' });
  await expect(dialog).toBeVisible();

  // The User Name is required.
  await page.getByTestId('vblink-add-player-ok').click();
  await expect(page.getByText('User Name is required')).toBeVisible();
  expect(creationRequests).toEqual([]);

  // A password without a digit is rejected before anything is sent.
  await page.getByTestId('vblink-add-player-username').fill('  jdoe_vb  ');
  await page.getByTestId('vblink-add-player-password').fill('onlyletters');
  await page.getByTestId('vblink-add-player-ok').click();
  await expect(page.getByText(/Length must be 6-16 characters/)).toBeVisible();
  expect(creationRequests).toEqual([]);

  await page.getByTestId('vblink-add-player-password').fill('abc123');
  await page.getByLabel('Name', { exact: true }).fill('Jane Doe');
  await page.getByTestId('vblink-add-player-ok').click();

  await expect(page.getByText('Player created successfully')).toBeVisible();
  expect(creationRequests).toEqual([
    {
      gameUsername: 'jdoe_vb',
      password: 'abc123',
      customerName: 'Jane Doe'
    }
  ]);
  await expect(dialog).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('Vblink Add Player falls back to the User Name when Name is blank', async ({ page }) => {
  const creationRequests = [];

  await page.route('**/api/games/vblink-browser-session/Vblink/accounts**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      creationRequests.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...existingAccount,
          id: 'vblink-new-account',
          game_username: body.gameUsername
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([existingAccount])
    });
  });

  await openAddPlayer(page);
  await page.getByTestId('vblink-add-player-username').fill('solo_vb');
  await page.getByTestId('vblink-add-player-password').fill('pass99');
  await page.getByTestId('vblink-add-player-ok').click();

  await expect(page.getByText('Player created successfully')).toBeVisible();
  expect(creationRequests).toEqual([
    {
      gameUsername: 'solo_vb',
      password: 'pass99',
      customerName: 'solo_vb'
    }
  ]);
});

test('Vblink Add Player shows the backend error and keeps the form open', async ({ page }) => {
  await page.route('**/api/games/vblink-browser-session/Vblink/accounts**', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'duplicate key value violates unique constraint "uq_sandbox_game_accounts_customer_game"'
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([existingAccount])
    });
  });

  await openAddPlayer(page);
  await page.getByTestId('vblink-add-player-username').fill('existing_vb');
  await page.getByTestId('vblink-add-player-password').fill('abc123');
  await page.getByTestId('vblink-add-player-ok').click();

  await expect(page.getByText(/duplicate key value/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Player' })).toBeVisible();
  await expect(page.getByText('Player created successfully')).toHaveCount(0);
});
