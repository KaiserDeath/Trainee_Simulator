import { randomBytes, timingSafeEqual } from 'node:crypto';

import { HubError } from '../hub/HubError.js';
import {
  HUB_CSRF_COOKIE,
  readHubCookies,
  setHubCsrfCookie,
} from './hubCookies.js';

function equalTokens(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createHubCsrfProtection(config) {
  if (!config?.configured) {
    return Object.freeze({
      issue() {
        throw new HubError(503, 'HUB_IDENTITY_PROVIDER_UNAVAILABLE', 'Trez Training Hub authentication is not configured.');
      },
      middleware(_req, _res, next) { next(); },
    });
  }

  return Object.freeze({
    issue(_request, response) {
      const token = randomBytes(32).toString('base64url');
      setHubCsrfCookie(response, config, token);
      return token;
    },

    middleware(request, _response, next) {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
      const origin = request.get('origin');
      if (origin !== config.clientOrigin) {
        return next(new HubError(403, 'HUB_CSRF_REJECTED', 'The Hub request origin is not allowed.'));
      }
      const cookieToken = readHubCookies(request)[HUB_CSRF_COOKIE];
      const headerToken = request.get('x-trez-csrf');
      if (!equalTokens(cookieToken, headerToken)) {
        return next(new HubError(403, 'HUB_CSRF_REJECTED', 'The Hub CSRF token is missing or invalid.'));
      }
      next();
    },
  });
}
