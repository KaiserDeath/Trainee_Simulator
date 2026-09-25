import { createClient } from '@supabase/supabase-js';
import './loadEnv.js';

import { createPgClient } from '../db/pgClient.js';

// Eleven modules import `supabase` at load time, so this is the seam where the
// data layer is chosen. With DATABASE_URL set, queries run directly against
// PostgreSQL through the pg driver and neither PostgREST nor Supabase is
// involved. Without it, the Supabase HTTP client is used exactly as before.
const databaseUrl = process.env.DATABASE_URL;
const directMode = Boolean(databaseUrl);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!directMode && (!supabaseUrl || !supabaseKey)) {
  throw new Error(
    'Set DATABASE_URL to query PostgreSQL directly, or SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY to use Supabase.',
  );
}

export const usingDirectPostgres = directMode;

export const supabase = directMode
  ? createPgClient({ connectionString: databaseUrl })
  : createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

export function createSupabaseAuthClient({ url, anonKey }) {
  // Direct mode has no GoTrue to talk to; HUB_AUTH_MODE=local supplies the
  // identity provider instead, and app.js wires that in place of this client.
  if (directMode) {
    throw new Error(
      'Supabase Auth is unavailable when querying PostgreSQL directly. ' +
        'Set HUB_AUTH_MODE=local.',
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}
