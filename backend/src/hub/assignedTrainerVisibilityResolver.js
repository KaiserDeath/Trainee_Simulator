import { HubError } from './HubError.js';

function databaseError() {
  return new HubError(503, 'HUB_PERSISTENCE_ERROR', 'Hub learner visibility is temporarily unavailable.');
}

export function createAssignedTrainerVisibilityResolver() {
  return Object.freeze({
    async listVisibleLearnerIdentityIds({ actor, identity, client }) {
      if (identity.roles.includes('TRAINER') || identity.roles.includes('RRHH')) {
        const trainees = await client
          .from('hub_role_assignments')
          .select('identity_id, hub_roles!inner(code), hub_identities!inner(status)')
          .eq('hub_roles.code', 'postulante')
          .eq('hub_identities.status', 'active');
        if (trainees.error) throw databaseError();
        return [...new Set((trainees.data || []).map((row) => row.identity_id))];
      }

      return [];
    },

    async canViewLearner({ actor, identity, learnerIdentityId, client }) {
      if (!identity.roles.includes('TRAINER') && !identity.roles.includes('RRHH')) return false;
      const learner = await client
        .from('hub_role_assignments')
        .select('identity_id, hub_roles!inner(code), hub_identities!inner(status)')
        .eq('identity_id', learnerIdentityId)
        .eq('hub_roles.code', 'postulante')
        .eq('hub_identities.status', 'active')
        .maybeSingle();
      if (learner.error) throw databaseError();
      return Boolean(learner.data);
    },
  });
}
