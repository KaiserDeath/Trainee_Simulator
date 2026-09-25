import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasCreatedAccount
} from '../../src/domain/createAccountGrading.js';

const SESSION = 'session-1';
const REQUESTED_CUSTOMER = 'customer-requested';
const OTHER_CUSTOMER = 'customer-typed-name';
const REQUESTED_AT = '2026-09-25T15:00:00.000Z';

function createClientFixture(accounts) {
  const queries = [];

  return {
    queries,
    client: {
      from(table) {
        assert.equal(table, 'sandbox_game_accounts');
        const filters = [];
        queries.push(filters);

        const query = {
          select() {
            return query;
          },
          eq(field, value) {
            filters.push([field, (row) => row[field] === value]);
            return query;
          },
          gte(field, value) {
            filters.push([
              field,
              (row) => Date.parse(row[field]) >= Date.parse(value)
            ]);
            return query;
          },
          limit(count) {
            const data = accounts
              .filter((row) => filters.every(([, matches]) => matches(row)))
              .slice(0, count)
              .map(({ id }) => ({ id }));
            return Promise.resolve({ data, error: null });
          }
        };
        return query;
      }
    }
  };
}

function goldenDragonAccount(overrides = {}) {
  return {
    id: 'gd-account',
    session_id: SESSION,
    customer_id: OTHER_CUSTOMER,
    game: 'Golden Dragon',
    game_username: '5551234567',
    password: 'gd9281',
    created_at: '2026-09-25T15:02:00.000Z',
    ...overrides
  };
}

function createAccountOperation(game, overrides = {}) {
  return {
    id: 'operation-1',
    session_id: SESSION,
    customer_id: REQUESTED_CUSTOMER,
    game,
    game_account: null,
    type: 'CREATE ACCOUNT',
    created_at: REQUESTED_AT,
    ...overrides
  };
}

function grade(accounts, { operation, requestData }) {
  const { client } = createClientFixture(accounts);
  return hasCreatedAccount({ client, operation, requestData });
}

const matchingAnswer = Object.freeze({
  gameId: '5551234567',
  newPassword: 'gd9281',
  kiosk: 'GoldenDragon'
});

test('Golden Dragon passes when the typed name created another customer', async () => {
  assert.equal(
    await grade([goldenDragonAccount()], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: matchingAnswer
    }),
    true
  );
});

test('Golden Dragon ignores surrounding whitespace in the answer', async () => {
  assert.equal(
    await grade([goldenDragonAccount()], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: {
        gameId: ' 5551234567 ',
        newPassword: ' gd9281 '
      }
    }),
    true
  );
});

test('Golden Dragon fails when the Mobile Password does not match', async () => {
  assert.equal(
    await grade([goldenDragonAccount()], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: { ...matchingAnswer, newPassword: 'gd0000' }
    }),
    false
  );
});

test('Golden Dragon fails when the Mobile ID does not match', async () => {
  assert.equal(
    await grade([goldenDragonAccount()], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: { ...matchingAnswer, gameId: '5559999999' }
    }),
    false
  );
});

test('Golden Dragon fails for an account that existed before the request', async () => {
  assert.equal(
    await grade(
      [goldenDragonAccount({ created_at: '2026-09-25T14:59:59.000Z' })],
      {
        operation: createAccountOperation('Golden Dragon'),
        requestData: matchingAnswer
      }
    ),
    false
  );
});

test('Golden Dragon accepts an account created at the request time', async () => {
  assert.equal(
    await grade([goldenDragonAccount({ created_at: REQUESTED_AT })], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: matchingAnswer
    }),
    true
  );
});

test('Golden Dragon fails for an account from another session', async () => {
  assert.equal(
    await grade([goldenDragonAccount({ session_id: 'session-2' })], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: matchingAnswer
    }),
    false
  );
});

test('Golden Dragon fails for an account in another game', async () => {
  assert.equal(
    await grade([goldenDragonAccount({ game: 'Vblink' })], {
      operation: createAccountOperation('Golden Dragon'),
      requestData: matchingAnswer
    }),
    false
  );
});

test('Golden Dragon fails without a password or request time, before querying', async () => {
  for (const { operation, requestData } of [
    {
      operation: createAccountOperation('Golden Dragon'),
      requestData: { ...matchingAnswer, newPassword: '   ' }
    },
    {
      operation: createAccountOperation('Golden Dragon', { created_at: null }),
      requestData: matchingAnswer
    }
  ]) {
    const fixture = createClientFixture([goldenDragonAccount()]);
    assert.equal(
      await hasCreatedAccount({
        client: fixture.client,
        operation,
        requestData
      }),
      false
    );
    assert.equal(fixture.queries.length, 0);
  }
});

test('any game fails without a Game ID', async () => {
  for (const game of ['Golden Dragon', 'Orion Stars']) {
    assert.equal(
      await grade([goldenDragonAccount({ game })], {
        operation: createAccountOperation(game),
        requestData: { ...matchingAnswer, gameId: '' }
      }),
      false
    );
  }
});

test('other games still require the account to belong to the requested customer', async () => {
  const orionAccount = {
    id: 'os-account',
    session_id: SESSION,
    game: 'Orion Stars',
    game_username: 'jdoe_os',
    password: '123456',
    created_at: '2026-09-25T15:02:00.000Z'
  };
  const answer = { gameId: 'jdoe_os', newPassword: '123456' };

  assert.equal(
    await grade([{ ...orionAccount, customer_id: REQUESTED_CUSTOMER }], {
      operation: createAccountOperation('Orion Stars'),
      requestData: answer
    }),
    true
  );
  assert.equal(
    await grade([{ ...orionAccount, customer_id: OTHER_CUSTOMER }], {
      operation: createAccountOperation('Orion Stars'),
      requestData: answer
    }),
    false
  );
});
