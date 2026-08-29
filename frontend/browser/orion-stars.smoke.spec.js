import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const captureOrionQa =
  globalThis.process?.env?.TREZ_CAPTURE_ORION_QA === '1';
const captureOrionCreateQa =
  globalThis.process?.env?.TREZ_CAPTURE_ORION_CREATE_QA === '1';
const captureOrionResultsQa =
  globalThis.process?.env?.TREZ_CAPTURE_ORION_RESULTS_QA === '1';

const session = {
  id: 'orion-browser-session',
  trainee_name: 'Orion Browser Postulante',
  status: 'active'
};

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/socket.io/**', (webSocket) => webSocket.close());
  await page.addInitScript((savedSession) => {
    window.localStorage.setItem('casino_trainer_session', JSON.stringify(savedSession));
  }, session);
  await page.route('**/api/sessions/orion-browser-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(session)
  }));
  await page.route('**/api/games/orion-browser-session/Orion%20Stars/wallet', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ game: 'Orion Stars', balance: 20000 })
  }));
});

test('new Orion Stars tab keeps the source screen branding and shows the source-styled creation prompt', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  if (captureOrionQa) {
    await page.setViewportSize({ width: 1859, height: 829 });
  } else if (captureOrionCreateQa) {
    await page.setViewportSize({ width: 1640, height: 714 });
  }

  let created = false;
  let creationRequest;
  const account = {
    id: 'orion-account-1',
    session_id: session.id,
    customer_id: 'orion-customer-1',
    game: 'Orion Stars',
    game_username: 'free-simulator-any-id',
    balance: 0,
    game_wallet_balance: 20000
  };

  await page.route('**/api/games/orion-browser-session/Orion%20Stars/accounts**', async (route) => {
    if (route.request().method() === 'POST') {
      creationRequest = route.request().postDataJSON();
      created = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...account,
          adapterOutcome: {
            successPrompt: {
              kind: 'ORION_ACCOUNT_CREATED',
              title: 'Success',
              message: 'Player account created successfully.'
            },
            accountStructureEvaluation: {
              enforced: false,
              status: 'NOT_EVALUATED'
            }
          }
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(created ? [account] : [])
    });
  });

  await page.goto(`/games/orion-stars/${session.id}`);

  await expect(page).toHaveTitle('Orion Stars');
  await expect(page.getByRole('heading', { name: /OrionStars/ })).toBeVisible();
  await expect(page.getByTestId('orion-wallet-balance')).toHaveText('Balance:20000');
  if (captureOrionQa) {
    const auditDirectory = path.resolve('..', '.audit', 'orion-stars-20260825');
    mkdirSync(auditDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(auditDirectory, 'implementation.png'),
      fullPage: false
    });
  }
  await page.getByRole('button', { name: 'Create Player' }).click();
  const accountInput = page.getByLabel('Account', { exact: true });
  const nicknameInput = page.getByLabel('NickName', { exact: true });
  const passwordInput = page.getByLabel('Login password', { exact: true });
  const confirmationInput = page.getByLabel('Confirm password', { exact: true });
  await expect(accountInput).toHaveCSS('color', 'rgb(17, 24, 39)');
  await expect(accountInput).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(passwordInput).toHaveCSS('color', 'rgb(17, 24, 39)');
  await expect(passwordInput).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(nicknameInput).toHaveValue('');
  if (captureOrionCreateQa) {
    const auditDirectory = path.resolve('..', '.audit', 'orion-stars-create-player-20260825');
    mkdirSync(auditDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(auditDirectory, 'implementation.png'),
      fullPage: false
    });
  }
  await accountInput.fill('free-simulator-any-id');
  await passwordInput.fill('fixture-password');
  await confirmationInput.fill('different-password');
  await expect(accountInput).toHaveValue('free-simulator-any-id');
  await expect(passwordInput).toHaveValue('fixture-password');
  await page.getByRole('dialog', { name: 'Create Player' }).getByRole('button', { name: 'Create Player', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The password confirmation does not match.');
  expect(creationRequest).toBeUndefined();
  await confirmationInput.fill('fixture-password');
  await page.getByRole('dialog', { name: 'Create Player' }).getByRole('button', { name: 'Create Player', exact: true }).click();

  const prompt = page.getByRole('alertdialog');
  await expect(prompt.getByRole('heading', { name: 'Message' })).toBeVisible();
  await expect(prompt.getByText('Player account created successfully.')).toBeVisible();
  expect(creationRequest).toEqual({
    gameUsername: 'free-simulator-any-id',
    nickname: 'free-simulator-any-id',
    password: 'fixture-password'
  });
  await prompt.getByRole('button', { name: 'OK' }).click();
  await expect(prompt).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('Orion reserve and player credit update immediately across consecutive recharge and redeem operations', async ({ page }) => {
  let accountReads = 0;
  let historyReads = 0;
  const movementRequests = [];
  let passwordResetRequest;
  const baseAccount = {
    id: 'orion-account-movement',
    session_id: session.id,
    customer_id: 'orion-customer-movement',
    game: 'Orion Stars',
    game_username: 'orion-player-one',
    nickname: 'Player One',
    balance: 100,
    game_wallet_balance: 20000,
    created_at: '2026-08-25T10:00:00.000Z',
    customer: {
      id: 'orion-customer-movement',
      username: 'backend-customer-one',
      balance: 750
    }
  };

  await page.route('**/api/games/orion-browser-session/Orion%20Stars/accounts**', async (route) => {
    accountReads += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([baseAccount])
    });
  });
  await page.route('**/api/games/orion-browser-session/customers/orion-customer-movement/history**', async (route) => {
    historyReads += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });
  await page.route('**/api/games/accounts/orion-account-movement/recharge', async (route) => {
    movementRequests.push({ action: 'recharge', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseAccount,
        balance: 150,
        game_wallet_balance: 19950
      })
    });
  });
  await page.route('**/api/games/accounts/orion-account-movement/redeem', async (route) => {
    movementRequests.push({ action: 'redeem', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseAccount,
        balance: 130,
        game_wallet_balance: 19970
      })
    });
  });
  await page.route('**/api/games/accounts/orion-account-movement/reset-password', async (route) => {
    passwordResetRequest = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...baseAccount,
        balance: 130,
        game_wallet_balance: 19970
      })
    });
  });

  await page.goto(`/games/orion-stars/${session.id}`);
  const resultRow = page.locator('.orion-results-table tbody tr').first();
  const updateButton = resultRow.getByRole('button', { name: 'Update' });
  await expect(resultRow.getByRole('cell').nth(2)).toHaveText('orion-player-one');
  await expect(resultRow.getByRole('cell').nth(3)).toHaveText('Player One');
  await expect.poll(() => updateButton.evaluate(button =>
    button.parentElement.clientWidth >= button.offsetWidth
  )).toBe(true);
  await updateButton.click();
  await expect(page.getByTestId('orion-wallet-balance')).toHaveText('Balance:20000');
  await expect(page.getByTestId('orion-player-credit')).toHaveText('100');

  await page.getByRole('button', { name: 'Recharge', exact: true }).click();
  await expect(page.getByLabel('ID:', { exact: true })).toHaveValue('orion-account-movement');
  await expect(page.getByLabel('Account:', { exact: true })).toHaveValue('orion-player-one');
  await expect(page.getByLabel('Credit:', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Total win:', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Available Balance:', { exact: true })).toHaveValue('20000');
  await page.getByLabel('Amount').fill('50');
  await page.getByLabel('Note:', { exact: true }).fill('Training add credits');
  await page.locator('.orion-recharge-form').getByRole('button', { name: 'Recharge', exact: true }).click();
  const rechargePrompt = page.getByRole('alertdialog');
  await expect(rechargePrompt).toContainText('Successful operation.');
  await expect(page.getByTestId('orion-wallet-balance')).toHaveText('Balance:19950');
  await expect(page.getByTestId('orion-player-credit')).toHaveText('150');
  await rechargePrompt.getByRole('button', { name: 'OK' }).click();

  await page.getByRole('button', { name: 'Redeem', exact: true }).click();
  await expect(page.getByLabel('ID:', { exact: true })).toHaveValue('orion-account-movement');
  await expect(page.getByLabel('Account:', { exact: true })).toHaveValue('orion-player-one');
  await expect(page.getByLabel('Credit:', { exact: true })).toHaveValue('150');
  await expect(page.getByLabel('Total win:', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Available Balance:', { exact: true })).toHaveValue('19950');
  await expect(page.locator('#orion-redeem-amount')).toHaveValue('0');
  await page.getByLabel('Amount').fill('20');
  await page.locator('.orion-recharge-form').getByRole('button', { name: 'Redeem', exact: true }).click();
  const redeemPrompt = page.getByRole('alertdialog');
  await expect(redeemPrompt).toContainText('Successful operation.');
  await expect(page.getByTestId('orion-wallet-balance')).toHaveText('Balance:19970');
  await expect(page.getByTestId('orion-player-credit')).toHaveText('130');
  await redeemPrompt.getByRole('button', { name: 'OK' }).click();

  await page.getByRole('button', { name: 'Reset Password' }).click();
  await page.getByLabel('New Password').fill('new-orion-password');
  await page.getByRole('button', { name: 'Confirm' }).click();
  const resetPrompt = page.getByRole('alertdialog');
  await expect(resetPrompt).toContainText('Successful operation.');
  expect(passwordResetRequest).toEqual({
    newPassword: 'new-orion-password'
  });
  await resetPrompt.getByRole('button', { name: 'OK' }).click();

  expect(movementRequests).toEqual([
    { action: 'recharge', body: { amount: '50', note: 'Training add credits' } },
    { action: 'redeem', body: { amount: '20' } }
  ]);
  expect(accountReads).toBe(1);
  expect(historyReads).toBeGreaterThanOrEqual(2);
  expect(baseAccount.customer.balance).toBe(750);
});

test('populated Orion results keep every Update action completely visible', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  const accounts = Array.from({ length: 7 }, (_, index) => ({
    id: `${index + 1}`.repeat(8),
    session_id: session.id,
    customer_id: `orion-customer-${index + 1}`,
    game: 'Orion Stars',
    game_username: `orion-player-${index + 1}`,
    nickname: `Player ${index + 1}`,
    balance: 0,
    game_wallet_balance: 20000,
    created_at: '2026-08-25T10:00:00.000Z'
  }));

  await page.route('**/api/games/orion-browser-session/Orion%20Stars/accounts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(accounts)
  }));

  await page.goto(`/games/orion-stars/${session.id}`);
  const updateButtons = page.getByRole('button', { name: 'Update', exact: true });
  await expect(updateButtons).toHaveCount(7);

  for (const button of await updateButtons.all()) {
    await expect(button).toBeVisible();
    expect(await button.evaluate(element =>
      element.parentElement.clientWidth >= element.offsetWidth
    )).toBe(true);
  }

  if (captureOrionResultsQa) {
    const auditDirectory = path.resolve('..', '.audit', 'orion-stars-results-20260825');
    mkdirSync(auditDirectory, { recursive: true });
    await page.locator('.orion-results-panel').screenshot({
      path: path.join(auditDirectory, 'implementation.png')
    });
  }

  expect(consoleErrors).toEqual([]);
});

test('Backend pencil and Confirm submit the created Orion account information as the terminal request action', async ({ page }) => {
  let processed = false;
  let processRequest;
  const operation = {
    id: 'orion-create-operation',
    operation_code: 'CREATE-ORION-1',
    type: 'CREATE ACCOUNT',
    status: 'PENDING',
    created_at: '2026-08-24T10:00:00.000Z',
    customer: {
      username: 'customer-one',
      first_name: 'Customer',
      last_name: 'One',
      email: 'customer-one@example.test'
    },
    game_account: {
      game: 'Orion Stars',
      game_username: '',
      balance: 0
    }
  };

  await page.route('**/api/operations/orion-browser-session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(processed ? [] : [operation])
  }));
  await page.route('**/api/trainer/sessions/orion-browser-session/report', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ performance: { accuracy: 0, completedOperations: 0, pendingOperations: 1 } })
  }));
  await page.route('**/api/operations/orion-create-operation/process', async (route) => {
    processRequest = route.request().postDataJSON();
    processed = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Operation processed', isCorrect: true })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Requests \(1\)/ }).click();
  await page.getByTestId('operation-orion-create-operation').getByRole('button').click();
  await page.getByLabel('New Game ID').fill('created-orion-id');
  await page.getByLabel('New Password').fill('created-orion-password');
  await expect(page.getByLabel('Kiosk')).toHaveValue('OrionStars');
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect.poll(() => processRequest).toEqual({
    action: 'APPROVED',
    traineeName: session.trainee_name,
    requestData: {
      gameId: 'created-orion-id',
      newPassword: 'created-orion-password',
      kiosk: 'OrionStars'
    }
  });
  await expect(page.getByText('No pending requests')).toBeVisible();
});
