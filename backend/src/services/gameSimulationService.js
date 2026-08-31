import { supabase }
  from '../config/supabase.js';

import {
  buildIlikeFilter,
  gameNamesMatch
} from '../utils/search.js';
import { GAME_HISTORY_TABLE }
  from '../domain/historyStores.js';
import {
  assertOrionAccountCreationPolicyBoundary,
  buildOrionAccountCreationOutcome,
  ORION_STARS_GAME,
  ORION_STARS_TRAINING_MODES
} from '../domain/gameAdapters/orionStarsAdapter.js';

export async function getGameWallet({
  sessionId,
  game
}) {
  const { data, error } = await supabase
    .from('sandbox_game_wallets')
    .select('id, balance')
    .eq('session_id', sessionId)
    .eq('game', game)
    .single();

  if (error || !data) {
    const notFound = new Error(
      'Game loading wallet not found'
    );
    notFound.statusCode = 404;
    throw notFound;
  }

  return data;
}

async function attachGameWalletBalance(
  accounts
) {
  if (!accounts.length) {
    return accounts;
  }

  const wallet = await getGameWallet({
    sessionId: accounts[0].session_id,
    game: accounts[0].game
  });

  return accounts.map(account => ({
    ...account,
    game_wallet_balance:
      Number(wallet.balance)
  }));
}

function parseHistoryDetails(description) {
  try {
    const parsed =
      JSON.parse(description || '{}');

    if (
      parsed.kind ===
        'MOVEMENT_HISTORY' ||
      parsed.kind ===
        'GAME_HISTORY'    
      ) {
        return parsed;
      }
  } catch {
    // Existing action rows use plain-text descriptions.
  }

  return {};
}


function normalizeHistoryItem(item) {
  const details =
    parseHistoryDetails(
      item.description
    );

  const game =
    item.game ||
    details.game ||
    inferGameFromDescription(
      item.description
    );

  const gameUsername =
    details.playerId ||
    details.mobileId ||
    details.mobile_id ||
    item.game_username ||
    '—';

  const operationCode =
    details.operationCode ||
    details.operation_code ||
    String(item.id).slice(0, 8)
      .toUpperCase();

  const manager =
    details.manager ||
    details.processed_by ||
    'TrainingStore';

  const status =
    details.status ||
    'Approved';

  const requestedAt =
    details.requestedAt ||
    details.requested_at ||
    details.executedAt ||
    item.created_at;

  const acceptedAt =
    details.acceptedAt ||
    details.accepted_at ||
    details.executedAt ||
    item.created_at;

  return {
    id: item.id,
    type: item.type,
    amount: item.amount,
    description:
      details.kind
        ? ''
        : item.description,
    created_at: item.created_at,
    operationCode,
    operation_code: operationCode,
    game,
    gameUsername,
    game_username: gameUsername,
    mobileId: gameUsername,
    mobile_id: gameUsername,
    requestedAt,
    requested_at: requestedAt,
    acceptedAt,
    accepted_at: acceptedAt,
    processed_at: acceptedAt,
    processedAt: acceptedAt,
    approved_at: acceptedAt,
    approvedAt: acceptedAt,
    manager,
    processed_by: manager,
    processedBy: manager,
    status
  };
}

function inferGameFromDescription(
  description = ''
) {
  const value = String(description);

  if (value.includes('Orion Stars')) {
    return 'Orion Stars';
  }

  if (value.includes('Vblink')) {
    return 'Vblink';
  }

  if (
    value.includes('Golden Dragon')
  ) {
    return 'Golden Dragon';
  }

  return 'Sandbox';
}

export async function searchGameAccounts({
  sessionId,
  game,
  query = ''
}) {
  let request = supabase
    .from('sandbox_game_accounts')
    .select(`
      *,
      customer:sandbox_customers(
        id,
        username,
        first_name,
        last_name,
        email,
        balance
      )
    `)
    .eq('session_id', sessionId)
    .order('game_username', {
      ascending: true
    });

  const searchFilter = buildIlikeFilter(
    ['game_username', 'nickname', 'game'],
    query
  );

  if (searchFilter) {
    request = request.or(searchFilter);
  }

  const { data, error } =
    await request;

  if (error) {
    throw error;
  }

  const matchingAccounts = data.filter(account =>
    gameNamesMatch(account.game, game)
  );

  return attachGameWalletBalance(
    matchingAccounts
  );
}

export async function getGameAccount(
  accountId
) {
  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .select(`
      *,
      customer:sandbox_customers(
        id,
        username,
        first_name,
        last_name,
        email,
        balance
      )
    `)
    .eq('id', accountId)
    .single();

  if (error || !data) {
    const notFound =
      new Error('Game account not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  const [enriched] =
    await attachGameWalletBalance([data]);

  return enriched;
}

async function insertGameHistory({
  account,
  type,
  amount,
  description
}) {
  const { error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .insert({
      session_id: account.session_id,
      customer_id: account.customer_id,
      game_account_id: account.id,
      game: account.game,
      game_username:
        account.game_username,
      type,
      amount,
      description
    });

  if (error) {
    throw error;
  }
}

function buildGameHistoryDescription({
  account,
  action,
  amount,
  note
}) {
  const description = {
    kind: 'GAME_HISTORY',
    game: account.game,
    mobileId:
      account.game_username,
    action,
    amount,
    executedAt:
      new Date().toISOString(),
    manager: 'TrainingStore',
    status: 'Approved'
  };

  const normalizedNote =
    String(note ?? '').trim();
  if (normalizedNote) {
    description.note = normalizedNote;
  }

  return JSON.stringify(description);
}

function throwGameMovementError(error) {
  if (/game account not found/i.test(error.message)) {
    error.statusCode = 404;
  } else if (
    /valid amount|required|unsupported|insufficient/i
      .test(error.message)
  ) {
    error.statusCode = 400;
  }

  throw error;
}

export async function rechargeAccount({
  accountId,
  amount,
  note
}) {
  const account =
    await getGameAccount(accountId);

  const value = Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    const error =
      new Error('Valid amount required');
    error.statusCode = 400;
    throw error;
  }

  const description =
    buildGameHistoryDescription({
      account,
      action: 'Purchase',
      amount: value,
      note
    });

  const { error } = await supabase.rpc(
    'recharge_sandbox_game_account',
    {
      p_account_id: accountId,
      p_amount: value,
      p_description: description
    }
  );

  if (error) {
    throwGameMovementError(error);
  }

  return getGameAccount(accountId);
}

export async function redeemAccount({
  accountId,
  amount,
  note
}) {
  const account =
    await getGameAccount(accountId);

  const value = Number(amount);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    const error =
      new Error('Valid amount required');
    error.statusCode = 400;
    throw error;
  }

  if (Number(account.balance) < value) {
    const error =
      new Error(
        'Insufficient game balance'
      );
    error.statusCode = 400;
    throw error;
  }

  const description =
    buildGameHistoryDescription({
      account,
      action: 'Redeem',
      amount: value,
      note
    });

  const { error } = await supabase.rpc(
    'redeem_sandbox_game_account',
    {
      p_account_id: accountId,
      p_amount: value,
      p_description: description
    }
  );

  if (error) {
    throwGameMovementError(error);
  }

  return getGameAccount(accountId);
}

export async function resetGamePassword({
  accountId,
  newPassword
}) {
  const password =
    String(newPassword ?? '').trim();

  if (!password) {
    const error =
      new Error(
        'newPassword is required'
      );
    error.statusCode = 400;
    throw error;
  }

  const account =
    await getGameAccount(accountId);

  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .update({
      password
    })
    .eq('id', accountId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await insertGameHistory({
    account,
    type: 'GAME RESET PASSWORD',
    amount: null,
    description:
      `${account.game} password reset for ${account.game_username}`
  });

  return getGameAccount(data.id);
}

export async function createGameAccount({
  sessionId,
  customerId,
  game,
  gameUsername,
  nickname,
  password,
  customerName,
  trainingMode = ORION_STARS_TRAINING_MODES.FREE_SIMULATOR,
  accountPolicyEvaluation
}) {
  const username =
    String(gameUsername ?? '').trim();

  const nextPassword =
    String(password ?? '').trim();

  const nextNickname =
    String(nickname ?? '').trim() ||
    username;

  if (
    !username ||
    !nextPassword
  ) {
    const error =
      new Error(
        'gameUsername and password are required'
      );
    error.statusCode = 400;
    throw error;
  }

  if (game === ORION_STARS_GAME) {
    assertOrionAccountCreationPolicyBoundary({
      trainingMode,
      accountPolicyEvaluation
    });
  }

  let resolvedCustomerId =
    customerId;

  if (!resolvedCustomerId) {
      const name =
      String(customerName ?? '').trim();

    if (name) {
      resolvedCustomerId =
        await resolveOrCreateSandboxCustomer({
          sessionId,
          name
        });
    }
  }

  if (!resolvedCustomerId) {
    const { data: customer, error } =
      await supabase
        .from('sandbox_customers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('username', username)
        .maybeSingle();

    if (error) {
      throw error;
    }

    resolvedCustomerId =
      customer?.id ||
      await resolveOrCreateSandboxCustomer({
        sessionId,
        name:
          customerName ||
          username
      });
  }

  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .insert({
      session_id: sessionId,
      customer_id: resolvedCustomerId,
      game,
      game_username: username,
      nickname: nextNickname,
      password: nextPassword,
      balance: 0
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  await insertGameHistory({
    account: data,
    type: 'GAME CREATE ACCOUNT',
    amount: null,
    description:
      `${game} account created: ${username}`
  });

  const createdAccount = await getGameAccount(data.id);

  if (game !== ORION_STARS_GAME) {
    return createdAccount;
  }

  return {
    ...createdAccount,
    adapterOutcome: buildOrionAccountCreationOutcome({
      account: createdAccount,
      trainingMode
    })
  };
}

async function resolveOrCreateSandboxCustomer({
  sessionId,
  name
}) {
  const { data: existing, error } =
    await supabase
      .from('sandbox_customers')
      .select('id')
      .eq('session_id', sessionId)
      .or(
        [
          `first_name.ilike.${name}`,
          `username.ilike.${name}`
        ].join(',')
      )
      .limit(1);

  if (error) {
    throw error;
  }

  if (existing.length > 0) {
    return existing[0].id;
  }

  const normalized =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') ||
    'golden_customer';

  const suffix =
    Math.floor(
      1000 + Math.random() * 9000
    );

  const { data, error: insertError } =
    await supabase
      .from('sandbox_customers')
      .insert({
        session_id: sessionId,
        username:
          `${normalized}_${suffix}`,
        first_name: name,
        last_name: '',
        email:
          `${normalized}_${suffix}@sandbox.local`,
        balance: 0
      })
      .select('id')
      .single();

  if (insertError) {
    throw insertError;
  }

  return data.id;
}

export async function getGameAccountHistory({
  sessionId,
  customerId,
  game
}) {
  const { data, error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data
    .map(normalizeHistoryItem)
    .filter(item =>
      !game || gameNamesMatch(
        item.game,
        game
      )
    );
}

export async function hasMatchingGameAction({
  operation,
  type
}) {
  const { data, error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .select('id')
    .eq(
      'session_id',
      operation.session_id
    )
    .eq(
      'customer_id',
      operation.customer_id
    )
    .eq('type', type)
    .eq('amount', operation.amount)
    .eq(
      'game_account_id',
      operation.game_account_id
    )
    .gte(
      'created_at',
      operation.created_at
    )
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}

export async function findRelatedGameAction({
  operation,
  type
}) {
  const { data, error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .select('id, type, amount, created_at, description')
    .eq(
      'session_id',
      operation.session_id
    )
    .eq(
      'customer_id',
      operation.customer_id
    )
    .eq('type', type)
    .eq(
      'game_account_id',
      operation.game_account_id
    )
    .gte(
      'created_at',
      operation.created_at
    )
    .order('created_at', {
      ascending: true
    });

  if (error) {
    throw error;
  }

  const accountUsername =
    operation.game_account?.game_username;
  const accountGame =
    operation.game_account?.game;

  const parsedRows = (data || []).map(row => {
    let details = {};

    try {
      details = JSON.parse(
        row.description || '{}'
      );
    } catch {
      details = {};
    }

    return {
      ...row,
      details
    };
  });

  return (
    parsedRows.find(row =>
      (!accountGame ||
        row.details.game === accountGame) &&
      (!accountUsername ||
        row.details.mobileId === accountUsername ||
        row.details.playerId === accountUsername)
    ) ||
    parsedRows[0] ||
    null
  );
}

export async function hasCreatedAccount({
  operation,
  requestData = {}
}) {
  const gameUsername =
    String(requestData.gameId ?? '')
      .trim();

  if (!gameUsername) {
    return false;
  }

  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .select('id')
    .eq(
      'session_id',
      operation.session_id
    )
    .eq('customer_id', operation.customer_id)
    .eq('game', operation.game_account?.game || operation.game || '')
    .eq('game_username', gameUsername)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}

export async function getConfirmedCreatedAccountEvidence({
  operation,
  requestData = {},
  backendConfirmedAt
}) {
  const gameUsername =
    String(requestData.gameId ?? '').trim();

  if (
    operation.type !== 'CREATE ACCOUNT' ||
    (operation.game_account?.game || operation.game) !== ORION_STARS_GAME ||
    !gameUsername
  ) {
    return null;
  }

  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .select('id, session_id, customer_id, game, game_username, created_at')
    .eq('session_id', operation.session_id)
    .eq('customer_id', operation.customer_id)
    .eq('game', ORION_STARS_GAME)
    .eq('game_username', gameUsername)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const outcome = buildOrionAccountCreationOutcome({
    account: data,
    trainingMode: ORION_STARS_TRAINING_MODES.FREE_SIMULATOR
  });

  return {
    ...outcome.evidence,
    originatingOperationId: operation.id,
    backendConfirmedAt: backendConfirmedAt || null,
    publicationStatus: 'CANDIDATE_ONLY'
  };
}
