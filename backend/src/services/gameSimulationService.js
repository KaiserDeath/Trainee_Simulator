import { supabase }
  from '../config/supabase.js';

import {
  GAME_HISTORY_TABLE,
  gameHistoryMatchesOperation
} from './historyPolicy.js';

const normalizeGame = game =>
  String(game ?? '')
    .replaceAll('-', ' ')
    .trim()
    .toLowerCase();

const gameMatches = (
  accountGame,
  requestedGame
) => {
  return (
    normalizeGame(accountGame) ===
    normalizeGame(requestedGame)
  );
};

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

  const term = query.trim();

  if (term) {
    request = request.or(
      [
        `game_username.ilike.%${term}%`,
        `game.ilike.%${term}%`
      ].join(',')
    );
  }

  const { data, error } =
    await request;

  if (error) {
    throw error;
  }

  return data.filter(account =>
    gameMatches(account.game, game)
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

  return data;
}

async function updateGameBalance(
  account,
  nextBalance
) {
  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .update({
      balance: nextBalance
    })
    .eq('id', account.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
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
  amount
}) {
  return JSON.stringify({
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
  });
}

export async function rechargeAccount({
  accountId,
  amount
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

  const newBalance =
    account.game === 'Golden Dragon'
      ? Number(account.balance)
      : Number(account.balance) + value;

  const updated =
    await updateGameBalance(
      account,
      newBalance
    );

  await insertGameHistory({
    account,
    type: 'GAME ADD CREDITS',
    amount: value,
    description:
      buildGameHistoryDescription({
        account,
        action: 'Purchase',
        amount: value
      })
  });

  return updated;
}

export async function redeemAccount({
  accountId,
  amount
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

  const updated =
    await updateGameBalance(
      account,
      Number(account.balance) - value
    );

  await insertGameHistory({
    account,
    type: 'GAME WITHDRAW CREDITS',
    amount: value,
    description:
      buildGameHistoryDescription({
        account,
        action: 'Redeem',
        amount: value
      })
  });

  return updated;
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

  return data;
}

export async function createGameAccount({
  sessionId,
  customerId,
  game,
  gameUsername,
  password,
  customerName
}) {
  const username =
    String(gameUsername ?? '').trim();

  const nextPassword =
    String(password ?? '').trim();

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

  return data;
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
  customerId
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

  return data.map(normalizeHistoryItem);
}

export async function hasMatchingGameAction({
  operation,
  type
}) {
  const { data, error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .select(`
      id,
      game_account_id,
      game,
      game_username,
      description
    `)
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
    .or(
      [
        `game_account_id.eq.${operation.game_account_id}`,
        'game_account_id.is.null'
      ].join(',')
    )
    .gte(
      'created_at',
      operation.created_at
    )
    .limit(1);

  if (error) {
    throw error;
  }

  return data.some(row =>
    gameHistoryMatchesOperation(
      row,
      operation
    )
  );
}

export async function findRelatedGameAction({
  operation,
  type
}) {
  const { data, error } = await supabase
    .from(GAME_HISTORY_TABLE)
    .select(`
      id,
      game_account_id,
      game,
      game_username,
      type,
      amount,
      created_at,
      description
    `)
    .eq(
      'session_id',
      operation.session_id
    )
    .eq(
      'customer_id',
      operation.customer_id
    )
    .eq('type', type)
    .or(
      [
        `game_account_id.eq.${operation.game_account_id}`,
        'game_account_id.is.null'
      ].join(',')
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
      gameHistoryMatchesOperation(
        row,
        operation
      )
    ) ||
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
    .eq('game', operation.game_account?.game || '')
    .eq('game_username', gameUsername)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}
