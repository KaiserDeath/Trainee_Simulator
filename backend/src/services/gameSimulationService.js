import { supabase }
  from '../config/supabase.js';

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
    .from(
      'sandbox_transaction_history'
    )
    .insert({
      session_id: account.session_id,
      customer_id: account.customer_id,
      type,
      amount,
      description
    });

  if (error) {
    throw error;
  }
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

  const updated =
    await updateGameBalance(
      account,
      Number(account.balance) + value
    );

  await insertGameHistory({
    account,
    type: 'GAME ADD CREDITS',
    amount: value,
    description:
      `${account.game} recharge for ${account.game_username}`
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
      `${account.game} redeem for ${account.game_username}`
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
  password
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

    if (!customer) {
      const notFound =
        new Error(
          'Customer not found for this username'
        );
      notFound.statusCode = 404;
      throw notFound;
    }

    resolvedCustomerId = customer.id;
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

export async function getGameAccountHistory({
  sessionId,
  customerId
}) {
  const { data, error } = await supabase
    .from('sandbox_transaction_history')
    .select('*')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data;
}

export async function hasMatchingGameAction({
  operation,
  type
}) {
  const { data, error } = await supabase
    .from(
      'sandbox_transaction_history'
    )
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
    .eq(
      'customer_id',
      operation.customer_id
    )
    .eq('game', operation.game_account.game)
    .eq('game_username', gameUsername)
    .limit(1);

  if (error) {
    throw error;
  }

  return data.length > 0;
}
