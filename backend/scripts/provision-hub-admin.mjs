// Provisions (or repairs) a Hub ADMIN account against ANY Supabase project,
// including hosted ones. Unlike bootstrap-local-hub-admin.mjs this is not
// restricted to localhost, so it requires explicit confirmation and an
// operator-supplied password.
//
// Usage (PowerShell):
//   $env:HUB_ADMIN_PROVISION_CONFIRM="1"
//   $env:HUB_ADMIN_PASSWORD="<a strong password>"
//   $env:HUB_ADMIN_FIRST_NAME="Trez"      # optional, default "Hub"
//   $env:HUB_ADMIN_SURNAME="Admin"        # optional, default "Admin"
//   node backend/scripts/provision-hub-admin.mjs
import { buildHubUsername, createHubAccountService } from '../src/auth/hubAccountService.js';
import { supabase } from '../src/config/supabase.js';

if (process.env.HUB_ADMIN_PROVISION_CONFIRM !== '1') {
  throw new Error(
    'Refusing to provision an ADMIN. Set HUB_ADMIN_PROVISION_CONFIRM=1 to confirm you '
    + `intend to write to ${process.env.SUPABASE_URL}.`
  );
}

const password = String(process.env.HUB_ADMIN_PASSWORD || '');
if (password.length < 8) {
  throw new Error('Set HUB_ADMIN_PASSWORD to a password of at least 8 characters.');
}

const firstName = process.env.HUB_ADMIN_FIRST_NAME || 'Hub';
const surname = process.env.HUB_ADMIN_SURNAME || 'Admin';
const username = buildHubUsername(firstName, surname);
const internalEmail = `${username.toLowerCase()}@auth.trez.invalid`;

const service = createHubAccountService({
  authClientFactory() { throw new Error('Authentication is not used during provisioning.'); },
  serviceClient: supabase,
  authConfig: {},
  csrfProtection: {},
});

const existing = await supabase.from('hub_identities')
  .select('id, auth_user_id, username')
  .eq('username', username)
  .maybeSingle();
if (existing.error) throw existing.error;

if (!existing.data) {
  await service.createAccount({ firstName, surname, roles: ['admin'], preferredLocale: 'en' });
}

const identityResult = await supabase.from('hub_identities')
  .select('id, auth_user_id, username, status, hub_role_assignments!inner(hub_roles!inner(code))')
  .eq('username', username)
  .eq('hub_role_assignments.hub_roles.code', 'admin')
  .single();
if (identityResult.error) throw identityResult.error;

// createAccount seeds the password as the username; replace it with the
// operator-supplied one and make sure the account is active.
const authUpdate = await supabase.auth.admin.updateUserById(identityResult.data.auth_user_id, {
  email: internalEmail,
  password,
  email_confirm: true,
  user_metadata: { display_name: `${firstName} ${surname}`, username },
});
if (authUpdate.error) throw authUpdate.error;

const reactivated = await supabase.from('hub_identities')
  .update({ email: internalEmail, status: 'active', deactivated_at: null })
  .eq('id', identityResult.data.id);
if (reactivated.error) throw reactivated.error;

console.log(`ADMIN ready on ${process.env.SUPABASE_URL}. Username: ${username}. Password: the one you supplied.`);
