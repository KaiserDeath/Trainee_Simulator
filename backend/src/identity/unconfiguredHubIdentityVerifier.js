import { HubError } from '../hub/HubError.js';

/**
 * The production application uses this verifier until Trez selects an
 * identity provider and token/session transport. It intentionally does not
 * inspect request headers, cookies, query parameters, or request bodies.
 */
export function createUnconfiguredHubIdentityVerifier() {
  return Object.freeze({
    async verify() {
      throw new HubError(
        503,
        'HUB_IDENTITY_PROVIDER_UNAVAILABLE',
        'Trez Training Hub authentication is not configured.'
      );
    }
  });
}
