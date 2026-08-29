import {
  randomUUID
} from 'node:crypto';

import {
  createClient
} from '@supabase/supabase-js';

import {
  assertLocalE2EBackendEnvironment
} from '../../src/config/localE2EGuard.js';

export const E2E_TRAINEE_PREFIX =
  '__TREZ_LOCAL_E2E__';

let client;

function getClient() {
  assertLocalE2EBackendEnvironment();

  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return client;
}

async function getE2ESessions() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('trainee_sessions')
    .select('id, trainee_name')
    .like(
      'trainee_name',
      `${E2E_TRAINEE_PREFIX}%`
    );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function countLocalE2ESessions() {
  return (await getE2ESessions()).length;
}

export async function cleanupLocalE2ESessions() {
  const sessions = await getE2ESessions();
  const backendUrl =
    process.env.TREZ_E2E_BACKEND_URL;

  for (const session of sessions) {
    try {
      const response = await fetch(
        `${backendUrl}/api/sessions/${session.id}`,
        { method: 'DELETE' }
      );

      if (
        !response.ok &&
        response.status !== 404
      ) {
        throw new Error(
          `Cleanup endpoint returned ${response.status}.`
        );
      }
    } catch {
      // The database fallback below also handles a backend that failed to start.
    }
  }

  const remaining = await getE2ESessions();
  if (remaining.length > 0) {
    const supabase = getClient();
    const { error } = await supabase
      .from('trainee_sessions')
      .delete()
      .in(
        'id',
        remaining.map(session => session.id)
      );

    if (error) {
      throw error;
    }
  }

  const count =
    await countLocalE2ESessions();

  if (count !== 0) {
    throw new Error(
      `Local E2E cleanup left ${count} session(s).`
    );
  }
}

async function getCustomer(
  supabase,
  sessionId,
  username
) {
  const { data, error } = await supabase
    .from('sandbox_customers')
    .select('*')
    .eq('session_id', sessionId)
    .eq('username', username)
    .single();

  if (error || !data) {
    throw error || new Error(
      `Missing seeded customer ${username}.`
    );
  }

  return data;
}

async function getAccount(
  supabase,
  sessionId,
  customerId,
  game
) {
  const { data, error } = await supabase
    .from('sandbox_game_accounts')
    .select('*')
    .eq('session_id', sessionId)
    .eq('customer_id', customerId)
    .eq('game', game)
    .single();

  if (error || !data) {
    throw error || new Error(
      `Missing ${game} seeded account.`
    );
  }

  return data;
}

async function reserveOperation(
  supabase,
  operation
) {
  return supabase.rpc(
    'create_reserved_sandbox_operation',
    { p_operation: operation }
  );
}

function buildOperation({
  sessionId,
  customer,
  account,
  type,
  amount,
  createdAt
}) {
  return {
    id: randomUUID(),
    session_id: sessionId,
    customer_id: customer.id,
    game_account_id: account.id,
    game: account.game,
    type,
    amount: amount ?? null,
    customer_balance_at_request:
      Number(customer.balance),
    game_balance_at_request:
      Number(account.balance),
    created_at: createdAt
  };
}

function assertRejectedByQueue(
  result,
  description
) {
  if (!result.error) {
    throw new Error(
      `${description} was accepted.`
    );
  }

  if (
    result.error.code !== '23505' &&
    !/pending movement|pending request|unique/i
      .test(result.error.message || '')
  ) {
    throw result.error;
  }
}

export async function seedDeterministicScenario(
  sessionId
) {
  const supabase = getClient();
  const john = await getCustomer(
    supabase,
    sessionId,
    'johndoe'
  );
  const jane = await getCustomer(
    supabase,
    sessionId,
    'janesmith'
  );
  const johnOrion = await getAccount(
    supabase,
    sessionId,
    john.id,
    'Orion Stars'
  );
  const johnVblink = await getAccount(
    supabase,
    sessionId,
    john.id,
    'Vblink'
  );
  const janeOrion = await getAccount(
    supabase,
    sessionId,
    jane.id,
    'Orion Stars'
  );
  const { data: wallet, error: walletError } =
    await supabase
      .from('sandbox_game_wallets')
      .select('*')
      .eq('session_id', sessionId)
      .eq('game', 'Orion Stars')
      .single();

  if (walletError || !wallet) {
    throw walletError || new Error(
      'Missing Orion Stars loading wallet.'
    );
  }

  const baseTime = Date.now();
  const addCredits = buildOperation({
    sessionId,
    customer: john,
    account: johnOrion,
    type: 'ADD CREDITS',
    amount: 40,
    createdAt:
      new Date(baseTime).toISOString()
  });
  const cancelledAddCredits = buildOperation({
    sessionId,
    customer: jane,
    account: janeOrion,
    type: 'ADD CREDITS',
    amount: 30,
    createdAt:
      new Date(baseTime + 1).toISOString()
  });
  const orionRequest = buildOperation({
    sessionId,
    customer: john,
    account: johnOrion,
    type: 'CREATE ACCOUNT',
    createdAt:
      new Date(baseTime + 2).toISOString()
  });
  const vblinkRequest = buildOperation({
    sessionId,
    customer: john,
    account: johnVblink,
    type: 'CREATE ACCOUNT',
    createdAt:
      new Date(baseTime + 3).toISOString()
  });

  for (const operation of [
    addCredits,
    cancelledAddCredits,
    orionRequest,
    vblinkRequest
  ]) {
    const result = await reserveOperation(
      supabase,
      operation
    );

    if (result.error) {
      throw result.error;
    }
  }

  const duplicateMovement = buildOperation({
    sessionId,
    customer: john,
    account: johnVblink,
    type: 'WITHDRAW CREDITS',
    amount: 10,
    createdAt:
      new Date(baseTime + 4).toISOString()
  });
  const sameGameRequest = buildOperation({
    sessionId,
    customer: john,
    account: johnOrion,
    type: 'REFRESH BALANCE',
    createdAt:
      new Date(baseTime + 5).toISOString()
  });

  assertRejectedByQueue(
    await reserveOperation(
      supabase,
      duplicateMovement
    ),
    'Second pending movement for one customer'
  );
  assertRejectedByQueue(
    await reserveOperation(
      supabase,
      sameGameRequest
    ),
    'Second pending request for one customer and game'
  );

  const { data: pending, error: pendingError } =
    await supabase
      .from('sandbox_operations')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'PENDING');

  if (pendingError) {
    throw pendingError;
  }

  if (pending.length !== 4) {
    throw new Error(
      `Expected four deterministic pending operations, got ${pending.length}.`
    );
  }

  return {
    operations: {
      addCredits,
      cancelledAddCredits,
      orionRequest,
      vblinkRequest
    },
    initial: {
      johnCustomerBalance:
        Number(john.balance),
      janeCustomerBalance:
        Number(jane.balance),
      johnOrionBalance:
        Number(johnOrion.balance),
      orionWalletBalance:
        Number(wallet.balance)
    },
    ids: {
      johnCustomer: john.id,
      janeCustomer: jane.id,
      johnOrionAccount: johnOrion.id,
      janeOrionAccount: janeOrion.id
    },
    usernames: {
      johnOrion:
        johnOrion.game_username
    },
    queue: {
      duplicateMovementRejected: true,
      sameGameRequestRejected: true,
      pendingCount: pending.length
    }
  };
}

export async function getScenarioSnapshot(
  sessionId
) {
  const supabase = getClient();
  const queries = await Promise.all([
    supabase
      .from('trainee_sessions')
      .select('*')
      .eq('id', sessionId)
      .single(),
    supabase
      .from('sandbox_customers')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('sandbox_game_accounts')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('sandbox_game_wallets')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('sandbox_operations')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('sandbox_game_history')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('sandbox_transaction_history')
      .select('*')
      .eq('session_id', sessionId),
    supabase
      .from('trainee_action_logs')
      .select('*')
      .eq('session_id', sessionId)
  ]);

  for (const result of queries) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    session: queries[0].data,
    customers: queries[1].data || [],
    accounts: queries[2].data || [],
    wallets: queries[3].data || [],
    operations: queries[4].data || [],
    gameHistory: queries[5].data || [],
    customerHistory: queries[6].data || [],
    auditLog: queries[7].data || []
  };
}
