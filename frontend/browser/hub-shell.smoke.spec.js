import { expect, test } from '@playwright/test';

const identity = {
  subject: {
    id: 'external-subject-1',
    roles: ['POSTULANTE'],
  },
};

const learningPath = {
  enrolments: [
    {
      id: 'enrolment-1',
      status: 'assigned',
      course: {
        id: 'course-1',
        code: 'operator-foundations',
        title: 'Operator foundations',
        description: 'Assigned conceptual and workflow orientation.',
        provisional: true,
        scored: false,
      },
      modules: [
        {
          id: 'module-1',
          code: 'understanding-the-work',
          position: 1,
          title: 'Understanding the work',
          summary: 'Learn the operating context and responsibilities before detailed procedures.',
          provisional: true,
          scored: false,
          status: 'in_progress',
          available: true,
          prerequisiteModuleIds: [],
          activities: [
            {
              id: 'article-1',
              type: 'article',
              position: 1,
              title: 'The Trez operating ecosystem',
              provisional: true,
              scored: false,
              status: 'not_started',
              content: { paragraphs: ['Customers, licensed access, Trez Backend, and external game platforms form one traceable workflow.'] },
            },
            {
              id: 'checklist-1',
              type: 'checklist',
              position: 2,
              title: 'Verification-first review',
              provisional: true,
              scored: false,
              status: 'not_started',
              content: { items: ['Confirm the assigned licensed access', 'Verify before changing an account or balance'] },
            },
          ],
        },
        {
          id: 'module-2',
          code: 'complete-workflow-orientation',
          position: 2,
          title: 'Complete workflow orientation',
          summary: 'Preview the end-to-end operator workflow.',
          provisional: true,
          scored: false,
          status: 'not_started',
          available: false,
          prerequisiteModuleIds: ['module-1'],
          activities: [],
        },
      ],
    },
  ],
};

const singleActivityPath = (module, activity) => ({
  enrolments: [{
    id: 'enrolment-policy-neutral',
    status: 'in_progress',
    course: {
      id: 'course-1',
      code: 'operator-foundations',
      title: 'Operator foundations',
      description: 'Provisional Module 3-4 infrastructure.',
      provisional: true,
      scored: false,
    },
    modules: [{
      id: module.id,
      code: module.code,
      position: module.position,
      title: module.title,
      summary: module.summary,
      provisional: true,
      scored: false,
      status: 'in_progress',
      available: true,
      prerequisiteModuleIds: [],
      activities: [activity],
    }],
  }],
});

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('**/socket.io/**', (webSocket) => webSocket.close());
  await page.route('**/api/hub/auth/csrf', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ csrfToken: 'browser-test-csrf' }),
  }));
  await page.route('**/api/hub/staff/postulantes', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ postulantes: [] }) }));
  await page.route('**/api/hub/staff/courses', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [] }) }));
  await page.route('**/api/hub/assessment/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { duration_minutes: 30, minimum_operations: 2, maximum_operations: 6, operation_types: ['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD'], advanced_enabled: false, revision: 1 } }) }));
  await page.route('**/api/hub/assessment/report**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ attempts: [], statistics: { attempts: 0, progressOverTime: [] } }) }));
  await page.route('**/api/hub/assessment/evaluations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluations: [], gameFamilies: [], attemptSets: [], attempts: [], reopenEvents: [] }) }));
  await page.route('**/api/hub/scored-evaluations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ evaluations: [] }) }));
});

test('fails closed when the server has no configured identity provider', async ({ page }) => {
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Authentication provider is not configured.' }),
  }));

  await page.goto('/hub');

  await expect(page.getByRole('heading', { name: 'Training Hub is not configured' })).toBeVisible();
  await expect(page.getByText('Authentication provider is not configured.')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('submits username and password with CSRF when a session is required', async ({ page }) => {
  let request;
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'Authentication is required.' } }),
  }));
  await page.route('**/api/hub/auth/login', async (route) => {
    request = {
      body: route.request().postDataJSON(),
      csrf: route.request().headers()['x-trez-csrf'],
    };
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'The username or password is incorrect.' } }) });
  });

  await page.goto('/hub');
  await page.getByLabel('Username').fill('Jperez');
  await page.getByLabel('Password').fill('Jperez');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('The username or password is incorrect.')).toBeVisible();
  await expect(page.getByText('TRAINER and RRHH create Postulante accounts; ADMIN creates TRAINER accounts. Email addresses are not used to sign in.')).toBeVisible();
  expect(request.body).toEqual({ username: 'Jperez', password: 'Jperez' });
  expect(request.csrf).toBe('browser-test-csrf');
});

test('renders assigned modules, prerequisites, and completes an article through the API', async ({ page }) => {
  let pathReadCount = 0;
  let completionRequest;

  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(identity),
  }));
  await page.route('**/api/hub/learning-path', (route) => {
    pathReadCount += 1;
    const response = structuredClone(learningPath);
    if (pathReadCount > 1) {
      response.enrolments[0].modules[0].activities[0].status = 'completed';
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/hub/activities/article-1/complete', async (route) => {
    completionRequest = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/hub');

  await expect(page.getByRole('heading', { name: 'Operator foundations' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Español' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Understanding the work' })).toBeVisible();
  await page.getByRole('button', { name: /Complete workflow orientation/ }).click();
  await expect(page.getByText('Provisional learning content')).toBeVisible();
  await expect(page.getByText('Complete the listed prerequisites')).toBeVisible();

  await page.getByRole('button', { name: /Understanding the work/ }).click();
  await page.getByRole('button', { name: 'Mark article complete' }).click();

  await expect(page.getByText('The Trez operating ecosystem progress was saved.')).toBeVisible();
  expect(completionRequest.state).toEqual({});
  expect(completionRequest.idempotencyKey).toEqual(expect.any(String));
  await expect(page.getByRole('article').first().getByText('Completed')).toBeVisible();
});

test('POSTULANTE sees numerical scored results without detailed failure evidence and submits only the latest attempt', async ({ page }) => {
  let submittedAttemptId;
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(learningPath) }));
  await page.route('**/api/hub/scored-evaluations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ evaluations: [{
      id: '10000000-0000-4000-8000-000000000401', stable_code: 'checkpoint-game-platforms', title: 'Checkpoint 1 — Game Platforms', position: 1,
      publication_status: 'published', is_provisional: false, theory_weight: 20, practical_weight: 80, pass_score: 100,
      attemptsRemaining: 2, canSubmit: true, requiresTrainerReopen: false, attemptSet: { status: 'open' },
      attempts: [{ id: '10000000-0000-4000-8000-000000000499', attempt_in_set: 1, status: 'scored', result_status: 'unsuccessful', score: 80, failure_points: ['SECRET_FAILURE_DETAIL'] }],
    }] }),
  }));
  await page.route('**/api/hub/scored-evaluations/attempts/*/submit', async (route) => {
    submittedAttemptId = route.request().url().split('/').at(-2);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { submitted: true, score: 80 } }) });
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/hub');
  await expect(page.getByRole('heading', { name: 'Checkpoint and readiness results' })).toBeVisible();
  await expect(page.getByText('Unsuccessful · 80%')).toBeVisible();
  await expect(page.getByText('Attempts remaining: 2 of 3')).toBeVisible();
  await expect(page.getByText('SECRET_FAILURE_DETAIL')).toHaveCount(0);
  await page.getByRole('button', { name: 'Send latest result' }).click();
  await expect(page.getByText('Checkpoint 1 — Game Platforms result submitted.')).toBeVisible();
  expect(submittedAttemptId).toBe('10000000-0000-4000-8000-000000000499');
});

test('POSTULANTE reuses a scored-attempt start key after an uncertain response', async ({ page }) => {
  const evaluationId = '10000000-0000-4000-8000-000000000401';
  const receivedKeys = [];
  let startCalls = 0;
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(learningPath) }));
  await page.route('**/api/hub/scored-evaluations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ evaluations: [{
      id: evaluationId, stable_code: 'checkpoint-game-platforms', title: 'Checkpoint 1 — Game Platforms', position: 1,
      publication_status: 'published', is_provisional: false, theory_weight: 20, practical_weight: 80,
      attemptsRemaining: startCalls > 1 ? 2 : 3, canSubmit: false, requiresTrainerReopen: false,
      attemptSet: startCalls > 1 ? { status: 'open' } : null,
      attempts: startCalls > 1 ? [{ id: '10000000-0000-4000-8000-000000000498', attempt_in_set: 1, status: 'in_progress' }] : [],
    }] }),
  }));
  await page.route(`**/api/hub/scored-evaluations/${evaluationId}/attempts`, async (route) => {
    startCalls += 1;
    receivedKeys.push((await route.request().postDataJSON()).idempotencyKey);
    if (startCalls === 1) return route.abort('connectionreset');
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ attempt: { attemptInSet: 1 } }) });
  });

  await page.goto('/hub');
  await page.getByRole('button', { name: 'Start next attempt' }).click();
  await expect(page.getByText('The scored attempt could not be started.')).toBeVisible();
  await page.getByRole('button', { name: 'Start next attempt' }).click();
  await expect(page.getByText('Checkpoint 1 — Game Platforms attempt started.')).toBeVisible();
  expect(receivedKeys).toHaveLength(2);
  expect(receivedKeys[0]).toBe(receivedKeys[1]);
});

test('reuses an activity idempotency key after an uncertain completion response', async ({ page }) => {
  const receivedKeys = [];
  let completionCalls = 0;

  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(identity),
  }));
  await page.route('**/api/hub/learning-path', (route) => {
    const response = structuredClone(learningPath);
    if (completionCalls > 1) {
      response.enrolments[0].modules[0].activities[0].status = 'completed';
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/hub/activities/article-1/complete', async (route) => {
    completionCalls += 1;
    receivedKeys.push(route.request().postDataJSON().idempotencyKey);
    if (completionCalls === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Completion result is temporarily unavailable.' } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/hub');
  const completeButton = page.getByRole('button', { name: 'Mark article complete' });
  await completeButton.click();
  await expect(page.getByText('Completion result is temporarily unavailable.')).toBeVisible();
  await completeButton.click();

  await expect(page.getByText('The Trez operating ecosystem progress was saved.')).toBeVisible();
  expect(receivedKeys).toHaveLength(2);
  expect(receivedKeys[1]).toBe(receivedKeys[0]);
});

test('Module 3 rule lab fails closed without an approved game policy', async ({ page }) => {
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(identity),
  }));
  await page.route('**/api/hub/learning-path', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(singleActivityPath({
      id: 'module-3', code: 'account-creation', position: 3, title: 'Account Creation', summary: 'Policy-gated account creation.',
    }, {
      id: 'rule-lab-blocked', type: 'interactive_rule_lab', position: 2, title: 'Account ID Lab',
      provisional: true, scored: false, status: 'not_started',
      content: { policyStatus: 'required', blockedReason: 'Trez approval is required.' },
    })),
  }));

  await page.goto('/hub');
  await expect(page.getByText('Approved game policy required')).toBeVisible();
  await expect(page.getByText('Trez approval is required.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete rule practice' })).toHaveCount(0);
});

test('Module 3 native rule lab submits only the server-assigned policy version and validation', async ({ page }) => {
  let completionState;
  const path = singleActivityPath({
    id: 'module-3', code: 'account-creation', position: 3, title: 'Account Creation', summary: 'Native rule practice.',
  }, {
    id: 'rule-lab-approved', type: 'interactive_rule_lab', position: 2, title: 'Account ID Lab',
    provisional: true, scored: false, status: 'not_started',
    content: {
      policyStatus: 'approved',
      policyVersionId: 'neutral-policy-version-1',
      customerUsername: 'player1',
      policy: {
        key: 'neutral-fixture', label: 'Neutral fixture',
        segments: [
          { kind: 'literal', key: 'prefix', label: 'Approved prefix', value: 'T' },
          { kind: 'customer', key: 'customer', label: 'Customer username' },
        ],
      },
    },
  });
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path) }));
  await page.route('**/api/hub/activities/rule-lab-approved/complete', (route) => {
    completionState = route.request().postDataJSON().state;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activityStatus: 'completed' }) });
  });

  await page.goto('/hub');
  await page.getByLabel('Constructed identifier').fill('Tplayer1');
  await page.getByRole('button', { name: 'Check identifier' }).click();
  await expect(page.getByText('Identifier matches the assigned policy.')).toBeVisible();
  await page.getByRole('button', { name: 'Complete rule practice' }).click();
  await expect(page.getByText('Account ID Lab progress was saved.')).toBeVisible();

  expect(completionState).toEqual({
    policyVersionId: 'neutral-policy-version-1',
    policyKey: 'neutral-fixture',
    customerUsername: 'player1',
    answer: 'Tplayer1',
    validation: { correct: true, policyCorrect: true, valueCorrect: true },
  });
});

test('Module 4 records application-controlled Ctrl+F and real paste evidence for the exact artifact target', async ({ page, context }) => {
  let completionState;
  const path = singleActivityPath({
    id: 'module-4', code: 'search-for-customer', position: 4, title: 'Search for Customer', summary: 'Exact-player search.',
  }, {
    id: 'search-practice', type: 'focused_practice', position: 2, title: 'Search for the Module 3 player',
    provisional: true, scored: false, status: 'not_started',
    content: {
      artifactStatus: 'available',
      target: { identifier: 'player-42', sourceArtifactId: 'artifact-42', game: 'Neutral test game', license: 'Test license' },
    },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(path) }));
  await page.route('**/api/hub/activities/search-practice/complete', (route) => {
    completionState = route.request().postDataJSON().state;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activityStatus: 'completed' }) });
  });

  await page.goto('/hub');
  await page.locator('.hub-search-practice').press('Control+F');
  await expect(page.getByLabel('Player search')).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('player-42'));
  await page.getByLabel('Player search').press('Control+V');
  await expect(page.getByText('Exact player identifier found.')).toBeVisible();
  await page.getByLabel('I positively confirmed the exact player without changing account or balance data.').check();
  await page.getByRole('button', { name: 'Complete exact-player search' }).click();
  await expect(page.getByText('Search for the Module 3 player progress was saved.')).toBeVisible();

  expect(completionState).toEqual({
    sourceArtifactId: 'artifact-42', targetGame: 'Neutral test game', targetLicense: 'Test license',
    searchProcedure: {
      ctrlFObserved: true, ctrlVObserved: true, exactQuery: 'player-42',
      matchedIdentifier: 'player-42', exactMatch: true, confirmed: true,
    },
  });
});

test('Module 5 uses an embedded untimed Orion balance surface and submits the observed values to the Hub', async ({ page }) => {
  let refreshRequest;
  let pathReads = 0;
  const path = singleActivityPath(
    { id: 'module-5', code: 'refresh-balance', position: 5, title: 'Refresh Balance', summary: 'Focused balance practice.' },
    {
      id: 'orion-refresh', type: 'focused_practice', position: 1,
      title: 'Check the Orion Stars balance and update Trez Backend',
      provisional: true, scored: false, status: 'not_started',
      content: {
        surface: 'balance', game: 'Orion Stars', operation: 'REFRESH BALANCE',
        gameOptions: [
          { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
          { id: 'vblink', label: 'Vblink', status: 'not_ready' },
          { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
        ],
        instructions: ['Open the focused Orion Stars practice surface.', 'Read the game-side Credit and Available Balance values.'],
      },
    }
  );
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => {
    pathReads += 1;
    const response = structuredClone(path);
    if (pathReads > 1) response.enrolments[0].modules[0].activities[0].status = 'completed';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  let startRequests = 0;
  await page.route('**/api/hub/activities/orion-refresh/focused-practice/start', (route) => {
    startRequests += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      game: 'Orion Stars', surface: 'balance', timedSimulator: false,
      context: { activityAttemptId: 'activity-attempt-5', attemptId: 'attempt-5' },
      accounts: [{ id: 'orion-account-5', gameUsername: 'johndoe_os', credit: 100, customer: { id: 'customer-5', username: 'johndoe' } }],
      availableBalance: 20000,
    }) });
  });
  await page.route('**/api/hub/activities/orion-refresh/focused-practice/refresh-balance', async (route) => {
    refreshRequest = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ verified: true }) });
  });

  await page.goto('/hub');
  await page.getByRole('button', { name: /Refresh Balance/ }).click();
  await expect(page.getByRole('tab', { name: 'Orion Stars' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Vblink/ })).toBeDisabled();
  await expect(page.getByRole('tab', { name: /Golden Dragon/ })).toBeDisabled();
  await page.evaluate(() => document.getElementById('hub-game-tab-vblink')?.click());
  await expect(page.getByRole('tab', { name: 'Orion Stars' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Open focused Orion Stars view' }).click();
  await expect(page.getByRole('region', { name: 'Orion Stars balance page' })).toBeVisible();
  expect(startRequests).toBe(1);
  await expect(page.getByText('This is a focused game surface. It does not start the timed simulator.')).toBeVisible();
  await page.getByLabel('Observed Credit').fill('100');
  await page.getByLabel('Observed Available Balance').fill('20000');
  await page.getByRole('button', { name: 'Update Trez Backend' }).click();

  await expect(page.getByText('Check the Orion Stars balance and update Trez Backend progress was saved.')).toBeVisible();
  expect(refreshRequest).toMatchObject({
    accountId: 'orion-account-5', observedCredit: 100, observedAvailableBalance: 20000,
  });
  expect(refreshRequest.idempotencyKey).toEqual(expect.any(String));
});

test('Module 6 reserves Add Credits, performs one game action, and approves the existing Backend movement', async ({ page }) => {
  let pathReads = 0;
  let approvalRequest;
  const activity = {
    id: 'orion-add-credits', type: 'focused_practice', position: 3,
    title: 'Perform the Orion Stars Add Credits movement', provisional: true, scored: false, status: 'not_started',
    content: {
      surface: 'add_credits', game: 'Orion Stars', operation: 'ADD CREDITS', amount: 25,
      gameOptions: [
        { id: 'orion-stars', label: 'Orion Stars', status: 'available' },
        { id: 'vblink', label: 'Vblink', status: 'not_ready' },
        { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' },
      ],
      instructions: ['Verify before acting.', 'Perform one game-side credit.', 'Approve once after evidence exists.'],
    },
  };
  const path = singleActivityPath(
    { id: 'module-6', code: 'add-credits', position: 6, title: 'Add Credits', summary: 'Verification-first financial movement.' },
    activity,
  );
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => {
    pathReads += 1;
    const response = structuredClone(path);
    if (pathReads > 1) response.enrolments[0].modules[0].activities[0].status = 'completed';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/hub/activities/orion-add-credits/focused-practice/add-credits/start', (route) => route.fulfill({
    status: 201, contentType: 'application/json', body: JSON.stringify({
      game: 'Orion Stars', surface: 'add_credits', timedSimulator: false,
      context: { activityAttemptId: 'activity-attempt-add', attemptId: 'attempt-add', operationId: 'operation-add' },
      account: { id: 'orion-account-add', gameUsername: 'johndoe_os', customer: { id: 'customer-add', username: 'johndoe' } },
      operation: {
        id: 'operation-add', type: 'ADD CREDITS', amount: 25, status: 'PENDING',
        customerReservationStatus: 'HELD', customerBalanceAtRequest: 500, customerBalance: 475,
        gameCreditAtRequest: 100, gameCredit: 100, gameWalletBalance: 20000, gameActionExecuted: false,
      },
    }),
  }));
  await page.route('**/api/hub/activities/orion-add-credits/focused-practice/add-credits/recharge', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      game: 'Orion Stars', surface: 'add_credits', timedSimulator: false,
      context: { activityAttemptId: 'activity-attempt-add', attemptId: 'attempt-add', operationId: 'operation-add' },
      account: { id: 'orion-account-add', gameUsername: 'johndoe_os', customer: { id: 'customer-add', username: 'johndoe' } },
      operation: {
        id: 'operation-add', type: 'ADD CREDITS', amount: 25, status: 'PENDING',
        customerReservationStatus: 'HELD', customerBalanceAtRequest: 500, customerBalance: 475,
        gameCreditAtRequest: 100, gameCredit: 125, gameWalletBalance: 19975, gameActionExecuted: true,
      },
    }),
  }));
  await page.route('**/api/hub/activities/orion-add-credits/focused-practice/add-credits/approve', async (route) => {
    approvalRequest = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ operation: { status: 'APPROVED' }, completion: { activityStatus: 'completed' } }) });
  });

  await page.goto('/hub');
  await page.getByRole('button', { name: 'Add Credits Available' }).click();
  await expect(page.getByRole('tab', { name: /Vblink/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Open focused Orion Stars Add Credits view' }).click();
  await expect(page.getByText('Customer balance after reservation')).toBeVisible();
  await expect(page.getByText('475')).toBeVisible();
  await page.getByRole('button', { name: 'Add 25 credits in Orion Stars' }).click();
  await expect(page.getByRole('button', { name: 'Game credit recorded' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve movement' }).click();
  await expect(page.getByText('Perform the Orion Stars Add Credits movement progress was saved.')).toBeVisible();
  expect(approvalRequest).toMatchObject({ action: 'APPROVED', accountId: 'orion-account-add', amount: 25, gameActionExecuted: true });
  expect(approvalRequest.idempotencyKey).toEqual(expect.any(String));
});

test('Module 7 performs one Orion Stars withdrawal and approves the existing Backend movement', async ({ page }) => {
  let pathReads = 0;
  let approvalRequest;
  const activity = { id: 'orion-withdraw-credits', type: 'focused_practice', position: 3, title: 'Perform the Orion Stars Withdraw Credits movement', provisional: true, scored: false, status: 'not_started', content: { surface: 'withdraw_credits', game: 'Orion Stars', operation: 'WITHDRAW CREDITS', amount: 25, gameOptions: [{ id: 'orion-stars', label: 'Orion Stars', status: 'available' }, { id: 'vblink', label: 'Vblink', status: 'not_ready' }, { id: 'golden-dragon', label: 'Golden Dragon', status: 'not_ready' }], instructions: ['Verify before acting.'] } };
  const path = singleActivityPath({ id: 'module-7', code: 'withdraw-credits', position: 7, title: 'Withdraw Credits', summary: 'Verification-first withdrawal.' }, activity);
  await page.route('**/api/hub/context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.route('**/api/hub/learning-path', (route) => { pathReads += 1; const response = structuredClone(path); if (pathReads > 1) response.enrolments[0].modules[0].activities[0].status = 'completed'; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }); });
  const state = (executed, approved = false) => ({ game: 'Orion Stars', surface: 'withdraw_credits', timedSimulator: false, context: { activityAttemptId: 'activity-attempt-withdraw', attemptId: 'attempt-withdraw', operationId: 'operation-withdraw' }, account: { id: 'orion-account-withdraw', gameUsername: 'johndoe_os', customer: { id: 'customer-withdraw', username: 'johndoe' } }, operation: { id: 'operation-withdraw', type: 'WITHDRAW CREDITS', amount: 25, status: approved ? 'APPROVED' : 'PENDING', customerBalanceAtRequest: 500, customerBalance: approved ? 525 : 500, gameCreditAtRequest: 100, gameCredit: executed ? 75 : 100, gameWalletBalance: executed ? 20025 : 20000, gameActionExecuted: executed } });
  await page.route('**/api/hub/activities/orion-withdraw-credits/focused-practice/withdraw-credits/start', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(state(false)) }));
  await page.route('**/api/hub/activities/orion-withdraw-credits/focused-practice/withdraw-credits/redeem', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state(true)) }));
  await page.route('**/api/hub/activities/orion-withdraw-credits/focused-practice/withdraw-credits/approve', async (route) => { approvalRequest = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...state(true, true), completion: { activityStatus: 'completed' } }) }); });
  await page.goto('/hub');
  await page.getByRole('button', { name: 'Withdraw Credits Available' }).click();
  await expect(page.getByRole('tab', { name: /Vblink/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Open focused Orion Stars Withdraw Credits view' }).click();
  await expect(page.getByText('Customer balance at request')).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw 25 credits in Orion Stars' }).click();
  await expect(page.getByRole('button', { name: 'Game withdrawal recorded' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve movement' }).click();
  await expect(page.getByText('Perform the Orion Stars Withdraw Credits movement progress was saved.')).toBeVisible();
  expect(approvalRequest).toMatchObject({ action: 'APPROVED', accountId: 'orion-account-withdraw', amount: 25, gameActionExecuted: true });
});

test('ADMIN is limited to debugging and TRAINER account administration', async ({ page }) => {
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      subject: {
        id: 'administrator-subject-1',
        displayName: 'Admin Example',
        roles: ['ADMIN'],
      },
    }),
  }));
  await page.route('**/api/hub/admin/accounts', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [] }) }));

  await page.goto('/hub');
  await expect(page.getByRole('heading', { name: 'TRAINER account administration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All Postulante progress' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Postulante management' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByText('Nombre provisional del producto — sujeto a validación de Trez')).toBeVisible();
  await expect(page.locator('.hub-app-shell')).toHaveAttribute('lang', 'es');
});

test('ADMIN creates a TRAINER with the generated username as the initial password', async ({ page }) => {
  let createdAccount;
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ subject: { id: 'admin-accounts-1', username: 'Ladmin', roles: ['ADMIN'] } }),
  }));
  await page.route('**/api/hub/trainer/postulantes', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ postulantes: [] }),
  }));
  await page.route('**/api/hub/admin/accounts', async (route) => {
    if (route.request().method() === 'POST') {
      createdAccount = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          identity: { id: 'trainer-1', username: 'Jperez', displayName: 'Juan Pérez', status: 'active' },
          roles: ['trainer'],
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accounts: createdAccount ? [{
          id: 'trainer-1', username: 'Jperez', displayName: 'Juan Pérez', roles: ['TRAINER'], status: 'active',
        }] : [],
      }),
    });
  });

  await page.goto('/hub');
  await page.getByLabel('First name').fill('Juan');
  await page.getByLabel('First surname').fill('Pérez');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('status')).toHaveText('Account created. Username and initial password: Jperez');
  expect(createdAccount).toEqual({ firstName: 'Juan', surname: 'Pérez', roles: ['trainer'], preferredLocale: 'en' });
  await expect(page.getByRole('cell', { name: 'Jperez' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to username' })).toBeVisible();
});

test('trainer can switch the progress view to Spanish', async ({ page }) => {
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      subject: {
        id: 'trainer-subject-1',
        roles: ['TRAINER'],
      },
    }),
  }));
  await page.route('**/api/hub/trainer/postulantes', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ postulantes: [] }),
  }));

  await page.goto('/hub');

  await expect(page.getByRole('heading', { name: 'All Postulante progress' })).toBeVisible();
  await expect(page.getByText('Trainer view')).toBeVisible();
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { name: 'Progreso de todos los Postulantes' })).toBeVisible();
  await expect(page.getByText('Vista de formador')).toBeVisible();
  await expect(page.locator('.hub-app-shell')).toHaveAttribute('lang', 'es');
});

test('TRAINER manages all Postulantes, assigns a course, and saves advanced assessment settings', async ({ page }) => {
  const postulantes = [{ id: 'postulante-1', username: 'Jperez', firstName: 'Juan', surname: 'Pérez', displayName: 'Juan Pérez', roles: ['POSTULANTE'], status: 'active' }];
  let settingsUpdate;
  let assignedCourse;
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ subject: { id: 'trainer-manager-1', roles: ['TRAINER'] } }),
  }));
  await page.route('**/api/hub/trainer/postulantes', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ postulantes: [] }) }));
  await page.route('**/api/hub/staff/postulantes', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ postulantes }) }));
  await page.route('**/api/hub/staff/courses', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [{ id: 'course-1', title: 'Operator Foundations', is_provisional: true }] }) }));
  await page.route('**/api/hub/trainer/postulantes/postulante-1/enrolments', async (route) => {
    assignedCourse = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ enrolment: { id: 'enrolment-1' } }) });
  });
  await page.route('**/api/hub/assessment/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      settingsUpdate = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { duration_minutes: settingsUpdate.durationMinutes, minimum_operations: settingsUpdate.minimumOperations, maximum_operations: settingsUpdate.maximumOperations, operation_types: settingsUpdate.operationTypes, advanced_enabled: settingsUpdate.advancedEnabled, revision: 2 } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { duration_minutes: 30, minimum_operations: 2, maximum_operations: 6, operation_types: ['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD'], advanced_enabled: false, revision: 1 } }) });
  });
  await page.route('**/api/hub/assessment/report**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ attempts: [], statistics: { attempts: 3, passRate: 67, latestScore: 100, progressOverTime: [{ date: '2026-08-27', attempts: 3, passed: 2 }] } }) }));

  await page.goto('/hub');
  await expect(page.getByRole('heading', { name: 'Postulante management' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Jperez' })).toBeVisible();
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('status')).toHaveText('Course assigned to Juan Pérez.');
  expect(assignedCourse).toEqual({ courseId: 'course-1' });

  await page.getByLabel('Duration (minutes)').fill('45');
  await page.getByLabel('Advanced Settings').check();
  await page.getByRole('checkbox', { name: 'RESET PASSWORD' }).uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Assessment settings saved. New attempts will use this configuration.');
  expect(settingsUpdate).toMatchObject({ durationMinutes: 45, minimumOperations: 2, maximumOperations: 6, advancedEnabled: true });
  expect(settingsUpdate.operationTypes).not.toContain('RESET PASSWORD');
  await expect(page.getByText(/Configuration revision 2/)).toBeVisible();
});

test('ADMIN does not request TRAINER Postulante visibility', async ({ page }) => {
  let trainerVisibilityRequests = 0;
  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      subject: {
        id: 'administrator-subject-2',
        roles: ['ADMIN'],
      },
    }),
  }));
  await page.route('**/api/hub/trainer/postulantes', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'This endpoint must not be called by ADMIN.' } }),
  }));
  page.on('request', (request) => { if (request.url().includes('/api/hub/trainer/postulantes')) trainerVisibilityRequests += 1; });
  await page.route('**/api/hub/admin/accounts', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accounts: [] }) }));

  await page.goto('/hub');
  await expect(page.getByRole('heading', { name: 'TRAINER account administration' })).toBeVisible();
  expect(trainerVisibilityRequests).toBe(0);
});

test('RRHH reads Hub completion and sanitized legacy failure reports without mutation requests', async ({ page }) => {
  const mutationRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/hub/') && request.method() !== 'GET') {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.route('**/api/hub/context', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      subject: {
        id: 'auditor-subject-1',
        displayName: 'RRHH Example',
        roles: ['RRHH'],
      },
    }),
  }));
  await page.route('**/api/hub/rrhh/overview**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      generatedAt: '2026-08-21T12:00:00.000Z',
      postulantes: [{
        identity: { id: 'learner-1', displayName: 'Learner One', status: 'active' },
      }],
      legacySimulatorSessions: [{
        id: 'legacy-unlinked-1',
        traineeName: 'Historical Label Only',
        status: 'submitted',
        lineage: {
          status: 'unlinked',
          hubAttemptIds: [],
          hubIdentityIds: [],
          reason: 'LEGACY_NAME_ONLY_SESSION',
        },
      }],
      pageInfo: {
        postulantes: { limit: 50, nextCursor: null },
        legacySimulatorSessions: { limit: 50, nextCursor: null },
      },
    }),
  }));
  await page.route('**/api/hub/rrhh/postulantes/learner-1/learning-records**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      postulante: { id: 'learner-1', displayName: 'Learner One', status: 'active' },
      moduleRecords: [{
        enrolment: { id: 'enrolment-1', status: 'in_progress' },
        course: { id: 'course-1', code: 'foundation', title: 'Server-authored Foundation Course' },
        module: {
          id: 'module-1',
          code: 'module-one',
          title: 'Server-authored Module One',
          position: 1,
          status: 'completed',
        },
      }],
      attempts: [{
        id: 'attempt-1',
        attemptNumber: 1,
        status: 'completed',
        lineage: {
          status: 'linked',
          legacyTraineeSessionId: 'legacy-linked-1',
          reason: 'EXPLICIT_HUB_ATTEMPT_LINK',
        },
      }],
      pageInfo: {
        moduleRecords: { limit: 50, nextCursor: null },
        attempts: { limit: 50, nextCursor: null },
      },
    }),
  }));
  await page.route('**/api/hub/rrhh/hub-attempts/attempt-1**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      attempt: {
        id: 'attempt-1',
        attemptNumber: 1,
        status: 'completed',
        lineage: { status: 'linked', reason: 'EXPLICIT_HUB_ATTEMPT_LINK' },
      },
      activityAttempts: [{
        id: 'activity-attempt-1',
        activityId: 'activity-1',
        status: 'completed',
        state: { acknowledged: true },
      }],
      evidenceEvents: [{
        id: 'evidence-1',
        sequenceNumber: 1,
        eventType: 'ACTIVITY_COMPLETED',
        payload: { activityId: 'activity-1' },
      }],
      artifacts: [{
        id: 'artifact-1',
        artifactType: 'COMPLETION_SUMMARY',
        createdAt: '2026-08-21T12:00:00.000Z',
        payload: { complete: true },
      }],
      pageInfo: {
        activityAttempts: { limit: 50, nextCursor: null },
        evidenceEvents: { limit: 50, nextCursor: null },
        artifacts: { limit: 50, nextCursor: null },
      },
    }),
  }));
  await page.route('**/api/hub/rrhh/simulator-sessions/legacy-unlinked-1**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      session: {
        id: 'legacy-unlinked-1',
        traineeName: 'Historical Label Only',
        status: 'submitted',
        lineage: { status: 'unlinked', reason: 'LEGACY_NAME_ONLY_SESSION' },
      },
      performance: { totalOperations: 1, correctOperations: 0 },
      operationBreakdown: { addCredits: 1 },
      operations: [{
        id: 'operation-1',
        type: 'ADD CREDITS',
        status: 'COMPLETED',
        sentResult: 'Rejected validation',
        failurePoints: [{
          label: 'Customer balance did not reconcile',
          expected: 'Balanced',
          sent: 'Mismatch',
          ok: false,
        }],
      }],
      auditLog: [{
        id: 'audit-1',
        actionType: 'OPERATION_VALIDATION_FAILED',
        timestamp: '2026-08-21T12:01:00.000Z',
        details: { operationId: 'operation-1' },
      }],
      pageInfo: {
        operations: { limit: 50, nextCursor: null },
        auditLog: { limit: 50, nextCursor: null },
      },
    }),
  }));

  await page.goto('/hub');

  await expect(page.getByRole('heading', { name: 'RRHH reporting' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hub module completion' })).toBeVisible();
  await page.getByRole('button', { name: 'View learning record' }).click();
  await expect(page.getByRole('heading', { name: 'Postulante module record' })).toBeVisible();
  await expect(page.getByText('Server-authored Module One')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Completed', exact: true })).toBeVisible();
  await expect(page.getByText('Unlinked legacy simulator session').first()).toBeVisible();
  await expect(page.getByText(/no Hub identity is inferred/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Español' })).toBeVisible();
  await expect(page.getByText('Assigned course')).toHaveCount(0);

  await page.getByRole('button', { name: 'View evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Attempt evidence' })).toBeVisible();
  await expect(page.getByText('ACTIVITY_COMPLETED')).toBeVisible();
  await expect(page.getByText('COMPLETION_SUMMARY')).toBeVisible();

  await page.getByRole('button', { name: 'View operation report' }).click();
  await expect(page.getByRole('heading', { name: 'Operation and failure report' })).toBeVisible();
  await expect(page.getByText('Customer balance did not reconcile')).toBeVisible();
  await expect(page.getByText('OPERATION_VALIDATION_FAILED')).toBeVisible();
  expect(mutationRequests).toEqual([]);
});
