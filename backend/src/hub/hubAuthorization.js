import { HubError, isHubError } from './HubError.js';
import {
  normalizeVerifiedIdentity
} from '../identity/hubIdentity.js';

export function sendHubError(res, error) {
  const hubError = isHubError(error)
    ? error
    : new HubError(
        500,
        'HUB_INTERNAL_ERROR',
        'The Hub request could not be completed.'
      );

  const payload = {
    error: {
      code: hubError.code,
      message: hubError.message
    }
  };

  if (hubError.details !== undefined) {
    payload.error.details = hubError.details;
  }

  return res.status(hubError.statusCode).json(payload);
}

export function authenticateHub(identityVerifier) {
  if (!identityVerifier || typeof identityVerifier.verify !== 'function') {
    throw new TypeError(
      'A Hub identity verifier with verify(request) is required.'
    );
  }

  return async function hubAuthentication(req, res, next) {
    try {
      req.hubIdentity = normalizeVerifiedIdentity(
        await identityVerifier.verify(req, res)
      );
      next();
    } catch (error) {
      if (isHubError(error)) {
        return sendHubError(res, error);
      }

      return sendHubError(
        res,
        new HubError(
          503,
          'HUB_IDENTITY_VERIFICATION_FAILED',
          'The configured identity verifier could not validate the request.'
        )
      );
    }
  };
}

export function requireHubRole(...allowedRoles) {
  const normalized = allowedRoles.map((role) =>
    String(role).trim().toUpperCase()
  );

  return function hubRoleAuthorization(req, res, next) {
    const identity = req.hubIdentity;
    if (!identity) {
      return sendHubError(
        res,
        new HubError(
          401,
          'HUB_AUTHENTICATION_REQUIRED',
          'Authentication is required.'
        )
      );
    }

    if (!normalized.some((role) => identity.roles.includes(role))) {
      return sendHubError(
        res,
        new HubError(
          403,
          'HUB_ROLE_FORBIDDEN',
          'The authenticated subject is not authorized for this Hub action.'
        )
      );
    }

    next();
  };
}
