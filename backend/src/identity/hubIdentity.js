import { HubError } from '../hub/HubError.js';

export const HUB_ROLES = Object.freeze({
  POSTULANTE: 'POSTULANTE',
  TRAINER: 'TRAINER',
  ADMIN: 'ADMIN',
  RRHH: 'RRHH'
});

function normalizeRole(role) {
  if (typeof role !== 'string' || role.trim() === '') {
    throw new HubError(
      503,
      'HUB_IDENTITY_CONTEXT_INVALID',
      'The configured identity verifier returned an invalid role.'
    );
  }

  return role.trim().toUpperCase();
}

export function normalizeVerifiedIdentity(value) {
  if (!value) {
    throw new HubError(
      401,
      'HUB_AUTHENTICATION_REQUIRED',
      'Authentication is required.'
    );
  }

  const subjectId = value.subjectId;
  if (typeof subjectId !== 'string' || subjectId.trim() === '') {
    throw new HubError(
      503,
      'HUB_IDENTITY_CONTEXT_INVALID',
      'The configured identity verifier returned an invalid subject.'
    );
  }

  if (!Array.isArray(value.roles)) {
    throw new HubError(
      503,
      'HUB_IDENTITY_CONTEXT_INVALID',
      'The configured identity verifier returned invalid roles.'
    );
  }

  const roles = Object.freeze(
    [...new Set(value.roles.map(normalizeRole))]
  );

  return Object.freeze({
    subjectId: subjectId.trim(),
    hubIdentityId:
      typeof value.hubIdentityId === 'string'
        ? value.hubIdentityId
        : null,
    displayName:
      typeof value.displayName === 'string'
        ? value.displayName
        : null,
    username:
      typeof value.username === 'string'
        ? value.username
        : null,
    preferredLocale:
      value.preferredLocale === 'es' ? 'es' : 'en',
    roles,
    visibilityClaims:
      value.visibilityClaims &&
      typeof value.visibilityClaims === 'object'
        ? Object.freeze({ ...value.visibilityClaims })
        : Object.freeze({})
  });
}

export function publicIdentityContext(identity) {
  return {
    subject: {
      id: identity.subjectId,
      displayName: identity.displayName,
      username: identity.username,
      preferredLocale: identity.preferredLocale,
      roles: [...identity.roles]
    }
  };
}
