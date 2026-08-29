import { randomBytes, randomUUID } from 'node:crypto';

import { HubError } from '../hub/HubError.js';
import {
  HUB_ACCESS_COOKIE,
  clearHubSessionCookies,
  readHubCookies,
  setHubSessionCookies,
} from './hubCookies.js';

const APPROVED_ROLES = new Set(['postulante', 'trainer', 'admin', 'rrhh']);
const INTERNAL_AUTH_DOMAIN = 'auth.trez.invalid';

function normalizePersonName(value, label) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', `${label} is required and must be at most 120 characters.`);
  }
  return name;
}

function asciiLettersAndNumbers(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '');
}

export function buildHubUsername(firstNameValue, surnameValue, suffix = 1) {
  const firstName = normalizePersonName(firstNameValue, 'First name');
  const surname = normalizePersonName(surnameValue, 'Surname');
  const initial = asciiLettersAndNumbers(firstName).slice(0, 1).toUpperCase();
  const normalizedSurname = asciiLettersAndNumbers(surname).toLowerCase();
  if (!initial || !normalizedSurname) {
    throw new HubError(400, 'HUB_VALIDATION_ERROR', 'First name and surname must contain characters supported by the username format.');
  }
  const numericSuffix = Number(suffix);
  if (!Number.isSafeInteger(numericSuffix) || numericSuffix < 1) throw new TypeError('Username suffix must be a positive integer.');
  const username = `${initial}${normalizedSurname}${numericSuffix === 1 ? '' : numericSuffix}`;
  if (username.length > 64) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'The generated username must be at most 64 characters.');
  return username;
}

function normalizeUsername(value) {
  const raw = String(value || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9]{2,63}$/.test(raw)) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'A valid username is required.');
  return raw.slice(0, 1).toUpperCase() + raw.slice(1).toLowerCase();
}

function internalAuthEmail(username) {
  return `${username.toLowerCase()}@${INTERNAL_AUTH_DOMAIN}`;
}

function normalizeRoles(value) {
  if (!Array.isArray(value) || value.length === 0) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'At least one approved Hub role is required.');
  const roles = [...new Set(value.map((role) => String(role).trim().toLowerCase()))];
  if (roles.some((role) => !APPROVED_ROLES.has(role))) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'One or more Hub roles are invalid.');
  if (roles.includes('rrhh') && roles.length !== 1) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'The RRHH role is read-only and must be assigned exclusively.');
  if (roles.includes('postulante') && roles.length !== 1) throw new HubError(400, 'HUB_VALIDATION_ERROR', 'The POSTULANTE role must be assigned exclusively.');
  return roles;
}

function persistenceError() {
  return new HubError(503, 'HUB_IDENTITY_DIRECTORY_UNAVAILABLE', 'The Hub identity directory is temporarily unavailable.');
}

function authenticationError() {
  return new HubError(401, 'HUB_LOGIN_FAILED', 'The username or password is incorrect.');
}

function passwordPolicyError() {
  return new HubError(400, 'HUB_PASSWORD_REJECTED', 'Supabase rejected the password under its configured password policy.');
}

async function activeIdentityForAuthUser(serviceClient, authUserId) {
  const result = await serviceClient.from('hub_identities').select('id, username, status').eq('auth_user_id', authUserId).maybeSingle();
  if (result.error) throw persistenceError();
  return result.data;
}

export function createHubAccountService({ authClientFactory, serviceClient, authConfig, csrfProtection }) {
  return Object.freeze({
    async login({ username: usernameValue, password: passwordValue, response }) {
      const username = normalizeUsername(usernameValue);
      const password = String(passwordValue || '');
      if (!password) throw authenticationError();
      const signedIn = await authClientFactory().auth.signInWithPassword({ email: internalAuthEmail(username), password });
      if (signedIn.error || !signedIn.data.session || !signedIn.data.user) throw authenticationError();
      const identity = await activeIdentityForAuthUser(serviceClient, signedIn.data.user.id);
      if (!identity || identity.status !== 'active' || identity.username?.toLowerCase() !== username.toLowerCase()) {
        await serviceClient.auth.admin.signOut(signedIn.data.session.access_token, 'local').catch(() => {});
        throw authenticationError();
      }
      setHubSessionCookies(response, authConfig, signedIn.data.session);
      return { csrfToken: csrfProtection.issue(null, response) };
    },

    async logout(request, response) {
      const accessToken = readHubCookies(request)[HUB_ACCESS_COOKIE];
      if (accessToken) await serviceClient.auth.admin.signOut(accessToken, 'local').catch(() => {});
      clearHubSessionCookies(response, authConfig);
    },

    async listAccounts() {
      const result = await serviceClient.from('hub_identities')
        .select('id, username, first_name, surname, display_name, preferred_locale, status, hub_role_assignments(hub_roles(code))')
        .order('username', { ascending: true });
      if (result.error) throw persistenceError();
      return (result.data || []).map((identity) => ({
        id: identity.id,
        username: identity.username,
        firstName: identity.first_name,
        surname: identity.surname,
        displayName: identity.display_name,
        preferredLocale: identity.preferred_locale,
        status: identity.status,
        roles: (identity.hub_role_assignments || [])
          .map((assignment) => assignment.hub_roles?.code?.toUpperCase())
          .filter(Boolean),
      }));
    },

    async createAccount({ firstName: firstNameValue, surname: surnameValue, roles: roleValues, preferredLocale }) {
      const firstName = normalizePersonName(firstNameValue, 'First name');
      const surname = normalizePersonName(surnameValue, 'Surname');
      const roles = normalizeRoles(roleValues);
      const locale = preferredLocale === 'es' ? 'es' : 'en';
      if (roles.includes('postulante') && locale !== 'en') throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Postulante accounts must use English.');

      const temporaryEmail = `provisioning-${randomUUID()}@${INTERNAL_AUTH_DOMAIN}`;
      const created = await serviceClient.auth.admin.createUser({
        email: temporaryEmail,
        password: randomBytes(32).toString('base64url'),
        email_confirm: true,
        user_metadata: { display_name: `${firstName} ${surname}` },
      });
      if (created.error || !created.data.user) throw persistenceError();

      const authUserId = created.data.user.id;
      let identityId = null;
      try {
        const roleResult = await serviceClient.from('hub_roles').select('id, code').in('code', roles);
        if (roleResult.error || roleResult.data.length !== roles.length) throw roleResult.error || new Error('Missing role');
        let identity = null;
        for (let suffix = 1; suffix <= 9999; suffix += 1) {
          const username = buildHubUsername(firstName, surname, suffix);
          const inserted = await serviceClient.from('hub_identities').insert({
            auth_user_id: authUserId,
            external_subject_reference: authUserId,
            email: temporaryEmail,
            first_name: firstName,
            surname,
            username,
            display_name: `${firstName} ${surname}`,
            preferred_locale: locale,
          }).select('id, username, display_name, preferred_locale, status').single();
          if (!inserted.error) {
            identity = inserted.data;
            identityId = identity.id;
            break;
          }
          if (inserted.error.code !== '23505') throw inserted.error;
        }
        if (!identity) throw new HubError(409, 'HUB_USERNAME_EXHAUSTED', 'A unique username could not be allocated.');

        const finalEmail = internalAuthEmail(identity.username);
        const authUpdate = await serviceClient.auth.admin.updateUserById(authUserId, {
          email: finalEmail,
          password: identity.username,
          email_confirm: true,
          user_metadata: { display_name: identity.display_name, username: identity.username },
        });
        if (authUpdate.error) throw passwordPolicyError();
        const emailUpdate = await serviceClient.from('hub_identities').update({ email: finalEmail }).eq('id', identity.id);
        if (emailUpdate.error) throw emailUpdate.error;
        const assignments = await serviceClient.from('hub_role_assignments').insert(roleResult.data.map((role) => ({ identity_id: identity.id, role_id: role.id })));
        if (assignments.error) throw assignments.error;
        return {
          identity: {
            id: identity.id,
            username: identity.username,
            displayName: identity.display_name,
            preferredLocale: identity.preferred_locale,
            status: identity.status,
          },
          roles,
        };
      } catch (error) {
        if (identityId) {
          try {
            await serviceClient.from('hub_role_assignments').delete().eq('identity_id', identityId);
          } catch {}
          try {
            await serviceClient.from('hub_identities').delete().eq('id', identityId);
          } catch {}
        }
        await serviceClient.auth.admin.deleteUser(authUserId).catch(() => {});
        if (error instanceof HubError) throw error;
        throw persistenceError();
      }
    },

    async createPostulante({ firstName, surname }) {
      return this.createAccount({ firstName, surname, roles: ['postulante'], preferredLocale: 'en' });
    },

    async listPostulantes() {
      const accounts = await this.listAccounts();
      return accounts.filter((account) => account.roles.includes('POSTULANTE'));
    },

    async updatePostulante(identityId, { firstName: firstNameValue, surname: surnameValue }) {
      const firstName = normalizePersonName(firstNameValue, 'First name');
      const surname = normalizePersonName(surnameValue, 'Surname');
      const role = await serviceClient.from('hub_role_assignments')
        .select('identity_id, hub_roles!inner(code)')
        .eq('identity_id', identityId)
        .eq('hub_roles.code', 'postulante')
        .maybeSingle();
      if (role.error) throw persistenceError();
      if (!role.data) throw new HubError(404, 'HUB_OBJECT_NOT_FOUND', 'The Postulante was not found.');
      const result = await serviceClient.from('hub_identities').update({
        first_name: firstName,
        surname,
        display_name: `${firstName} ${surname}`,
        updated_at: new Date().toISOString(),
      }).eq('id', identityId).select('id, username, display_name, status').single();
      if (result.error) throw persistenceError();
      return result.data;
    },

    async deactivatePostulante(identityId) {
      const role = await serviceClient.from('hub_role_assignments')
        .select('identity_id, hub_roles!inner(code)')
        .eq('identity_id', identityId)
        .eq('hub_roles.code', 'postulante')
        .maybeSingle();
      if (role.error) throw persistenceError();
      if (!role.data) throw new HubError(404, 'HUB_OBJECT_NOT_FOUND', 'The Postulante was not found.');
      return this.deactivate(identityId);
    },

    async changeOwnPassword(identity, { currentPassword, newPassword }) {
      if (identity.roles.includes('POSTULANTE')) throw new HubError(403, 'HUB_ROLE_FORBIDDEN', 'Postulantes cannot change or reset their password.');
      const username = normalizeUsername(identity.username);
      const verified = await authClientFactory().auth.signInWithPassword({ email: internalAuthEmail(username), password: String(currentPassword || '') });
      if (verified.error || !verified.data.user) throw authenticationError();
      const updated = await serviceClient.auth.admin.updateUserById(verified.data.user.id, { password: String(newPassword || '') });
      if (updated.error) throw passwordPolicyError();
      return { changed: true };
    },

    async resetStaffPassword(actorIdentity, identityId) {
      const result = await serviceClient.from('hub_identities')
        .select('id, auth_user_id, username, status, hub_role_assignments(hub_roles(code))')
        .eq('id', identityId).maybeSingle();
      if (result.error) throw persistenceError();
      const identity = result.data;
      if (!identity || identity.status !== 'active') throw new HubError(404, 'HUB_OBJECT_NOT_FOUND', 'The Hub identity was not found.');
      if (identity.id === actorIdentity.hubIdentityId) {
        throw new HubError(400, 'HUB_VALIDATION_ERROR', 'Use the signed-in password-change form to change your own password.');
      }
      const roles = (identity.hub_role_assignments || []).map((row) => row.hub_roles?.code).filter(Boolean);
      if (roles.includes('postulante') || !roles.some((role) => ['admin', 'trainer', 'rrhh'].includes(role))) {
        throw new HubError(403, 'HUB_ROLE_FORBIDDEN', 'Only staff account passwords can be reset.');
      }
      const updated = await serviceClient.auth.admin.updateUserById(identity.auth_user_id, { password: identity.username });
      if (updated.error) throw passwordPolicyError();
      return { id: identity.id, username: identity.username, reset: true };
    },

    async deactivate(identityId) {
      const result = await serviceClient.from('hub_identities')
        .update({ status: 'deactivated', deactivated_at: new Date().toISOString() })
        .eq('id', identityId).eq('status', 'active').select('id, auth_user_id').maybeSingle();
      if (result.error) throw persistenceError();
      if (!result.data) throw new HubError(404, 'HUB_OBJECT_NOT_FOUND', 'The Hub identity was not found.');
      return { id: result.data.id, status: 'deactivated' };
    },
  });
}
