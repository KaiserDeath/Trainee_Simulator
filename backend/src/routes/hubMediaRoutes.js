import {Router} from 'express';
import {requireHubRole,sendHubError} from '../hub/hubAuthorization.js';

export function createHubMediaRouter({service}){
  const router=Router();const run=handler=>async(req,res)=>{try{res.set('Cache-Control','no-store');res.json(await handler(req));}catch(error){sendHubError(res,error);}};
  router.get('/',requireHubRole('ADMIN','TRAINER'),run(req=>service.list(req.hubIdentity)));
  router.post('/uploads',requireHubRole('ADMIN'),run(req=>service.beginUpload(req.hubIdentity,req.body||{})));
  router.get('/:id/access',requireHubRole('ADMIN','TRAINER','RRHH','POSTULANTE'),run(req=>service.access(req.hubIdentity,req.params.id)));
  router.post('/:id/:command',requireHubRole('ADMIN'),run(req=>service.transition(req.hubIdentity,req.params.id,req.params.command,req.body||{})));
  return router;
}
