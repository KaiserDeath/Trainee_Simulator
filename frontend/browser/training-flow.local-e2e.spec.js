import {
  expect,
  test
} from '@playwright/test';
import process from 'node:process';

import {
  cleanupLocalE2ESessions,
  countLocalE2ESessions,
  E2E_TRAINEE_PREFIX,
  getScenarioSnapshot,
  seedDeterministicScenario
} from '../../backend/test/e2e/localSupabaseFixture.js';

const traineeName =
  `${E2E_TRAINEE_PREFIX} Playwright`;

function findById(items, id) {
  const item = items.find(
    candidate => candidate.id === id
  );

  expect(item).toBeTruthy();
  return item;
}

function operationCode(operation) {
  return operation.id
    .slice(0, 8)
    .toUpperCase();
}

test.afterAll(async () => {
  await cleanupLocalE2ESessions();
  expect(
    await countLocalE2ESessions()
  ).toBe(0);
});

test('real local Add Credits lifecycle, queue, trainer reads, and cleanup', async ({
  context,
  page
}) => {
  const submitRequests = [];
  page.on('request', request => {
    const pathname =
      new URL(request.url()).pathname;

    if (/\/api\/.*\/submit$/.test(pathname)) {
      submitRequests.push({
        method: request.method(),
        pathname
      });
    }
  });

  await page.goto('/');
  await page.getByLabel('First Name')
    .fill(E2E_TRAINEE_PREFIX);
  await page.getByLabel('Last Name')
    .fill('Playwright');
  await page.getByRole('button', {
    name: 'Continue →'
  }).click();

  const sessionResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          '/api/sessions/start'
      );
    });

  await page.getByRole('button', {
    name: /Start Simulation/
  }).click();

  const sessionResponse =
    await sessionResponsePromise;
  expect(sessionResponse.ok()).toBe(true);
  const sessionPayload =
    await sessionResponse.json();
  const sessionId =
    sessionPayload.session.id;

  await expect(page.getByRole('heading', {
    name: 'Operations Dashboard'
  })).toBeVisible();

  const scenario =
    await seedDeterministicScenario(
      sessionId
    );

  expect(scenario.queue).toEqual({
    duplicateMovementRejected: true,
    sameGameRequestRejected: true,
    pendingCount: 4
  });

  await page.reload();
  await expect(page.getByRole('button', {
    name: 'Movements (2)'
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Requests (2)'
  }).click();
  await expect(
    page.getByTestId(
      `operation-${scenario.operations.orionRequest.id}`
    )
  ).toContainText('Orion Stars');
  await expect(
    page.getByTestId(
      `operation-${scenario.operations.vblinkRequest.id}`
    )
  ).toContainText('Vblink');

  await page.getByRole('button', {
    name: 'Customers',
    exact: true
  }).click();
  const johnCustomerRow =
    page.getByRole('row')
      .filter({ hasText: 'johndoe' });
  await expect(johnCustomerRow).toContainText(
    `$${(
      scenario.initial.johnCustomerBalance - 40
    ).toFixed(2)}`
  );

  await page.goto(
    `/games/orion-stars/${sessionId}`
  );
  await expect(page).toHaveTitle('Orion Stars');
  await page.getByPlaceholder('ID or Account')
    .fill(scenario.usernames.johnOrion);
  await page.getByRole('button', {
    name: 'Search',
    exact: true
  }).click();

  const accountRow = page.getByRole('row')
    .filter({
      hasText: scenario.usernames.johnOrion
    })
    .filter({
      has: page.getByRole('button', {
        name: 'Update'
      })
    });
  await accountRow.getByRole('button', {
    name: 'Update'
  }).click();

  await expect(page.getByTestId('orion-wallet-balance')).toHaveText(
    `Balance:${scenario.initial.orionWalletBalance}`
  );

  await page.getByRole('button', {
    name: 'Recharge'
  }).click();
  await page.getByLabel('Amount').fill('40');

  const rechargeResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/games/accounts/${scenario.ids.johnOrionAccount}/recharge`
      );
    });

  await page.getByRole('button', {
    name: 'Recharge',
    exact: true
  }).last().click();
  expect(
    (await rechargeResponsePromise).ok()
  ).toBe(true);
  await expect(page.getByRole('alertdialog'))
    .toContainText('Successful operation.');
  await page.getByRole('alertdialog')
    .getByRole('button', { name: 'OK' })
    .click();

  await expect(page.getByTestId('orion-wallet-balance')).toHaveText(
    `Balance:${scenario.initial.orionWalletBalance - 40}`
  );
  await expect(page.getByTestId('orion-player-credit')).toHaveText(
    String(scenario.initial.johnOrionBalance + 40)
  );

  await page.getByRole('main').getByRole('button', {
    name: 'Transaction Records',
    exact: true
  }).click();
  await expect(page.getByRole('cell', {
    name: 'GAME ADD CREDITS'
  })).toBeVisible();
  await expect(page.getByRole('cell', {
    name: '40',
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Close'
  }).click();

  const createdOrionId =
    `orion-e2e-${sessionId.slice(0, 8)}`;
  const createdOrionPassword =
    'orion-e2e-fixture-password';
  await page.getByRole('button', {
    name: 'Create Player'
  }).click();
  await page.getByLabel('Account', { exact: true })
    .fill(createdOrionId);
  await page.getByLabel('Login password', {
    exact: true
  })
    .fill(createdOrionPassword);
  await page.getByLabel('Confirm password', {
    exact: true
  })
    .fill(createdOrionPassword);

  const createAccountResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        decodeURIComponent(
          new URL(response.url()).pathname
        ) ===
          `/api/games/${sessionId}/Orion Stars/accounts`
      );
    });
  await page.getByRole('dialog', {
    name: 'Create Player'
  }).getByRole('button', {
    name: 'Create Player',
    exact: true
  }).click();
  const createAccountResponse =
    await createAccountResponsePromise;
  expect(createAccountResponse.ok()).toBe(true);
  const createAccountPayload =
    await createAccountResponse.json();
  expect(
    createAccountPayload.adapterOutcome
      .accountStructureEvaluation
  ).toEqual({
    enforced: false,
    status: 'NOT_EVALUATED'
  });
  expect(
    createAccountPayload.adapterOutcome
      .evidence.gameUsername
  ).toBe(createdOrionId);
  expect(createAccountPayload.nickname)
    .toBe(createdOrionId);
  expect(
    JSON.stringify(
      createAccountPayload.adapterOutcome
    )
  ).not.toContain(createdOrionPassword);
  await expect(page.getByRole('alertdialog'))
    .toContainText(
      'Player account created successfully.'
    );
  await page.getByRole('alertdialog')
    .getByRole('button', { name: 'OK' })
    .click();

  await page.goto('/');
  await page.getByRole('button', {
    name: 'Requests (2)'
  }).click();
  const createRequestRow =
    page.getByTestId(
      `operation-${scenario.operations.orionRequest.id}`
    );
  await expect(createRequestRow)
    .toContainText('CREATE ACCOUNT');
  await createRequestRow.getByRole('button')
    .click();
  await page.getByLabel('New Game ID')
    .fill(createdOrionId);
  await page.getByLabel('New Password')
    .fill(createdOrionPassword);
  await expect(page.getByLabel('Kiosk'))
    .toHaveValue('OrionStars');

  const backendConfirmResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/operations/${scenario.operations.orionRequest.id}/process`
      );
    });
  await page.getByRole('button', {
    name: 'Confirm'
  }).click();
  const backendConfirmResponse =
    await backendConfirmResponsePromise;
  expect(backendConfirmResponse.ok()).toBe(true);
  const backendConfirmPayload =
    await backendConfirmResponse.json();
  expect(backendConfirmPayload.isCorrect)
    .toBe(true);
  expect(
    backendConfirmPayload.completionEvidence
  ).toMatchObject({
    artifactType: 'CREATED_GAME_ACCOUNT',
    game: 'Orion Stars',
    gameUsername: createdOrionId,
    originatingOperationId:
      scenario.operations.orionRequest.id,
    publicationStatus: 'CANDIDATE_ONLY'
  });
  expect(
    JSON.stringify(
      backendConfirmPayload.completionEvidence
    )
  ).not.toContain(createdOrionPassword);
  await expect(createRequestRow).toHaveCount(0);

  await page.getByRole('button', {
    name: 'Movements (2)'
  }).click();
  await expect(
    page.getByTestId(
      `operation-${scenario.operations.addCredits.id}`
    )
  ).toBeVisible();

  const approveResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/operations/${scenario.operations.addCredits.id}/process`
      );
    });

  await page.getByTestId(
    `operation-${scenario.operations.addCredits.id}`
  ).getByRole('button', {
    name: 'Approve'
  }).click();
  expect(
    (await approveResponsePromise).ok()
  ).toBe(true);

  await expect(
    page.getByTestId(
      `operation-${scenario.operations.addCredits.id}`
    )
  ).toHaveCount(0);

  let snapshot =
    await getScenarioSnapshot(sessionId);
  const johnAfterApproval = findById(
    snapshot.customers,
    scenario.ids.johnCustomer
  );
  const johnOrionAfterApproval = findById(
    snapshot.accounts,
    scenario.ids.johnOrionAccount
  );
  const orionWalletAfterApproval =
    snapshot.wallets.find(
      wallet => wallet.game === 'Orion Stars'
    );
  const approvedOperation = findById(
    snapshot.operations,
    scenario.operations.addCredits.id
  );

  expect(Number(johnAfterApproval.balance)).toBe(
    scenario.initial.johnCustomerBalance - 40
  );
  expect(Number(johnOrionAfterApproval.balance)).toBe(
    scenario.initial.johnOrionBalance + 40
  );
  expect(Number(orionWalletAfterApproval.balance)).toBe(
    scenario.initial.orionWalletBalance - 40
  );
  expect(
    Number(johnOrionAfterApproval.balance) +
      Number(orionWalletAfterApproval.balance)
  ).toBe(
    scenario.initial.johnOrionBalance +
      scenario.initial.orionWalletBalance
  );
  expect(approvedOperation.status).toBe(
    'APPROVED'
  );
  expect(
    approvedOperation
      .customer_reservation_status
  ).toBe('COMMITTED');

  const approvedCode =
    operationCode(
      scenario.operations.addCredits
    );
  const matchingGameHistory =
    snapshot.gameHistory.filter(item =>
      item.game_account_id ===
        scenario.ids.johnOrionAccount &&
      item.type === 'GAME ADD CREDITS' &&
      Number(item.amount) === 40
    );
  const matchingCustomerHistory =
    snapshot.customerHistory.filter(item =>
      item.customer_id ===
        scenario.ids.johnCustomer &&
      item.type === 'ADD CREDITS' &&
      Number(item.amount) === 40 &&
      String(item.description)
        .includes(approvedCode)
    );

  expect(matchingGameHistory).toHaveLength(1);
  expect(matchingCustomerHistory).toHaveLength(1);
  expect(
    snapshot.gameHistory.every(item =>
      item.type.startsWith('GAME ')
    )
  ).toBe(true);
  expect(
    snapshot.customerHistory.every(item =>
      !item.type.startsWith('GAME ')
    )
  ).toBe(true);

  const cancelResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/operations/${scenario.operations.cancelledAddCredits.id}/process`
      );
    });

  await page.getByTestId(
    `operation-${scenario.operations.cancelledAddCredits.id}`
  ).getByRole('button', {
    name: 'Cancel'
  }).click();
  expect(
    (await cancelResponsePromise).ok()
  ).toBe(true);

  const repeatedCancellation =
    await context.request.post(
      `${process.env.TREZ_E2E_BACKEND_URL}/api/operations/${scenario.operations.cancelledAddCredits.id}/process`,
      {
        data: {
          action: 'CANCELLED',
          traineeName,
          requestData: {}
        }
      }
    );
  expect(repeatedCancellation.status()).toBe(400);

  snapshot =
    await getScenarioSnapshot(sessionId);
  const janeAfterCancellation = findById(
    snapshot.customers,
    scenario.ids.janeCustomer
  );
  const cancelledOperation = findById(
    snapshot.operations,
    scenario.operations.cancelledAddCredits.id
  );
  const cancelledCode =
    operationCode(
      scenario.operations.cancelledAddCredits
    );
  const cancellationHistory =
    snapshot.customerHistory.filter(item =>
      item.customer_id ===
        scenario.ids.janeCustomer &&
      item.type === 'ADD CREDITS' &&
      Number(item.amount) === 30 &&
      String(item.description)
        .includes(cancelledCode)
    );

  expect(Number(janeAfterCancellation.balance)).toBe(
    scenario.initial.janeCustomerBalance
  );
  expect(cancelledOperation.status).toBe(
    'CANCELLED'
  );
  expect(
    cancelledOperation
      .customer_reservation_status
  ).toBe('RELEASED');
  expect(cancellationHistory).toHaveLength(1);

  const stopResponsePromise =
    page.waitForResponse(response => {
      const request = response.request();
      return (
        request.method() === 'POST' &&
        new URL(response.url()).pathname ===
          `/api/sessions/${sessionId}/stop`
      );
    });

  await page.getByRole('button', {
    name: /End Simulation/
  }).click();
  await page.getByRole('button', {
    name: 'Yes, End Session'
  }).click();
  const stopResponse =
    await stopResponsePromise;
  expect(stopResponse.ok()).toBe(true);
  const stopPayload =
    await stopResponse.json();
  expect(stopPayload.session.status).toBe(
    'completed'
  );
  await expect(page.getByRole('heading', {
    name: /finished the module/i
  })).toBeVisible();
  expect(submitRequests).toEqual([]);

  const trainerPage =
    await context.newPage();
  await trainerPage.addInitScript(() => {
    localStorage.setItem(
      'token',
      'allow_trainer_access'
    );
  });

  const trainerRequests = [];
  trainerPage.on('request', request => {
    const pathname =
      new URL(request.url()).pathname;

    if (pathname.startsWith('/api/trainer/')) {
      trainerRequests.push({
        method: request.method(),
        pathname
      });
    }
  });

  await trainerPage.goto('/trainer');
  await expect(trainerPage.getByRole(
    'heading',
    { name: 'Trainer Command' }
  )).toBeVisible();
  await trainerPage.getByRole('button', {
    name: new RegExp(E2E_TRAINEE_PREFIX)
  }).click();
  await trainerPage.getByRole('button', {
    name: 'Open'
  }).click();
  await trainerPage.getByRole('button', {
    name: 'Report'
  }).click();

  await expect(trainerPage.getByText(
    /Prototype evaluation metrics/
  )).toBeVisible();
  await expect(trainerPage.getByText(
    'Pending approval'
  )).toBeVisible();
  await expect(trainerPage.getByText(
    '3 / 4',
    { exact: true }
  )).toBeVisible();

  await trainerPage.getByRole('button', {
    name: 'Audit Log'
  }).click();
  await expect(trainerPage.getByText(
    'Operation Approved',
    { exact: true }
  )).toHaveCount(2);
  await expect(trainerPage.getByText(
    'Operation Cancelled',
    { exact: true }
  )).toBeVisible();

  expect(
    trainerRequests.filter(request =>
      request.method !== 'GET'
    )
  ).toEqual([]);

  await cleanupLocalE2ESessions();
  expect(
    await countLocalE2ESessions()
  ).toBe(0);
});
