import {Router} from 'express';
import {requireHubRole,sendHubError} from '../hub/hubAuthorization.js';

export function createHubTrainingAssignmentRouter({service}) {
  const router=Router();
  const run=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store');res.json(await fn(req));}catch(error){sendHubError(res,error);}};
  router.get('/',requireHubRole('TRAINER','RRHH','POSTULANTE'),run(req=>service.list(req.hubIdentity,req.query.learnerId,req.query.cursor)));
  router.post('/',requireHubRole('TRAINER'),run(req=>service.command(req.hubIdentity,'assign',null,req.body||{})));
  router.post('/:id/acknowledge',requireHubRole('POSTULANTE'),run(req=>service.command(req.hubIdentity,'acknowledge',req.params.id,req.body||{})));
  for(const command of ['verify','cancel'])router.post(`/:id/${command}`,requireHubRole('TRAINER'),run(req=>service.command(req.hubIdentity,command,req.params.id,req.body||{})));
  return router;
}
