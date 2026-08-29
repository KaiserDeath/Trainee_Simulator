import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const isLocalE2E =
  process.env.TREZ_LOCAL_E2E === '1';

if (!isLocalE2E) {
  dotenv.config({
    path: fileURLToPath(
      new URL('../../.env.local', import.meta.url)
    ),
    override: true,
    quiet: true
  });
  dotenv.config({ quiet: true });
}

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables.'
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export function createSupabaseAuthClient({ url, anonKey }) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}
