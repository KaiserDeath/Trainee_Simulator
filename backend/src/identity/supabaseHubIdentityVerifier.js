import { HubError } from '../hub/HubError.js';
import {
  HUB_ACCESS_COOKIE,
  HUB_REFRESH_COOKIE,
  readHubCookies,
  setHubSessionCookies,
} from '../auth/hubCookies.js';

function databaseFailure() {
  return new HubError(503, 'HUB_IDENTITY_DIRECTORY_UNAVAILABLE', 'The Hub identity directory is temporarily unavailable.');
}

export function createSupabaseHubIdentityVerifier({
  authClientFactory,
  serviceClient,
  config,
}) {
  if (!config?.configured) throw new TypeError('Configured Hub auth is required.');

  return Object.freeze({
    async verify(request, response) {
      const cookies = readHubCookies(request);
      let accessToken = cookies[HUB_ACCESS_COOKIE];
      const refreshToken = cookies[HUB_REFRESH_COOKIE];
      if (!accessToken && !refreshToken) {
        throw new HubError(401, 'HUB_AUTHENTICATION_REQUIRED', 'Authentication is required.');
      }

      const authClient = authClientFactory();
      let userResult = accessToken
        ? await authClient.auth.getUser(accessToken)
        : { data: { user: null }, error: new Error('Missing access token') };

      if ((userResult.error || !userResult.data.user) && refreshToken) {
        const refreshed = await authClient.auth.refreshSession({ refresh_token: refreshToken });
        if (!refreshed.error && refreshed.data.session) {
          setHubSessionCookies(response, config, refreshed.data.session);
          accessToken = refreshed.data.session.access_token;
          userResult = await authClient.auth.getUser(accessToken);
        }
      }

      if (userResult.error || !userResult.data.user) {
        throw new HubError(401, 'HUB_SESSION_INVALID', 'The Hub session is invalid or expired.');
      }

      const authUser = userResult.data.user;
      const identityResult = await serviceClient
        .from('hub_identities')
        .select('id, external_subject_reference, username, display_name, preferred_locale, status')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (identityResult.error) throw databaseFailure();
      const identity = identityResult.data;
      if (!identity || identity.status !== 'active') {
        throw new HubError(403, 'HUB_IDENTITY_NOT_PROVISIONED', 'The authenticated account is not active in Trez Training Hub.');
      }

      const assignmentResult = await serviceClient
        .from('hub_role_assignments')
        .select('hub_roles(code)')
        .eq('identity_id', identity.id);
      if (assignmentResult.error) throw databaseFailure();
      const roles = (assignmentResult.data || [])
        .map((row) => row.hub_roles?.code)
        .filter(Boolean)
        .map((role) => role.toUpperCase());
      if (roles.length === 0) {
        throw new HubError(403, 'HUB_ROLE_FORBIDDEN', 'The authenticated account has no active Hub role.');
      }

      return {
        subjectId: authUser.id,
        hubIdentityId: identity.id,
        username: identity.username,
        displayName: identity.display_name,
        preferredLocale: identity.preferred_locale,
        roles,
      };
    },
  });
}
