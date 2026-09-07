import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalHubAuth,
  hashPassword,
  verifyPassword,
  withLocalHubAuth,
} from '../../src/auth/localHubAuth.js';

const SECRET = 'local-development-secret-value-0123456789';

// Minimal in-memory stand-in for the Supabase data client, supporting only the
// chains localHubAuth uses against auth.users.
function createFakeClient(rows = []) {
  const table = [...rows];

  function builder() {
    const filters = [];
    let mode = 'select';
    let patch = null;
    let inserted = null;

    const matching = () =>
      table.filter((row) => filters.every(([column, value]) => row[column] === value));

    const chain = {
      select() {
        return chain;
      },
      eq(column, value) {
        filters.push([column, value]);
        return chain;
      },
      insert(values) {
        mode = 'insert';
        inserted = values;
        return chain;
      },
      update(values) {
        mode = 'update';
        patch = values;
        return chain;
      },
      delete() {
        mode = 'delete';
        return chain;
      },
      async maybeSingle() {
        return chain.then((result) => result);
      },
      async single() {
        return chain.then((result) => result);
      },
      then(resolve) {
        if (mode === 'insert') {
          if (table.some((row) => row.email === inserted.email)) {
            return Promise.resolve(
              resolve({ data: null, error: { message: 'duplicate key', code: '23505' } }),
            );
          }
          table.push({ ...inserted });
          return Promise.resolve(resolve({ data: { ...inserted }, error: null }));
        }

        if (mode === 'update') {
          const target = matching()[0];
          if (!target) return Promise.resolve(resolve({ data: null, error: null }));
          Object.assign(target, patch);
          return Promise.resolve(resolve({ data: { ...target }, error: null }));
        }

        if (mode === 'delete') {
          for (const row of matching()) table.splice(table.indexOf(row), 1);
          return Promise.resolve(resolve({ data: null, error: null }));
        }

        const found = matching()[0] || null;
        return Promise.resolve(resolve({ data: found ? { ...found } : null, error: null }));
      },
    };

    return chain;
  }

  return {
    rows: table,
    schema() {
      return { from: builder };
    },
    from: builder,
  };
}

function createAuth(rows) {
  const client = createFakeClient(rows);
  return { client, auth: createLocalHubAuth({ serviceClient: client, secret: SECRET }) };
}

test('rejects a secret that is too short to sign sessions', () => {
  assert.throws(
    () => createLocalHubAuth({ serviceClient: createFakeClient(), secret: 'short' }),
    /at least 32 characters/,
  );
});

test('scrypt hashing round-trips and rejects the wrong password', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('wrong password', stored), false);
});

test('a stored hash never contains the plaintext password', async () => {
  const stored = await hashPassword('Back12345');
  assert.equal(stored.includes('Back12345'), false);
  assert.match(stored, /^scrypt\$/);
});

test('the same password hashes differently each time', async () => {
  const first = await hashPassword('repeated');
  const second = await hashPassword('repeated');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('repeated', first), true);
  assert.equal(await verifyPassword('repeated', second), true);
});

test('malformed stored hashes are rejected rather than throwing', async () => {
  for (const stored of ['', 'not-a-hash', 'scrypt$only-two', 'bcrypt$a$b', null]) {
    assert.equal(await verifyPassword('anything', stored), false);
  }
});

test('sign in issues a session and rejects a bad password', async () => {
  const { auth } = createAuth();
  const created = await auth.admin.createUser({
    email: 'Tuser@auth.trez.invalid',
    password: 'first-password',
  });
  assert.equal(created.error, null);

  const ok = await auth.signInWithPassword({
    email: 'tuser@auth.trez.invalid',
    password: 'first-password',
  });
  assert.equal(ok.error, null);
  assert.equal(ok.data.user.id, created.data.user.id);
  assert.ok(ok.data.session.access_token);
  assert.ok(ok.data.session.refresh_token);

  const bad = await auth.signInWithPassword({
    email: 'tuser@auth.trez.invalid',
    password: 'wrong',
  });
  assert.equal(bad.data.session, null);
  assert.match(bad.error.message, /Invalid login credentials/);
});

test('an unknown account fails with the same message as a wrong password', async () => {
  const { auth } = createAuth();
  const unknown = await auth.signInWithPassword({ email: 'nobody@auth.trez.invalid', password: 'x' });
  assert.match(unknown.error.message, /Invalid login credentials/);
});

test('getUser accepts a freshly issued access token', async () => {
  const { auth } = createAuth();
  const created = await auth.admin.createUser({ email: 'a@auth.trez.invalid', password: 'pw' });
  const session = await auth.signInWithPassword({ email: 'a@auth.trez.invalid', password: 'pw' });

  const verified = await auth.getUser(session.data.session.access_token);
  assert.equal(verified.error, null);
  assert.equal(verified.data.user.id, created.data.user.id);
});

test('a tampered access token is rejected', async () => {
  const { auth } = createAuth();
  await auth.admin.createUser({ email: 'b@auth.trez.invalid', password: 'pw' });
  const session = await auth.signInWithPassword({ email: 'b@auth.trez.invalid', password: 'pw' });
  const token = session.data.session.access_token;

  const [body, signature] = token.split('.');
  const forgedBody = Buffer.from(
    JSON.stringify({ type: 'access', sub: 'attacker', exp: 2 ** 40 }),
  ).toString('base64url');

  for (const forged of [`${forgedBody}.${signature}`, `${body}.AAAA`, body, '', 'x.y']) {
    const result = await auth.getUser(forged);
    assert.equal(result.data.user, null, `expected rejection for ${forged.slice(0, 16)}`);
  }
});

test('a token signed with a different secret is rejected', async () => {
  const rows = [];
  const clientA = createFakeClient(rows);
  const authA = createLocalHubAuth({ serviceClient: clientA, secret: SECRET });
  const authB = createLocalHubAuth({
    serviceClient: clientA,
    secret: 'a-different-secret-value-0123456789012',
  });

  await authA.admin.createUser({ email: 'c@auth.trez.invalid', password: 'pw' });
  const session = await authA.signInWithPassword({ email: 'c@auth.trez.invalid', password: 'pw' });

  const result = await authB.getUser(session.data.session.access_token);
  assert.equal(result.data.user, null);
});

test('a refresh token is not accepted as an access token', async () => {
  const { auth } = createAuth();
  await auth.admin.createUser({ email: 'd@auth.trez.invalid', password: 'pw' });
  const session = await auth.signInWithPassword({ email: 'd@auth.trez.invalid', password: 'pw' });

  const result = await auth.getUser(session.data.session.refresh_token);
  assert.equal(result.data.user, null);
});

test('refreshSession issues a new session and rejects an access token', async () => {
  const { auth } = createAuth();
  await auth.admin.createUser({ email: 'e@auth.trez.invalid', password: 'pw' });
  const session = await auth.signInWithPassword({ email: 'e@auth.trez.invalid', password: 'pw' });

  const refreshed = await auth.refreshSession({
    refresh_token: session.data.session.refresh_token,
  });
  assert.equal(refreshed.error, null);
  assert.ok(refreshed.data.session.access_token);

  const wrongType = await auth.refreshSession({
    refresh_token: session.data.session.access_token,
  });
  assert.equal(wrongType.data.session, null);
});

test('updateUserById changes the password so the old one stops working', async () => {
  const { auth } = createAuth();
  const created = await auth.admin.createUser({ email: 'f@auth.trez.invalid', password: 'old-pw' });

  const updated = await auth.admin.updateUserById(created.data.user.id, { password: 'new-pw' });
  assert.equal(updated.error, null);

  const oldPassword = await auth.signInWithPassword({
    email: 'f@auth.trez.invalid',
    password: 'old-pw',
  });
  assert.equal(oldPassword.data.session, null);

  const newPassword = await auth.signInWithPassword({
    email: 'f@auth.trez.invalid',
    password: 'new-pw',
  });
  assert.equal(newPassword.error, null);
});

test('deleteUser removes the account', async () => {
  const { auth } = createAuth();
  const created = await auth.admin.createUser({ email: 'g@auth.trez.invalid', password: 'pw' });

  const deleted = await auth.admin.deleteUser(created.data.user.id);
  assert.equal(deleted.error, null);

  const signIn = await auth.signInWithPassword({ email: 'g@auth.trez.invalid', password: 'pw' });
  assert.equal(signIn.data.session, null);
});

test('withLocalHubAuth swaps auth while leaving data access intact', async () => {
  const { client, auth } = createAuth();
  const wrapped = withLocalHubAuth(client, auth);

  assert.equal(wrapped.auth, auth);
  assert.equal(typeof wrapped.from, 'function');
  assert.equal(typeof wrapped.schema, 'function');
});
