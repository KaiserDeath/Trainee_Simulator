import { buildHubUsername, createHubAccountService } from '../src/auth/hubAccountService.js';
import { supabase } from '../src/config/supabase.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const target = new URL(process.env.SUPABASE_URL);
if (!LOCAL_HOSTS.has(target.hostname)) {
  throw new Error('Refusing to bootstrap an ADMIN outside local Supabase.');
}

const firstName = 'Local';
const surname = 'Admin';
const username = buildHubUsername(firstName, surname);
const internalEmail = `${username.toLowerCase()}@auth.trez.invalid`;
const legacyEmail = 'admin@trez.local';

const service = createHubAccountService({
  authClientFactory() { throw new Error('Authentication is not used during bootstrap.'); },
  serviceClient: supabase,
  authConfig: {},
  csrfProtection: {},
});

let identityResult = await supabase.from('hub_identities')
  .select('id, auth_user_id, username, email')
  .or(`username.ilike.${username},email.eq.${legacyEmail}`)
  .maybeSingle();
if (identityResult.error) throw identityResult.error;

if (identityResult.data) {
  const identity = identityResult.data;
  const authUpdate = await supabase.auth.admin.updateUserById(identity.auth_user_id, {
    email: internalEmail,
    password: username,
    email_confirm: true,
    user_metadata: { display_name: `${firstName} ${surname}`, username },
  });
  if (authUpdate.error) throw authUpdate.error;
  const updated = await supabase.from('hub_identities').update({
    first_name: firstName,
    surname,
    username,
    email: internalEmail,
    display_name: `${firstName} ${surname}`,
    preferred_locale: 'en',
    status: 'active',
    deactivated_at: null,
  }).eq('id', identity.id);
  if (updated.error) throw updated.error;
} else {
  await service.createAccount({
    firstName,
    surname,
    roles: ['admin'],
    preferredLocale: 'en',
  });
}

identityResult = await supabase.from('hub_identities')
  .select('id, username, status, hub_role_assignments!inner(hub_roles!inner(code))')
  .eq('username', username)
  .eq('hub_role_assignments.hub_roles.code', 'admin')
  .single();
if (identityResult.error || identityResult.data.status !== 'active') {
  throw identityResult.error || new Error('Local ADMIN verification failed.');
}

console.log(`Local ADMIN ready. Username: ${username}. Password: ${username}.`);
