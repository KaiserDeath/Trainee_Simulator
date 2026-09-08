// Exercises the pg-backed client against a real PostgreSQL database, because
// the translation it performs cannot be proven against a mock.
//
// Set TREZ_PG_TEST_URL to a disposable database that has the migrations
// applied. The suite skips entirely when it is absent.

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { createPgClient } from '../../src/db/pgClient.js';

const connectionString = process.env.TREZ_PG_TEST_URL;
const describe = connectionString ? test : test.skip;

const client = connectionString ? createPgClient({ connectionString }) : null;
const sessionId = randomUUID();
const customerId = randomUUID();
const otherCustomerId = randomUUID();
const accountId = randomUUID();

test.after(async () => {
  if (!client) return;
  await client.from('sandbox_operations').delete().eq('session_id', sessionId);
  await client.from('sandbox_game_accounts').delete().eq('session_id', sessionId);
  await client.from('sandbox_customers').delete().eq('session_id', sessionId);
  await client.from('trainee_sessions').delete().eq('id', sessionId);
  await client.end();
});

describe('seeds a session with customers and accounts', async () => {
  const session = await client
    .from('trainee_sessions')
    .insert({ id: sessionId, trainee_name: 'PG Adapter Test' })
    .select()
    .single();
  assert.equal(session.error, null, JSON.stringify(session.error));
  assert.equal(session.data.trainee_name, 'PG Adapter Test');

  const customers = await client
    .from('sandbox_customers')
    .insert([
      {
        id: customerId,
        session_id: sessionId,
        username: 'zoe_tester',
        first_name: 'Zoe',
        last_name: 'Tester',
        balance: 100,
      },
      {
        id: otherCustomerId,
        session_id: sessionId,
        username: 'adam_tester',
        first_name: 'Adam',
        last_name: 'Tester',
        balance: 50,
      },
    ])
    .select();
  assert.equal(customers.error, null, JSON.stringify(customers.error));
  assert.equal(customers.data.length, 2);

  const account = await client
    .from('sandbox_game_accounts')
    .insert({
      id: accountId,
      session_id: sessionId,
      customer_id: customerId,
      game: 'Orion Stars',
      game_username: 'zoe_orion',
      balance: 25,
    })
    .select()
    .single();
  assert.equal(account.error, null, JSON.stringify(account.error));
});

describe('filters, ordering and limits match builder semantics', async () => {
  const ascending = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .order('username', { ascending: true });
  assert.deepEqual(
    ascending.data.map((row) => row.username),
    ['adam_tester', 'zoe_tester'],
  );

  const descending = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .order('username', { ascending: false });
  assert.equal(descending.data[0].username, 'zoe_tester');

  const limited = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .limit(1);
  assert.equal(limited.data.length, 1);

  const negated = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .neq('username', 'zoe_tester');
  assert.deepEqual(negated.data.map((row) => row.username), ['adam_tester']);
});

describe('an empty in() list matches nothing instead of erroring', async () => {
  const result = await client
    .from('sandbox_customers')
    .select('id')
    .eq('session_id', sessionId)
    .in('id', []);

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.deepEqual(result.data, []);
});

describe('or() translates the PostgREST filter string', async () => {
  const result = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .or('username.ilike.%zoe%,first_name.ilike.%adam%');

  const names = result.data.map((row) => row.username).sort();
  assert.deepEqual(names, ['adam_tester', 'zoe_tester']);
});

describe('not() supports the is-null and like forms', async () => {
  const notNull = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .not('username', 'is', null);
  assert.equal(notNull.data.length, 2);

  const notLike = await client
    .from('sandbox_customers')
    .select('username')
    .eq('session_id', sessionId)
    .not('username', 'like', 'zoe%');
  assert.deepEqual(notLike.data.map((row) => row.username), ['adam_tester']);
});

describe('head with exact count returns a count and no rows', async () => {
  const result = await client
    .from('sandbox_customers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data, null);
  assert.equal(result.count, 2);
});

describe('single and maybeSingle differ on the zero-row case', async () => {
  const missingSingle = await client
    .from('sandbox_customers')
    .select('id')
    .eq('id', randomUUID())
    .single();
  assert.equal(missingSingle.data, null);
  assert.ok(missingSingle.error, 'single() must report an error when no row matches');

  const missingMaybe = await client
    .from('sandbox_customers')
    .select('id')
    .eq('id', randomUUID())
    .maybeSingle();
  assert.equal(missingMaybe.data, null);
  assert.equal(missingMaybe.error, null, 'maybeSingle() must not error on zero rows');
});

describe('a many-to-one embed returns an object', async () => {
  const result = await client
    .from('sandbox_game_accounts')
    .select('id, game_username, customer:sandbox_customers(id, username, balance)')
    .eq('id', accountId)
    .single();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data.game_username, 'zoe_orion');
  assert.ok(result.data.customer && !Array.isArray(result.data.customer));
  assert.equal(result.data.customer.username, 'zoe_tester');
});

describe('a one-to-many embed returns an array, empty when unmatched', async () => {
  const withAccounts = await client
    .from('sandbox_customers')
    .select('username, game_accounts:sandbox_game_accounts(id, game, balance)')
    .eq('id', customerId)
    .single();

  assert.equal(withAccounts.error, null, JSON.stringify(withAccounts.error));
  assert.ok(Array.isArray(withAccounts.data.game_accounts));
  assert.equal(withAccounts.data.game_accounts.length, 1);
  assert.equal(withAccounts.data.game_accounts[0].game, 'Orion Stars');

  const withoutAccounts = await client
    .from('sandbox_customers')
    .select('username, game_accounts:sandbox_game_accounts(id)')
    .eq('id', otherCustomerId)
    .single();
  assert.deepEqual(withoutAccounts.data.game_accounts, []);
});

describe('a nullable many-to-one embed yields null, not a missing key', async () => {
  const operationId = randomUUID();
  await client.from('sandbox_operations').insert({
    id: operationId,
    session_id: sessionId,
    customer_id: customerId,
    game_account_id: null,
    type: 'ADD CREDITS',
    status: 'PENDING',
    amount: 10,
  });

  const result = await client
    .from('sandbox_operations')
    .select('id, customer:sandbox_customers(username), game_account:sandbox_game_accounts(game)')
    .eq('id', operationId)
    .single();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data.customer.username, 'zoe_tester');
  assert.equal(result.data.game_account, null);
});

describe('update returns null data when no row matches', async () => {
  const result = await client
    .from('sandbox_customers')
    .update({ balance: 1 })
    .eq('id', randomUUID())
    .select()
    .maybeSingle();

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(result.data, null);
});

describe('a compound update acts as optimistic concurrency', async () => {
  const first = await client
    .from('sandbox_customers')
    .update({ balance: 200 })
    .eq('id', otherCustomerId)
    .eq('balance', 50)
    .select()
    .maybeSingle();
  assert.equal(Number(first.data.balance), 200);

  const second = await client
    .from('sandbox_customers')
    .update({ balance: 300 })
    .eq('id', otherCustomerId)
    .eq('balance', 50)
    .select()
    .maybeSingle();
  assert.equal(second.data, null, 'the stale guard must match no rows');
});

describe('a unique violation surfaces SQLSTATE 23505', async () => {
  const result = await client.from('sandbox_customers').insert({
    id: customerId,
    session_id: sessionId,
    username: 'duplicate_pk',
    first_name: 'Dup',
    last_name: 'Licate',
    balance: 0,
  });

  assert.ok(result.error, 'a duplicate primary key must report an error');
  assert.equal(result.error.code, '23505');
});

describe('a missing column keeps the PostgreSQL message text', async () => {
  const result = await client
    .from('sandbox_customers')
    .update({ definitely_not_a_column: 1 })
    .eq('id', customerId);

  assert.ok(result.error);
  // operationService.js branches on this exact wording.
  assert.match(result.error.message, /column .* does not exist|does not exist/i);
});

describe('the builder is lazily thenable for Promise.all', async () => {
  const pending = client.from('sandbox_customers').select('id').eq('session_id', sessionId);
  const [resolved] = await Promise.all([pending]);

  assert.equal(resolved.error, null, JSON.stringify(resolved.error));
  assert.equal(resolved.data.length, 2);
});

describe('a chain can be extended after being stored', async () => {
  let query = client.from('sandbox_customers').select('username').eq('session_id', sessionId);
  query = query.eq('username', 'zoe_tester');

  const result = await query;
  assert.equal(result.data.length, 1);
});

describe('rpc returns a bare value rather than an array', async () => {
  const result = await client.rpc('hub_expire_assessment_attempts');

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.equal(typeof result.data, 'number', 'an INTEGER-returning function must yield a number');
});

describe('rpc accepts an object for a jsonb argument', async () => {
  const operationId = randomUUID();
  const result = await client.rpc('create_reserved_sandbox_operation', {
    p_operation: {
      id: operationId,
      session_id: sessionId,
      customer_id: customerId,
      type: 'ADD CREDITS',
      status: 'PENDING',
      amount: 5,
    },
  });

  assert.equal(result.error, null, JSON.stringify(result.error));
  assert.ok(result.data && !Array.isArray(result.data), 'composite return must be an object');
  assert.equal(result.data.id, operationId);
});
