import { HubError } from './HubError.js';
import { randomUUID } from 'node:crypto';
import { createSandboxSession } from '../services/sandboxService.js';
import { deleteSession } from '../engine/SessionEngine.js';
import {
  getGameWallet,
  searchGameAccounts
} from '../services/gameSimulationService.js';
import { processOperation } from '../services/operationService.js';

const ORION_STARS = 'Orion Stars';

function requireClient(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new TypeError('A Supabase service-role client is required.');
  }
  return client;
}

function throwDatabaseError(error) {
  const message = String(error?.message || '');
  if (message.includes('HUB_')) {
    throw new HubError(409, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is temporarily unavailable.');
  }
  throw new HubError(500, 'HUB_PERSISTENCE_ERROR', 'Hub learning data is temporarily unavailable.');
}

function dataOrThrow(result) {
  if (result.error) throwDatabaseError(result.error);
  return result.data;
}

function safeAccount(account) {
  return {
    id: account.id,
    game: account.game,
    gameUsername: account.game_username,
    nickname: account.nickname || account.game_username,
    credit: Number(account.balance),
    customer: {
      id: account.customer?.id || account.customer_id,
      username: account.customer?.username || null,
      firstName: account.customer?.first_name || null,
      lastName: account.customer?.last_name || null,
    }
  };
}

function safeContext(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    activityAttemptId: row.activity_attempt_id,
    attemptId: row.attempt_id,
    game: row.game,
    practiceType: row.practice_type || 'balance',
    operationId: row.operation_id || null,
    createdAt: row.created_at,
  };
}

export function createSupabaseHubFocusedPracticeRepository({
  client,
  sessionFactory = createSandboxSession,
  sessionCleanup = deleteSession,
  accountReader = searchGameAccounts,
  walletReader = getGameWallet,
}) {
  requireClient(client);

  async function findIdentity(identity) {
    const result = await client
      .from('hub_identities')
      .select('id, display_name')
      .eq('external_subject_reference', identity.subjectId)
      .maybeSingle();
    const row = dataOrThrow(result);
    if (!row) {
      throw new HubError(403, 'HUB_IDENTITY_NOT_PROVISIONED', 'The authenticated subject is not provisioned for Trez Training Hub.');
    }
    return row;
  }

  async function findContext(identity, activityId) {
    const owner = await findIdentity(identity);
    const result = await client
      .from('hub_practice_contexts')
      .select('id, identity_id, activity_id, activity_attempt_id, attempt_id, legacy_trainee_session_id, game, practice_type, operation_id, created_at')
      .eq('identity_id', owner.id)
      .eq('activity_id', activityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = dataOrThrow(result);
    return row ? { owner, row } : { owner, row: null };
  }

  async function assertFocusedBalanceActivity(activityId) {
    const result = await client
      .from('hub_activities')
      .select('id, activity_type, content')
      .eq('id', activityId)
      .maybeSingle();
    const activity = dataOrThrow(result);
    if (
      !activity ||
      activity.activity_type !== 'focused_practice' ||
      activity.content?.surface !== 'balance' ||
      activity.content?.game !== ORION_STARS
    ) {
      throw new HubError(409, 'HUB_ACTIVITY_BLOCKED', 'This activity is not an approved focused balance practice.');
    }
    return activity;
  }

  async function assertFocusedAddCreditsActivity(activityId) {
    const result = await client
      .from('hub_activities')
      .select('id, activity_type, content')
      .eq('id', activityId)
      .maybeSingle();
    const activity = dataOrThrow(result);
    const amount = Number(activity?.content?.amount);
    if (
      !activity ||
      activity.activity_type !== 'focused_practice' ||
      activity.content?.surface !== 'add_credits' ||
      activity.content?.game !== ORION_STARS ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new HubError(409, 'HUB_ACTIVITY_BLOCKED', 'This activity is not an approved focused Add Credits practice.');
    }
    return { activity, amount };
  }

  async function loadView(row) {
    const accounts = await accountReader({
      sessionId: row.legacy_trainee_session_id,
      game: row.game,
      query: '',
    });
    const wallet = await walletReader({
      sessionId: row.legacy_trainee_session_id,
      game: row.game,
    });
    const assignedAccounts = accounts.slice(0, 1);
    return {
      context: safeContext(row),
      game: row.game,
      surface: 'balance',
      accounts: assignedAccounts.map(safeAccount),
      availableBalance: Number(wallet.balance),
      timedSimulator: false,
    };
  }

  async function start({ identity, activityId, idempotencyKey }) {
    await assertFocusedBalanceActivity(activityId);
    const existing = await findContext(identity, activityId);
    if (existing.row) return { created: false, ...(await loadView(existing.row)) };

    const startResult = dataOrThrow(await client.rpc('hub_start_activity_attempt', {
      p_external_subject: identity.subjectId,
      p_activity_id: activityId,
      p_state: { focusedPractice: true, game: ORION_STARS },
      p_idempotency_key: idempotencyKey,
    }));
    const attempt = Array.isArray(startResult) ? startResult[0] : startResult;
    if (!attempt?.activityAttemptId || !attempt?.attemptId) {
      throw new HubError(409, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'The focused practice attempt could not be started.');
    }

    const afterAttempt = await findContext(identity, activityId);
    if (afterAttempt.row) return { created: false, ...(await loadView(afterAttempt.row)) };

    const session = await sessionFactory(`Hub focused practice: ${identity.displayName || identity.subjectId}`);
    try {
      const insert = await client
        .from('hub_practice_contexts')
        .insert({
          identity_id: afterAttempt.owner.id,
          activity_id: activityId,
          activity_attempt_id: attempt.activityAttemptId,
          attempt_id: attempt.attemptId,
          legacy_trainee_session_id: session.id,
          practice_type: 'balance',
          game: ORION_STARS,
        })
        .select('id, identity_id, activity_id, activity_attempt_id, attempt_id, legacy_trainee_session_id, game, practice_type, operation_id, created_at')
        .single();
      const row = dataOrThrow(insert);

      const update = await client
        .from('hub_attempts')
        .update({ legacy_trainee_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', attempt.attemptId);
      dataOrThrow(update);
      return { created: attempt.created === true, ...(await loadView(row)) };
    } catch (error) {
      await sessionCleanup(session.id).catch(() => {});
      const winner = await findContext(identity, activityId);
      if (winner.row) return { created: false, ...(await loadView(winner.row)) };
      throw error;
    }
  }

  async function read({ identity, activityId }) {
    await assertFocusedBalanceActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) {
      throw new HubError(404, 'HUB_FOCUSED_PRACTICE_NOT_STARTED', 'Start the focused practice before reading the game surface.');
    }
    return loadView(result.row);
  }

  async function submitRefresh({ identity, activityId, accountId, observedCredit, observedAvailableBalance }) {
    await assertFocusedBalanceActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) {
      throw new HubError(404, 'HUB_FOCUSED_PRACTICE_NOT_STARTED', 'Start the focused practice before submitting an observation.');
    }
    const accounts = await accountReader({ sessionId: result.row.legacy_trainee_session_id, game: result.row.game, query: '' });
    const account = accounts[0];
    const expectedCredit = Number(account?.balance);
    const wallet = await walletReader({ sessionId: result.row.legacy_trainee_session_id, game: result.row.game });
    const expectedAvailable = Number(wallet.balance);
    if (!account || account.id !== accountId || !Number.isFinite(observedCredit) || !Number.isFinite(observedAvailableBalance)) {
      throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Select the assigned game account and enter numeric balance values.');
    }
    if (expectedCredit !== observedCredit || expectedAvailable !== observedAvailableBalance) {
      throw new HubError(409, 'HUB_BALANCE_OBSERVATION_MISMATCH', 'The submitted values do not match the current game-side balance.');
    }
    return {
      context: safeContext(result.row),
      account: safeAccount(account),
      observedCredit,
      observedAvailableBalance,
      verified: true,
    };
  }

  async function readOperation(row) {
    if (!row.operation_id) {
      throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The Add Credits practice has no linked movement.');
    }
    const result = await client
      .from('sandbox_operations')
      .select('*')
      .eq('id', row.operation_id)
      .maybeSingle();
    const operation = dataOrThrow(result);
    if (!operation || operation.type !== 'ADD CREDITS') {
      throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The Add Credits movement is unavailable.');
    }
    return operation;
  }

  async function gameActionExists(operation) {
    const result = await client
      .from('sandbox_game_history')
      .select('id')
      .eq('session_id', operation.session_id)
      .eq('customer_id', operation.customer_id)
      .eq('game_account_id', operation.game_account_id)
      .eq('type', 'GAME ADD CREDITS')
      .eq('amount', operation.amount)
      .gte('created_at', operation.created_at)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = dataOrThrow(result);
    return Boolean(row);
  }

  async function loadAddCreditsView(row) {
    const operation = await readOperation(row);
    const accounts = await accountReader({ sessionId: row.legacy_trainee_session_id, game: row.game, query: '' });
    const account = accounts.find((candidate) => candidate.id === operation.game_account_id);
    if (!account) {
      throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The assigned game account is unavailable.');
    }
    const wallet = await walletReader({ sessionId: row.legacy_trainee_session_id, game: row.game });
    const gameActionExecuted = await gameActionExists(operation);
    return {
      context: safeContext(row),
      game: row.game,
      surface: 'add_credits',
      timedSimulator: false,
      account: safeAccount(account),
      operation: {
        id: operation.id,
        type: operation.type,
        amount: Number(operation.amount),
        status: operation.status,
        customerReservationStatus: operation.customer_reservation_status,
        customerBalanceAtRequest: Number(operation.customer_balance_at_request),
        customerBalance: Number(account.customer?.balance),
        gameCreditAtRequest: Number(operation.game_balance_at_request),
        gameCredit: Number(account.balance),
        gameWalletBalance: Number(wallet.balance),
        gameActionExecuted,
      },
    };
  }

  async function startAddCredits({ identity, activityId, idempotencyKey }) {
    const { amount } = await assertFocusedAddCreditsActivity(activityId);
    const existing = await findContext(identity, activityId);
    if (existing.row) return { created: false, ...(await loadAddCreditsView(existing.row)) };

    const startResult = dataOrThrow(await client.rpc('hub_start_activity_attempt', {
      p_external_subject: identity.subjectId,
      p_activity_id: activityId,
      p_state: { focusedPractice: true, game: ORION_STARS, operation: 'ADD CREDITS' },
      p_idempotency_key: idempotencyKey,
    }));
    const attempt = Array.isArray(startResult) ? startResult[0] : startResult;
    if (!attempt?.activityAttemptId || !attempt?.attemptId) {
      throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The Add Credits practice attempt could not be started.');
    }

    const afterAttempt = await findContext(identity, activityId);
    if (afterAttempt.row) return { created: false, ...(await loadAddCreditsView(afterAttempt.row)) };

    const session = await sessionFactory(`Hub Add Credits practice: ${identity.displayName || identity.subjectId}`);
    let operationId = null;
    try {
      const accountResult = await client
        .from('sandbox_game_accounts')
        .select('id, session_id, customer_id, game, game_username, nickname, balance, customer:sandbox_customers(id, username, first_name, last_name, balance)')
        .eq('session_id', session.id)
        .eq('game', ORION_STARS)
        .order('game_username', { ascending: true })
        .limit(1)
        .maybeSingle();
      const account = dataOrThrow(accountResult);
      if (!account?.customer || !Number.isFinite(Number(account.customer.balance))) {
        throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The Add Credits customer fixture is unavailable.');
      }
      const operation = dataOrThrow(await client.rpc('create_reserved_sandbox_operation', {
        p_operation: {
          id: randomUUID(),
          session_id: session.id,
          customer_id: account.customer_id,
          game_account_id: account.id,
          game: ORION_STARS,
          type: 'ADD CREDITS',
          amount,
          customer_balance_at_request: Number(account.customer.balance),
          game_balance_at_request: Number(account.balance),
          created_at: new Date().toISOString(),
        },
      }));
      const createdOperation = Array.isArray(operation) ? operation[0] : operation;
      operationId = createdOperation?.id;
      if (!operationId) throw new HubError(409, 'HUB_ADD_CREDITS_UNAVAILABLE', 'The Add Credits reservation could not be created.');

      const insert = await client
        .from('hub_practice_contexts')
        .insert({
          identity_id: afterAttempt.owner.id,
          activity_id: activityId,
          activity_attempt_id: attempt.activityAttemptId,
          attempt_id: attempt.attemptId,
          legacy_trainee_session_id: session.id,
          practice_type: 'add_credits',
          operation_id: operationId,
          game: ORION_STARS,
        })
        .select('id, identity_id, activity_id, activity_attempt_id, attempt_id, legacy_trainee_session_id, game, practice_type, operation_id, created_at')
        .single();
      const row = dataOrThrow(insert);
      const update = await client
        .from('hub_attempts')
        .update({ legacy_trainee_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', attempt.attemptId);
      dataOrThrow(update);
      return { created: true, ...(await loadAddCreditsView(row)) };
    } catch (error) {
      if (operationId) {
        await processOperation(operationId, {
          action: 'CANCELLED',
          traineeName: identity.displayName || identity.subjectId,
          requestData: { focusedPracticeCleanup: true },
        }).catch(() => {});
      }
      await sessionCleanup(session.id).catch(() => {});
      const winner = await findContext(identity, activityId);
      if (winner.row) return { created: false, ...(await loadAddCreditsView(winner.row)) };
      throw error;
    }
  }

  async function readAddCredits({ identity, activityId }) {
    await assertFocusedAddCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) {
      throw new HubError(404, 'HUB_ADD_CREDITS_NOT_STARTED', 'Start the Add Credits practice before reading the movement.');
    }
    return loadAddCreditsView(result.row);
  }

  async function rechargeAddCredits({ identity, activityId, accountId, amount: requestedAmount }) {
    await assertFocusedAddCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) throw new HubError(404, 'HUB_ADD_CREDITS_NOT_STARTED', 'Start the Add Credits practice before changing the game account.');
    const operation = await readOperation(result.row);
    const amount = Number(requestedAmount);
    if (operation.status !== 'PENDING') throw new HubError(409, 'HUB_ADD_CREDITS_ALREADY_SETTLED', 'This Add Credits movement has already been settled.');
    if (accountId !== operation.game_account_id || !Number.isFinite(amount) || amount <= 0 || amount !== Number(operation.amount)) {
      throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Use the assigned game account and the exact requested amount.');
    }
    const rechargeResult = await client.rpc('hub_recharge_add_credits_practice', {
      p_operation_id: operation.id,
      p_account_id: accountId,
      p_amount: amount,
      p_description: JSON.stringify({
        kind: 'GAME_HISTORY',
        game: operation.game,
        action: 'Add Credits',
        amount,
        source: 'Hub focused Add Credits practice',
      }),
    });
    dataOrThrow(rechargeResult);
    return loadAddCreditsView(result.row);
  }

  async function settleAddCredits({ identity, activityId, action }) {
    await assertFocusedAddCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) throw new HubError(404, 'HUB_ADD_CREDITS_NOT_STARTED', 'Start the Add Credits practice before settling the movement.');
    const operation = await readOperation(result.row);
    if (operation.status === 'PENDING' && action === 'APPROVED' && !(await gameActionExists(operation))) {
      throw new HubError(409, 'HUB_GAME_ACTION_REQUIRED', 'Perform the game-side Add Credits action before approving the Backend movement.');
    }
    if (operation.status !== 'PENDING') return loadAddCreditsView(result.row);
    return processOperation(operation.id, {
      action,
      traineeName: identity.displayName || identity.subjectId,
      requestData: { focusedPractice: true, operationId: operation.id, action },
    }).then(() => loadAddCreditsView(result.row));
  }

  async function assertFocusedWithdrawCreditsActivity(activityId) {
    const result = await client.from('hub_activities').select('id, activity_type, content').eq('id', activityId).maybeSingle();
    const activity = dataOrThrow(result);
    const amount = Number(activity?.content?.amount);
    if (!activity || activity.activity_type !== 'focused_practice' || activity.content?.surface !== 'withdraw_credits' || activity.content?.game !== ORION_STARS || !Number.isFinite(amount) || amount <= 0) {
      throw new HubError(409, 'HUB_ACTIVITY_BLOCKED', 'This activity is not an approved focused Withdraw Credits practice.');
    }
    return { activity, amount };
  }

  async function readWithdrawOperation(row) {
    if (!row.operation_id) throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The Withdraw Credits practice has no linked movement.');
    const operation = dataOrThrow(await client.from('sandbox_operations').select('*').eq('id', row.operation_id).maybeSingle());
    if (!operation || operation.type !== 'WITHDRAW CREDITS') throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The Withdraw Credits movement is unavailable.');
    return operation;
  }

  async function withdrawGameActionExists(operation) {
    const row = dataOrThrow(await client.from('sandbox_game_history').select('id').eq('session_id', operation.session_id).eq('customer_id', operation.customer_id).eq('game_account_id', operation.game_account_id).eq('type', 'GAME WITHDRAW CREDITS').eq('amount', operation.amount).gte('created_at', operation.created_at).order('created_at', { ascending: true }).limit(1).maybeSingle());
    return Boolean(row);
  }

  async function loadWithdrawCreditsView(row) {
    const operation = await readWithdrawOperation(row);
    const accounts = await accountReader({ sessionId: row.legacy_trainee_session_id, game: row.game, query: '' });
    const account = accounts.find((candidate) => candidate.id === operation.game_account_id);
    if (!account) throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The assigned game account is unavailable.');
    const wallet = await walletReader({ sessionId: row.legacy_trainee_session_id, game: row.game });
    return {
      context: safeContext(row), game: row.game, surface: 'withdraw_credits', timedSimulator: false, account: safeAccount(account),
      operation: {
        id: operation.id, type: operation.type, amount: Number(operation.amount), status: operation.status,
        customerReservationStatus: operation.customer_reservation_status, customerBalanceAtRequest: Number(operation.customer_balance_at_request),
        customerBalance: Number(account.customer?.balance), gameCreditAtRequest: Number(operation.game_balance_at_request), gameCredit: Number(account.balance),
        gameWalletBalance: Number(wallet.balance), gameActionExecuted: await withdrawGameActionExists(operation),
      },
    };
  }

  async function startWithdrawCredits({ identity, activityId, idempotencyKey }) {
    const { amount } = await assertFocusedWithdrawCreditsActivity(activityId);
    const existing = await findContext(identity, activityId);
    if (existing.row) return { created: false, ...(await loadWithdrawCreditsView(existing.row)) };
    const startResult = dataOrThrow(await client.rpc('hub_start_activity_attempt', { p_external_subject: identity.subjectId, p_activity_id: activityId, p_state: { focusedPractice: true, game: ORION_STARS, operation: 'WITHDRAW CREDITS' }, p_idempotency_key: idempotencyKey }));
    const attempt = Array.isArray(startResult) ? startResult[0] : startResult;
    if (!attempt?.activityAttemptId || !attempt?.attemptId) throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The Withdraw Credits practice attempt could not be started.');
    const afterAttempt = await findContext(identity, activityId);
    if (afterAttempt.row) return { created: false, ...(await loadWithdrawCreditsView(afterAttempt.row)) };
    const session = await sessionFactory(`Hub Withdraw Credits practice: ${identity.displayName || identity.subjectId}`);
    try {
      const account = dataOrThrow(await client.from('sandbox_game_accounts').select('id, session_id, customer_id, game, game_username, nickname, balance, customer:sandbox_customers(id, username, first_name, last_name, balance)').eq('session_id', session.id).eq('game', ORION_STARS).order('game_username', { ascending: true }).limit(1).maybeSingle());
      if (!account?.customer || !Number.isFinite(Number(account.customer.balance))) throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The Withdraw Credits customer fixture is unavailable.');
      const operation = dataOrThrow(await client.rpc('create_reserved_sandbox_operation', { p_operation: { id: randomUUID(), session_id: session.id, customer_id: account.customer_id, game_account_id: account.id, game: ORION_STARS, type: 'WITHDRAW CREDITS', amount, customer_balance_at_request: Number(account.customer.balance), game_balance_at_request: Number(account.balance), created_at: new Date().toISOString() } }));
      const createdOperation = Array.isArray(operation) ? operation[0] : operation;
      const operationId = createdOperation?.id;
      if (!operationId) throw new HubError(409, 'HUB_WITHDRAW_CREDITS_UNAVAILABLE', 'The Withdraw Credits movement could not be created.');
      const row = dataOrThrow(await client.from('hub_practice_contexts').insert({ identity_id: afterAttempt.owner.id, activity_id: activityId, activity_attempt_id: attempt.activityAttemptId, attempt_id: attempt.attemptId, legacy_trainee_session_id: session.id, practice_type: 'withdraw_credits', operation_id: operationId, game: ORION_STARS }).select('id, identity_id, activity_id, activity_attempt_id, attempt_id, legacy_trainee_session_id, game, practice_type, operation_id, created_at').single());
      dataOrThrow(await client.from('hub_attempts').update({ legacy_trainee_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', attempt.attemptId));
      return { created: true, ...(await loadWithdrawCreditsView(row)) };
    } catch (error) {
      await sessionCleanup(session.id).catch(() => {});
      const winner = await findContext(identity, activityId);
      if (winner.row) return { created: false, ...(await loadWithdrawCreditsView(winner.row)) };
      throw error;
    }
  }

  async function readWithdrawCredits({ identity, activityId }) {
    await assertFocusedWithdrawCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) throw new HubError(404, 'HUB_WITHDRAW_CREDITS_NOT_STARTED', 'Start the Withdraw Credits practice before reading the movement.');
    return loadWithdrawCreditsView(result.row);
  }

  async function redeemWithdrawCredits({ identity, activityId, accountId, amount }) {
    await assertFocusedWithdrawCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) throw new HubError(404, 'HUB_WITHDRAW_CREDITS_NOT_STARTED', 'Start the Withdraw Credits practice before changing the game account.');
    const operation = await readWithdrawOperation(result.row);
    if (operation.status !== 'PENDING') throw new HubError(409, 'HUB_WITHDRAW_CREDITS_ALREADY_SETTLED', 'This Withdraw Credits movement has already been settled.');
    if (accountId !== operation.game_account_id || !Number.isFinite(amount) || amount <= 0 || amount !== Number(operation.amount)) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Use the assigned game account and the exact requested amount.');
    dataOrThrow(await client.rpc('hub_redeem_withdraw_credits_practice', { p_operation_id: operation.id, p_account_id: accountId, p_amount: amount, p_description: JSON.stringify({ kind: 'GAME_HISTORY', game: operation.game, action: 'Withdraw Credits', amount, source: 'Hub focused Withdraw Credits practice' }) }));
    return loadWithdrawCreditsView(result.row);
  }

  async function settleWithdrawCredits({ identity, activityId, action }) {
    await assertFocusedWithdrawCreditsActivity(activityId);
    const result = await findContext(identity, activityId);
    if (!result.row) throw new HubError(404, 'HUB_WITHDRAW_CREDITS_NOT_STARTED', 'Start the Withdraw Credits practice before settling the movement.');
    const operation = await readWithdrawOperation(result.row);
    if (operation.status === 'PENDING' && action === 'APPROVED' && !(await withdrawGameActionExists(operation))) throw new HubError(409, 'HUB_GAME_ACTION_REQUIRED', 'Perform the game-side Withdraw Credits action before approving the Backend movement.');
    if (operation.status !== 'PENDING') return loadWithdrawCreditsView(result.row);
    await processOperation(operation.id, { action, traineeName: identity.displayName || identity.subjectId, requestData: { focusedPractice: true, operationId: operation.id, action } });
    return loadWithdrawCreditsView(result.row);
  }

  return Object.freeze({ start, read, submitRefresh, startAddCredits, readAddCredits, rechargeAddCredits, settleAddCredits, startWithdrawCredits, readWithdrawCredits, redeemWithdrawCredits, settleWithdrawCredits });
}
