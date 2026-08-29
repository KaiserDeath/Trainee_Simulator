import { Router } from 'express';
import { HubError } from '../hub/HubError.js';

import {
  HUB_ROLES,
  publicIdentityContext
} from '../identity/hubIdentity.js';
import {
  authenticateHub,
  requireHubRole,
  sendHubError
} from '../hub/hubAuthorization.js';
import { createHubService } from '../hub/hubService.js';
import { createHubFocusedPracticeService } from '../hub/hubFocusedPracticeService.js';

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendHubError(res, error);
    }
  };
}

export function createHubRouter({
  identityVerifier,
  repository,
  csrfProtection,
  accountService,
  administrationService,
  auditorService,
  focusedPracticeRepository,
  assessmentService,
}) {
  const router = Router();
  const service = createHubService(repository);
  const focusedPracticeService = focusedPracticeRepository
    ? createHubFocusedPracticeService({
        practiceRepository: focusedPracticeRepository,
        hubService: service,
      })
    : null;

  router.use(authenticateHub(identityVerifier));
  router.use(csrfProtection.middleware);

  router.get('/context', (req, res) => {
    res.json(publicIdentityContext(req.hubIdentity));
  });

  router.get(
    '/learning-path',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      const learningPath = await service.getLearningPath(req.hubIdentity);
      res.json(learningPath);
    })
  );

  router.post(
    '/activities/:activityId/complete',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      const result = await service.completeActivity(
        req.hubIdentity,
        req.params.activityId,
        req.body
      );
      res.json(result);
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/start',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.status(201).json(await focusedPracticeService.start(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.get(
    '/activities/:activityId/focused-practice',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.read(
        req.hubIdentity,
        req.params.activityId
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/refresh-balance',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.submitRefresh(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/add-credits/start',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.status(201).json(await focusedPracticeService.startAddCredits(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.get(
    '/activities/:activityId/focused-practice/add-credits',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.readAddCredits(
        req.hubIdentity,
        req.params.activityId
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/add-credits/recharge',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.rechargeAddCredits(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/add-credits/approve',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.approveAddCredits(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/add-credits/cancel',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) {
        throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      }
      res.json(await focusedPracticeService.cancelAddCredits(
        req.hubIdentity,
        req.params.activityId,
        req.body || {}
      ));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/withdraw-credits/start',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      const result = await focusedPracticeService.startWithdrawCredits(req.hubIdentity, req.params.activityId, req.body || {});
      res.status(result.created ? 201 : 200).json(result);
    })
  );

  router.get(
    '/activities/:activityId/focused-practice/withdraw-credits',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      res.json(await focusedPracticeService.readWithdrawCredits(req.hubIdentity, req.params.activityId));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/withdraw-credits/redeem',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      res.json(await focusedPracticeService.redeemWithdrawCredits(req.hubIdentity, req.params.activityId, req.body || {}));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/withdraw-credits/approve',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      res.json(await focusedPracticeService.approveWithdrawCredits(req.hubIdentity, req.params.activityId, req.body || {}));
    })
  );

  router.post(
    '/activities/:activityId/focused-practice/withdraw-credits/cancel',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      if (!focusedPracticeService) throw new HubError(503, 'HUB_FOCUSED_PRACTICE_UNAVAILABLE', 'Focused practice is not configured.');
      res.json(await focusedPracticeService.cancelWithdrawCredits(req.hubIdentity, req.params.activityId, req.body || {}));
    })
  );

  router.post(
    '/activities/:activityId/attempts',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      const result = await service.startActivityAttempt(
        req.hubIdentity,
        req.params.activityId,
        req.body
      );
      res.status(result.created ? 201 : 200).json(result);
    })
  );

  router.get(
    '/attempts/:attemptId',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      const attempt = await service.getActivityAttempt(
        req.hubIdentity,
        req.params.attemptId
      );
      res.json({ attempt });
    })
  );

  router.post(
    '/attempts/:attemptId/complete',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => {
      const result = await service.completeActivityAttempt(
        req.hubIdentity,
        req.params.attemptId,
        req.body
      );
      res.json(result);
    })
  );

  router.get(
    '/trainer/postulantes',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      const learners = await service.listTrainerLearners(req.hubIdentity);
      res.json({ postulantes: learners });
    })
  );

  router.get(
    '/trainer/postulantes/:postulanteIdentityId',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      const postulante = await service.getTrainerLearner(
        req.hubIdentity,
        req.params.postulanteIdentityId
      );
      res.json({ postulante });
    })
  );

  router.get(
    '/trainer/attempts/:attemptId',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      const attempt = await service.getTrainerAttempt(
        req.hubIdentity,
        req.params.attemptId
      );
      res.json({ attempt });
    })
  );

  router.get(
    '/rrhh/overview',
    requireHubRole(HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      res.json(await auditorService.getOverview(req.query));
    })
  );

  router.get(
    '/rrhh/hub-attempts/:attemptId',
    requireHubRole(HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      res.json(await auditorService.getHubAttempt(
        req.params.attemptId,
        req.query
      ));
    })
  );

  router.get(
    '/rrhh/postulantes/:identityId/learning-records',
    requireHubRole(HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      res.json(await auditorService.getTraineeLearningRecords(
        req.params.identityId,
        req.query
      ));
    })
  );

  router.get(
    '/rrhh/simulator-sessions/:sessionId',
    requireHubRole(HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      res.json(await auditorService.getSimulatorSession(
        req.params.sessionId,
        req.query
      ));
    })
  );

  router.post('/auth/logout', asyncRoute(async (req, res) => {
    await accountService.logout(req, res);
    res.status(204).end();
  }));

  router.post(
    '/auth/password',
    requireHubRole(HUB_ROLES.ADMIN, HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      res.json(await accountService.changeOwnPassword(req.hubIdentity, req.body || {}));
    })
  );

  router.post(
    '/admin/accounts',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      const roles = (req.body?.roles || []).map((role) => String(role).toLowerCase());
      if (roles.length !== 1 || roles[0] !== 'trainer') {
        throw new HubError(403, 'HUB_ROLE_FORBIDDEN', 'ADMIN may create TRAINER accounts only.');
      }
      const result = await accountService.createAccount(req.body || {});
      res.status(201).json(result);
    })
  );

  router.get(
    '/staff/postulantes',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (_req, res) => res.json({ postulantes: await accountService.listPostulantes() }))
  );

  router.post(
    '/staff/postulantes',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => res.status(201).json(await accountService.createPostulante(req.body || {})))
  );

  router.patch(
    '/staff/postulantes/:identityId',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => res.json(await accountService.updatePostulante(req.params.identityId, req.body || {})))
  );

  router.post(
    '/staff/postulantes/:identityId/deactivate',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => res.json(await accountService.deactivatePostulante(req.params.identityId)))
  );

  router.get(
    '/staff/courses',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (_req, res) => res.json({ courses: await administrationService.listCourses() }))
  );

  router.get(
    '/admin/accounts',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (_req, res) => {
      res.json({ accounts: await accountService.listAccounts() });
    })
  );

  router.post(
    '/admin/identities/:identityId/deactivate',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.json(await accountService.deactivate(req.params.identityId));
    })
  );

  router.post(
    '/admin/identities/:identityId/password-reset',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.json(await accountService.resetStaffPassword(req.hubIdentity, req.params.identityId));
    })
  );

  router.put(
    '/admin/trainers/:trainerIdentityId/postulantes/:postulanteIdentityId',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.json(await administrationService.assignTrainerLearner(
        req.hubIdentity,
        req.params.trainerIdentityId,
        req.params.postulanteIdentityId
      ));
    })
  );

  router.post(
    '/trainer/postulantes/:postulanteIdentityId/enrolments',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => {
      const enrolment = await administrationService.assignCourse(
        req.hubIdentity,
        req.params.postulanteIdentityId,
        req.body?.courseId
      );
      res.status(201).json({ enrolment });
    })
  );

  router.get(
    '/assessment/settings',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (_req, res) => res.json({ settings: await assessmentService.getSettings() }))
  );

  router.put(
    '/assessment/settings',
    requireHubRole(HUB_ROLES.TRAINER),
    asyncRoute(async (req, res) => res.json({ settings: await assessmentService.updateSettings(req.hubIdentity, req.body || {}) }))
  );

  router.get(
    '/assessment/evaluations',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => res.json(await assessmentService.listEvaluationPolicies(
      req.hubIdentity,
      { includeAudit: true }
    )))
  );

  router.put(
    '/assessment/evaluations/:evaluationId',
    requireHubRole(HUB_ROLES.TRAINER),
    asyncRoute(async (req, res) => res.json({ evaluation: await assessmentService.updateEvaluationPolicy(
      req.hubIdentity,
      req.params.evaluationId,
      req.body || {}
    ) }))
  );

  router.post(
    '/assessment/evaluations/:evaluationId/postulantes/:postulanteIdentityId/reopen',
    requireHubRole(HUB_ROLES.TRAINER),
    asyncRoute(async (req, res) => res.status(201).json({ reopening: await assessmentService.reopenEvaluation(
      req.hubIdentity,
      req.params.evaluationId,
      req.params.postulanteIdentityId,
      req.body || {}
    ) }))
  );

  router.get(
    '/assessment/report',
    requireHubRole(HUB_ROLES.TRAINER, HUB_ROLES.RRHH),
    asyncRoute(async (req, res) => res.json(await assessmentService.report(req.query)))
  );

  router.get(
    '/scored-evaluations',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => res.json(await assessmentService.getMyEvaluations(req.hubIdentity)))
  );

  router.post(
    '/scored-evaluations/:evaluationId/attempts',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => res.status(201).json({ attempt: await assessmentService.startEvaluationAttempt(
      req.hubIdentity,
      req.params.evaluationId,
      req.body || {}
    ) }))
  );

  router.post(
    '/scored-evaluations/attempts/:attemptId/submit',
    requireHubRole(HUB_ROLES.POSTULANTE),
    asyncRoute(async (req, res) => res.json({ result: await assessmentService.submitEvaluationAttempt(
      req.hubIdentity,
      req.params.attemptId
    ) }))
  );

  router.post(
    '/admin/content-versions',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.status(201).json({
        contentVersion: await administrationService.createContentVersion(req.hubIdentity, req.body || {})
      });
    })
  );

  router.post(
    '/admin/content-versions/:contentVersionId/submit',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.json({
        contentVersion: await administrationService.submitContentVersion(
          req.hubIdentity,
          req.params.contentVersionId
        )
      });
    })
  );

  router.post(
    '/admin/content-versions/:contentVersionId/review',
    requireHubRole(HUB_ROLES.ADMIN),
    asyncRoute(async (req, res) => {
      res.json({
        contentVersion: await administrationService.reviewContentVersion(
          req.hubIdentity,
          req.params.contentVersionId,
          req.body || {}
        )
      });
    })
  );

  router.use((error, _req, res, _next) => sendHubError(res, error));

  return router;
}
