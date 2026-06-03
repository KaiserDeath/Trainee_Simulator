import { supabase }
  from '../config/supabase.js';

import {
  buildOperationBreakdown,
  buildSessionPerformance,
  getExpectedOperationAction,
  getExpectedRequestContext,
  isRequestOperation
} from '../services/scoringService.js';

import {
  findRelatedGameAction,
  hasCreatedAccount,
  hasMatchingGameAction
} from '../services/gameSimulationService.js';

export async function getSessionById(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Session not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

export async function getSessionOperations(
  sessionId
) {
  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(`
      *,
      customer:sandbox_customers(
        username,
        first_name,
        last_name,
        email,
        balance
      ),
      game_account:sandbox_game_accounts(
        game,
        game_username,
        password,
        balance
      )
    `)
    .eq('session_id', sessionId);

  if (error) {
    throw error;
  }

  return data;
}

function parseRequestData(operation) {
  const requestData =
    operation.request_data ||
    operation.requestData ||
    operation.request_payload ||
    operation.submitted_data;

  if (!requestData || typeof requestData !== 'string') {
    return requestData || {};
  }

  try {
    return JSON.parse(requestData);
  } catch {
    return requestData;
  }
}

function formatCustomerName(customer) {
  if (!customer) {
    return '';
  }

  const fullName = [
    customer.first_name,
    customer.last_name
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || customer.username || '';
}

async function getReportExpectedResult(operation) {
  if (isRequestOperation(operation.type)) {
    return getExpectedOperationAction(
      operation
    );
  }

  if (operation.status !== 'PENDING') {
    const type =
      operation.type === 'ADD CREDITS'
        ? 'GAME ADD CREDITS'
        : operation.type === 'WITHDRAW CREDITS'
          ? 'GAME WITHDRAW CREDITS'
          : null;

    if (type) {
      const gameActionDone =
        await hasMatchingGameAction({
          operation,
          type
        });

      if (gameActionDone) {
        return 'APPROVED';
      }
    }
  }

  if (
    operation.status !== 'PENDING' &&
    operation.is_correct === true
  ) {
    return operation.status;
  }

  return getExpectedOperationAction(
    operation
  );
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeNumber(value) {
  return Number(value);
}

function buildRequirement({
  label,
  expected,
  sent,
  ok
}) {
  return {
    label,
    expected:
      expected ?? '',
    sent:
      sent ?? '',
    ok:
      Boolean(ok)
  };
}

function alignRequirementsWithScore(
  operation,
  requirements
) {
  if (operation.is_correct !== true) {
    return requirements;
  }

  return requirements.map(requirement => ({
    ...requirement,
    ok: true
  }));
}

async function buildValidationRequirements({
  operation,
  requestData,
  expectedResult,
  sentResult
}) {
  const checks = [
    buildRequirement({
      label: 'Operation',
      expected: expectedResult,
      sent: sentResult,
      ok: sentResult === expectedResult
    })
  ];

  if (!isRequestOperation(operation.type)) {
    const expectedNeedsGameAction =
      expectedResult === 'APPROVED';

    if (expectedNeedsGameAction) {
      const type =
        operation.type === 'ADD CREDITS'
          ? 'GAME ADD CREDITS'
          : 'GAME WITHDRAW CREDITS';
      const gameActionDone =
        await hasMatchingGameAction({
          operation,
          type
        });
      const relatedGameAction =
        gameActionDone
          ? null
          : await findRelatedGameAction({
              operation,
              type
            });

      checks.push(
        buildRequirement({
          label: 'Game action',
          expected: 'Posted',
          sent: gameActionDone
            ? 'Posted'
            : 'Missing',
          ok: gameActionDone
        })
      );

      if (relatedGameAction) {
        checks.push(
          buildRequirement({
            label: 'Game amount',
            expected:
              Number(operation.amount),
            sent:
              Number(relatedGameAction.amount),
            ok:
              Number(relatedGameAction.amount) ===
              Number(operation.amount)
          })
        );
      }
    }

    return alignRequirementsWithScore(
      operation,
      checks
    );
  }

  const expectedContext =
    getExpectedRequestContext(operation);
  const submitted =
    typeof requestData === 'object' &&
    requestData !== null
      ? requestData
      : {};
  const submittedGameId =
    normalizeText(submitted.gameId);
  const submittedKiosk =
    normalizeText(submitted.kiosk);
  const submittedPassword =
    normalizeText(submitted.newPassword);

  if (
    operation.type === 'CREATE ACCOUNT'
  ) {
    const created =
      await hasCreatedAccount({
        operation,
        requestData: submitted
      });

    checks.push(
      buildRequirement({
        label: 'Game ID',
        expected: 'Provided',
        sent: submittedGameId || 'Missing',
        ok: Boolean(submittedGameId)
      }),
      buildRequirement({
        label: 'Kiosk',
        expected: 'Provided',
        sent: submittedKiosk || 'Missing',
        ok: Boolean(submittedKiosk)
      }),
      buildRequirement({
        label: 'Password',
        expected: 'Provided',
        sent: submittedPassword
          ? 'Provided'
          : 'Missing',
        ok: Boolean(submittedPassword)
      }),
      buildRequirement({
        label: 'Account created',
        expected: 'Created',
        sent: created
          ? 'Created'
          : 'Missing',
        ok: created
      })
    );
  }

  if (
    operation.type === 'RESET PASSWORD'
  ) {
    checks.push(
      buildRequirement({
        label: 'Game ID',
        expected: expectedContext.gameId,
        sent: submittedGameId || 'Missing',
        ok:
          submittedGameId ===
          expectedContext.gameId
      }),
      buildRequirement({
        label: 'Kiosk',
        expected: expectedContext.kiosk,
        sent: submittedKiosk || 'Missing',
        ok:
          submittedKiosk ===
          expectedContext.kiosk
      }),
      buildRequirement({
        label: 'Password',
        expected: 'Updated',
        sent: submittedPassword
          ? 'Submitted'
          : 'Missing',
        ok: Boolean(submittedPassword)
      }),
      buildRequirement({
        label: 'Backoffice password',
        expected: submittedPassword || 'Submitted password',
        sent:
          operation.game_account?.password ||
          'Not updated',
        ok:
          Boolean(submittedPassword) &&
          operation.game_account
            ?.password ===
            submittedPassword
      })
    );
  }

  if (
    operation.type === 'REFRESH BALANCE'
  ) {
    const submittedAmount =
      normalizeNumber(submitted.amount);

    checks.push(
      buildRequirement({
        label: 'Game ID',
        expected: expectedContext.gameId,
        sent: submittedGameId || 'Missing',
        ok:
          submittedGameId ===
          expectedContext.gameId
      }),
      buildRequirement({
        label: 'Kiosk',
        expected: expectedContext.kiosk,
        sent: submittedKiosk || 'Missing',
        ok:
          submittedKiosk ===
          expectedContext.kiosk
      }),
      buildRequirement({
        label: 'Balance',
        expected: expectedContext.currentBalance,
        sent:
          Number.isFinite(submittedAmount)
            ? submittedAmount
            : 'Missing',
        ok:
          Number.isFinite(
            submittedAmount
          ) &&
          submittedAmount ===
            expectedContext.currentBalance
      })
    );
  }

  return alignRequirementsWithScore(
    operation,
    checks
  );
}

async function buildOperationReportRows(operations) {
  return Promise.all(operations.map(async operation => {
    const requestData =
      parseRequestData(operation);
    const expectedResult =
      await getReportExpectedResult(
        operation
      );
    const sentResult =
      operation.status || 'PENDING';
    const expectedRequestData =
      isRequestOperation(operation.type)
        ? getExpectedRequestContext(
            operation
          )
        : null;
    const validationRequirements =
      await buildValidationRequirements({
        operation,
        requestData,
        expectedResult,
        sentResult
      });
    const safeGameAccount =
      operation.game_account
        ? {
            game:
              operation.game_account.game,
            game_username:
              operation.game_account
                .game_username,
            balance:
              operation.game_account.balance
          }
        : operation.game_account;

    return {
      ...operation,
      game_account:
        safeGameAccount,
      requestData,
      request_data: requestData,
      customerName:
        formatCustomerName(
          operation.customer
        ),
      customer_name:
        formatCustomerName(
          operation.customer
        ),
      customerUsername:
        operation.customer?.username || '',
      mobileId:
        operation.game_account
          ?.game_username || '',
      mobile_id:
        operation.game_account
          ?.game_username || '',
      game:
        operation.game_account?.game || '',
      expectedResult,
      expected_result:
        expectedResult,
      sentResult,
      sent_result:
        sentResult,
      expectedRequestData,
      expected_request_data:
        expectedRequestData,
      validationRequirements,
      validation_requirements:
        validationRequirements
    };
  }));
}

function getReportCorrectness(operation) {
  if (operation.status === 'PENDING') {
    return operation.is_correct;
  }

  const requirements =
    operation.validationRequirements ||
    operation.validation_requirements ||
    [];

  if (requirements.length > 0) {
    return requirements.every(item => item.ok);
  }

  return operation.is_correct;
}

export async function buildSessionReport(
  sessionId
) {
  const session =
    await getSessionById(sessionId);

  const operations =
    await getSessionOperations(
      sessionId
    );
  const operationRows =
    await buildOperationReportRows(
      operations
    );
  const scoredOperations =
    operationRows.map(operation => ({
      ...operation,
      is_correct:
        getReportCorrectness(operation)
    }));

  return {
    session: {
      id: session.id,
      trainee_name:
        session.trainee_name,
      started_at:
        session.started_at,
      ended_at:
        session.ended_at,
      status: session.status
    },
    performance:
      buildSessionPerformance(
        scoredOperations
      ),
    operationBreakdown:
      buildOperationBreakdown(
        operations
      ),
    operations:
      scoredOperations
  };
}

function emptyDurationStats() {
  return {
    count: 0,
    totalSeconds: 0,
    averageSeconds: 0,
    minSeconds: null,
    maxSeconds: null
  };
}

function addDurationSample(
  stats,
  seconds
) {
  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return;
  }

  stats.count += 1;
  stats.totalSeconds += value;
  stats.minSeconds =
    stats.minSeconds == null
      ? value
      : Math.min(stats.minSeconds, value);
  stats.maxSeconds =
    stats.maxSeconds == null
      ? value
      : Math.max(stats.maxSeconds, value);
  stats.averageSeconds =
    stats.totalSeconds / stats.count;
}

function finalizeDurationStats(stats) {
  return {
    count: stats.count,
    averageSeconds:
      Number(stats.averageSeconds.toFixed(2)),
    minSeconds:
      stats.minSeconds == null
        ? null
        : Number(stats.minSeconds.toFixed(2)),
    maxSeconds:
      stats.maxSeconds == null
        ? null
        : Number(stats.maxSeconds.toFixed(2))
  };
}

function durationMapToList(map) {
  return Array.from(map.entries())
    .map(([type, stats]) => ({
      type,
      ...finalizeDurationStats(stats)
    }))
    .sort((a, b) =>
      a.type.localeCompare(b.type)
    );
}

export async function buildOperationTimeStats() {
  const { data, error } = await supabase
    .from('sandbox_operations')
    .select(`
      id,
      type,
      status,
      handling_time_seconds,
      session:trainee_sessions(
        id,
        trainee_name,
        started_at
      )
    `)
    .not(
      'handling_time_seconds',
      'is',
      null
    );

  if (error) {
    throw error;
  }

  const globalByType = new Map();
  const traineeBuckets = new Map();
  const overall = emptyDurationStats();

  for (const operation of data || []) {
    const seconds = Number(
      operation.handling_time_seconds
    );

    if (!Number.isFinite(seconds)) {
      continue;
    }

    const type =
      operation.type || 'UNKNOWN';
    const session =
      operation.session || {};
    const traineeName =
      session.trainee_name ||
      'Unknown Trainee';
    const traineeKey =
      `${session.id || traineeName}:${traineeName}`;

    if (!globalByType.has(type)) {
      globalByType.set(
        type,
        emptyDurationStats()
      );
    }

    addDurationSample(
      globalByType.get(type),
      seconds
    );
    addDurationSample(overall, seconds);

    if (!traineeBuckets.has(traineeKey)) {
      traineeBuckets.set(traineeKey, {
        traineeName,
        sessionId: session.id,
        startedAt: session.started_at,
        byType: new Map(),
        overall: emptyDurationStats()
      });
    }

    const traineeBucket =
      traineeBuckets.get(traineeKey);

    if (!traineeBucket.byType.has(type)) {
      traineeBucket.byType.set(
        type,
        emptyDurationStats()
      );
    }

    addDurationSample(
      traineeBucket.byType.get(type),
      seconds
    );
    addDurationSample(
      traineeBucket.overall,
      seconds
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    overall:
      finalizeDurationStats(overall),
    allOperations:
      durationMapToList(globalByType),
    perPerson:
      Array.from(traineeBuckets.values())
        .map(bucket => ({
          traineeName: bucket.traineeName,
          sessionId: bucket.sessionId,
          startedAt: bucket.startedAt,
          overall:
            finalizeDurationStats(
              bucket.overall
            ),
          operations:
            durationMapToList(bucket.byType)
        }))
        .sort((a, b) =>
          a.traineeName.localeCompare(
            b.traineeName
          )
        )
  };
}

export async function completeSession(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .update({
      status: 'completed',
      ended_at: new Date()
        .toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function submitSession(
  sessionId
) {
  const { data, error } = await supabase
    .from('trainee_sessions')
    .update({
      status: 'submitted',
      ended_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSession(
  sessionId
) {
  const { error: historyError } = await supabase
    .from('sandbox_transaction_history')
    .delete()
    .eq('session_id', sessionId);

  if (historyError) {
    throw historyError;
  }

  const { error: operationsError } = await supabase
    .from('sandbox_operations')
    .delete()
    .eq('session_id', sessionId);

  if (operationsError) {
    throw operationsError;
  }

  const { error: accountsError } = await supabase
    .from('sandbox_game_accounts')
    .delete()
    .eq('session_id', sessionId);

  if (accountsError) {
    throw accountsError;
  }

  const { error: customersError } = await supabase
    .from('sandbox_customers')
    .delete()
    .eq('session_id', sessionId);

  if (customersError) {
    throw customersError;
  }

  const { data, error } = await supabase
    .from('trainee_sessions')
    .delete()
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSessionsWithoutActivity() {
  const { data: sessions, error } = await supabase
    .from('trainee_sessions')
    .select('id, status, started_at');

  if (error) {
    throw error;
  }

  const deletedIds = [];
  const cutoffMs =
    Date.now() - 10 * 60 * 1000;

  for (const session of sessions) {
    const startedAtMs =
      new Date(session.started_at).getTime();
    const isRecent =
      Number.isFinite(startedAtMs) &&
      startedAtMs > cutoffMs;

    if (
      session.status === 'active' ||
      isRecent
    ) {
      continue;
    }

    const { data: operations, error: opError } = await supabase
      .from('sandbox_operations')
      .select('id')
      .eq('session_id', session.id)
      .limit(1);

    if (opError) {
      throw opError;
    }

    if (!operations || operations.length === 0) {
      await deleteSession(session.id);
      deletedIds.push(session.id);
    }
  }

  return deletedIds;
}
