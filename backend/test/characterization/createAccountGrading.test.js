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

function orionAccount(overrides = {}) {
  return {
    id: 'os-account',
    session_id: SESSION,
    customer_id: REQUESTED_CUSTOMER,
    game: 'Orion Stars',
    game_username: 'jdoe_os',
    password: '123456',
    created_at: '2026-09-25T15:02:00.000Z',
    ...overrides
  };
}

const orionAnswer = Object.freeze({
  gameId: 'jdoe_os',
  newPassword: '123456',
  kiosk: 'OrionStars'
});

test('Orion Stars passes for an account linked to the requested customer', async () => {
  assert.equal(
    await grade([orionAccount()], {
      operation: createAccountOperation('Orion Stars'),
      requestData: orionAnswer
    }),
    true
  );
});

// The Orion panel links a new account to whichever player row is
// selected, or to a customer found by the typed Account, so a correct
// answer can land on another customer.
test('Orion Stars passes when the account got linked to another customer', async () => {
  assert.equal(
    await grade([orionAccount({ customer_id: OTHER_CUSTOMER })], {
      operation: createAccountOperation('Orion Stars'),
      requestData: orionAnswer
    }),
    true
  );
});

test('Orion Stars fails when the login password does not match', async () => {
  assert.equal(
    await grade([orionAccount()], {
      operation: createAccountOperation('Orion Stars'),
      requestData: { ...orionAnswer, newPassword: '654321' }
    }),
    false
  );
});

test('Orion Stars fails for an account that existed before the request', async () => {
  assert.equal(
    await grade(
      [orionAccount({ created_at: '2026-09-25T14:59:59.000Z' })],
      {
        operation: createAccountOperation('Orion Stars'),
        requestData: orionAnswer
      }
    ),
    false
  );
});

function vblinkAccount(overrides = {}) {
  return {
    id: 'vb-account',
    session_id: SESSION,
    customer_id: REQUESTED_CUSTOMER,
    game: 'Vblink',
    game_username: 'jdoe_vb',
    password: 'abc123',
    created_at: '2026-09-25T15:02:00.000Z',
    ...overrides
  };
}

const vblinkAnswer = Object.freeze({
  gameId: 'jdoe_vb',
  newPassword: 'abc123',
  kiosk: 'Vblink'
});

test('Vblink passes for an account linked to the requested customer', async () => {
  assert.equal(
    await grade([vblinkAccount()], {
      operation: createAccountOperation('Vblink'),
      requestData: vblinkAnswer
    }),
    true
  );
});

// The Vblink panel links a new account to the customer found or created
// from the typed Name (or the User Name when Name is blank).
test('Vblink passes when the typed Name linked the account to another customer', async () => {
  assert.equal(
    await grade([vblinkAccount({ customer_id: OTHER_CUSTOMER })], {
      operation: createAccountOperation('Vblink'),
      requestData: vblinkAnswer
    }),
    true
  );
});

test('Vblink ignores surrounding whitespace in the answer', async () => {
  assert.equal(
    await grade([vblinkAccount()], {
      operation: createAccountOperation('Vblink'),
      requestData: { gameId: ' jdoe_vb ', newPassword: ' abc123 ' }
    }),
    true
  );
});

test('Vblink fails when the User Name does not match', async () => {
  assert.equal(
    await grade([vblinkAccount()], {
      operation: createAccountOperation('Vblink'),
      requestData: { ...vblinkAnswer, gameId: 'someone_else' }
    }),
    false
  );
});

test('Vblink fails when the password does not match', async () => {
  assert.equal(
    await grade([vblinkAccount()], {
      operation: createAccountOperation('Vblink'),
      requestData: { ...vblinkAnswer, newPassword: 'xyz789' }
    }),
    false
  );
});

test('Vblink fails for an account that existed before the request', async () => {
  assert.equal(
    await grade(
      [vblinkAccount({ created_at: '2026-09-25T14:59:59.000Z' })],
      {
        operation: createAccountOperation('Vblink'),
        requestData: vblinkAnswer
      }
    ),
    false
  );
});

test('Vblink fails for an Orion Stars account with the same credentials', async () => {
  assert.equal(
    await grade([vblinkAccount({ game: 'Orion Stars' })], {
      operation: createAccountOperation('Vblink'),
      requestData: vblinkAnswer
    }),
    false
  );
});
