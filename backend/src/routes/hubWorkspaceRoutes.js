import { Router } from 'express';
import { requireHubRole,sendHubError } from '../hub/hubAuthorization.js';

export function createHubWorkspaceRouter({ service }) {
  const router = Router();
  const run = fn => async (req,res) => { try { res.json(await fn(req)); } catch(error) { sendHubError(res,error); } };
  router.get('/account-policies',requireHubRole('ADMIN'),run(req=>service.policies(req.hubIdentity)));
  router.post('/account-policies/proposals',requireHubRole('ADMIN'),run(req=>service.proposePolicy(req.hubIdentity,req.body||{})));
  router.post('/account-policies/proposals/:id/review',requireHubRole('ADMIN'),run(req=>service.reviewPolicy(req.hubIdentity,req.params.id,req.body||{})));
  router.get('/catalog',requireHubRole('ADMIN','TRAINER'),run(req=>service.catalog(req.hubIdentity)));
  router.get('/activities/:id/versions',requireHubRole('ADMIN'),run(req=>service.versions(req.hubIdentity,req.params.id)));
  router.post('/activities/:id/versions',requireHubRole('ADMIN'),run(req=>service.createInstruction(req.hubIdentity,req.params.id,req.body || {})));
  router.get('/postulantes/:id/evidence',requireHubRole('TRAINER','RRHH'),run(req=>service.evidence(req.hubIdentity,req.params.id)));
  router.get('/postulantes/:id/notes',requireHubRole('TRAINER','RRHH'),run(req=>service.notes(req.hubIdentity,req.params.id,req.query.cursor)));
  router.post('/postulantes/:id/notes',requireHubRole('TRAINER'),run(req=>service.saveNote(req.hubIdentity,req.params.id,req.body || {})));
  return router;
}
