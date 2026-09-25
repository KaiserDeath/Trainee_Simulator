import {
  createHmac,
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// Deliberately matches the subset of the Supabase auth client that
// hubAccountService and supabaseHubIdentityVerifier actually call, so both
// consume this without modification. Backed by the auth.users table that
// setup-local-database.sh creates.
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT_KEY_LENGTH = 64;

function authError(message) {
  return { message };
}

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeSegment(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString());
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  if (expected.length !== SCRYPT_KEY_LENGTH) return false;

  const derived = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

// Sessions are stateless HMAC tokens rather than rows. Signing out therefore
// cannot revoke an already-issued access token before it expires; the TTL above
// bounds that window. This is a local development provider, not a replacement
// for GoTrue in production.
function createTokens(secret) {
  function sign(payload) {
    const body = encodeSegment(payload);
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  function verify(token, expectedType) {
    const raw = String(token || '');
    const separator = raw.lastIndexOf('.');
    if (separator <= 0) return null;

    const body = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expected = createHmac('sha256', secret).update(body).digest('base64url');

    const provided = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length) return null;
    if (!timingSafeEqual(provided, computed)) return null;

    let payload;
    try {
      payload = decodeSegment(body);
    } catch {
      return null;
    }

    if (payload.type !== expectedType) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    return payload;
  }

  function issue(userId) {
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: sign({ type: 'access', sub: userId, exp: now + ACCESS_TOKEN_TTL_SECONDS }),
      refresh_token: sign({ type: 'refresh', sub: userId, exp: now + REFRESH_TOKEN_TTL_SECONDS }),
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  return { issue, verify };
}

/**
 * @param serviceClient a Supabase data client reaching the auth schema
 * @param secret        HMAC secret for session tokens
 */
export function createLocalHubAuth({ serviceClient, secret }) {
  if (!secret || String(secret).length < 32) {
    throw new TypeError('Local Hub auth requires a secret of at least 32 characters.');
  }

  const tokens = createTokens(String(secret));
  const users = () => serviceClient.schema('auth').from('users');

  async function findByEmail(email) {
    const result = await users()
      .select('id, email, encrypted_password')
      .eq('email', String(email || '').toLowerCase())
      .maybeSingle();
    return result.error ? null : result.data;
  }

  const admin = Object.freeze({
    async createUser({ email, password, user_metadata: metadata }) {
      const id = randomUUID();
      const encrypted = await hashPassword(password);
      const result = await users()
        .insert({
          id,
          email: String(email || '').toLowerCase(),
          encrypted_password: encrypted,
          raw_user_meta_data: metadata ? JSON.stringify(metadata) : null,
        })
        .select('id, email')
        .single();

      if (result.error) return { data: { user: null }, error: authError(result.error.message) };
      return { data: { user: { id: result.data.id, email: result.data.email } }, error: null };
    },

    async updateUserById(id, { email, password }) {
      const patch = { updated_at: new Date().toISOString() };
      if (email !== undefined) patch.email = String(email).toLowerCase();
      if (password !== undefined) patch.encrypted_password = await hashPassword(password);

      const result = await users().update(patch).eq('id', id).select('id, email').maybeSingle();
      if (result.error) return { data: { user: null }, error: authError(result.error.message) };
      if (!result.data) return { data: { user: null }, error: authError('User not found.') };
      return { data: { user: result.data }, error: null };
    },

    async deleteUser(id) {
      const result = await users().delete().eq('id', id);
      return { data: null, error: result.error ? authError(result.error.message) : null };
    },

    // Stateless tokens cannot be revoked server-side; the caller clears cookies.
    async signOut() {
      return { data: null, error: null };
    },
  });

  return Object.freeze({
    admin,

    async signInWithPassword({ email, password }) {
      const user = await findByEmail(email);
      if (!user) return { data: { user: null, session: null }, error: authError('Invalid login credentials') };

      const matches = await verifyPassword(password, user.encrypted_password);
      if (!matches) return { data: { user: null, session: null }, error: authError('Invalid login credentials') };

      const session = tokens.issue(user.id);
      return {
        data: { user: { id: user.id, email: user.email }, session },
        error: null,
      };
    },

    async getUser(accessToken) {
      const payload = tokens.verify(accessToken, 'access');
      if (!payload) return { data: { user: null }, error: authError('Invalid token') };

      const result = await users().select('id, email').eq('id', payload.sub).maybeSingle();
      if (result.error || !result.data) return { data: { user: null }, error: authError('User not found') };
      return { data: { user: result.data }, error: null };
    },

    async refreshSession({ refresh_token: refreshToken }) {
      const payload = tokens.verify(refreshToken, 'refresh');
      if (!payload) return { data: { session: null }, error: authError('Invalid refresh token') };

      const result = await users().select('id').eq('id', payload.sub).maybeSingle();
      if (result.error || !result.data) return { data: { session: null }, error: authError('User not found') };
      return { data: { session: tokens.issue(payload.sub) }, error: null };
    },
  });
}

/**
 * Wraps a data client so hubAccountService and the Supabase verifier reach the
 * local auth implementation through the same `.auth` property they already use.
 */
export function withLocalHubAuth(dataClient, localAuth) {
  return new Proxy(dataClient, {
    get(target, property, receiver) {
      if (property === 'auth') return localAuth;
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
