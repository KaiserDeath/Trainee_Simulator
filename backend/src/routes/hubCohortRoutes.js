import {Router} from 'express';
import {requireHubRole,sendHubError} from '../hub/hubAuthorization.js';

export function createHubCohortRouter({service}) {
  const router=Router();
  const run=handler=>async(req,res)=>{try{res.set('Cache-Control','no-store');res.json(await handler(req));}catch(error){sendHubError(res,error);}};
  router.get('/',requireHubRole('TRAINER','RRHH','POSTULANTE'),run(req=>service.list(req.hubIdentity,req.query.cursor)));
  router.post('/',requireHubRole('TRAINER','RRHH'),run(req=>service.save(req.hubIdentity,null,req.body||{})));
  router.post('/:id',requireHubRole('TRAINER','RRHH'),run(req=>service.save(req.hubIdentity,req.params.id,req.body||{})));
  return router;
}
