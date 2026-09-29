import express from 'express';
import cors from 'cors';

import './config/loadEnv.js';

import sessionRoutes from './routes/sessionRoutes.js';
import operationRoutes from './routes/operationRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import trainerRoutes from './routes/trainerRoutes.js';
import { createHubRouter } from './routes/hubRoutes.js';
import { createHubAuthRouter } from './routes/hubAuthRoutes.js';
import {
  createUnconfiguredHubIdentityVerifier
} from './identity/unconfiguredHubIdentityVerifier.js';
import { createSupabaseHubIdentityVerifier } from './identity/supabaseHubIdentityVerifier.js';
import { createLocalHubAuth, withLocalHubAuth } from './auth/localHubAuth.js';
import {
  createSupabaseHubRepository
} from './hub/supabaseHubRepository.js';
import { createAssignedTrainerVisibilityResolver } from './hub/assignedTrainerVisibilityResolver.js';
import { createHubAdministrationService } from './hub/hubAdministrationService.js';
import { createSupabaseHubAuditorRepository } from './hub/supabaseHubAuditorRepository.js';
import { createHubAuditorService } from './hub/hubAuditorService.js';
import { createHubAssessmentService } from './hub/hubAssessmentService.js';
import { createSupabaseHubFocusedPracticeRepository } from './hub/supabaseHubFocusedPracticeRepository.js';
import { createHubCsrfProtection } from './auth/hubCsrf.js';
import { createHubAccountService } from './auth/hubAccountService.js';
import { getHubAuthConfig } from './config/hubAuthConfig.js';
import { createSupabaseAuthClient, supabase } from './config/supabase.js';
import { HubError } from './hub/HubError.js';
import { buildSessionReport } from './engine/SessionEngine.js';
import { getSessionActionLog } from './engine/AuditLogger.js';
import {
  createCorsOptions,
  sendApiError,
  setApiSecurityHeaders,
} from './security/httpSecurity.js';

function unavailableAccountService() {
  const unavailable = async () => {
    throw new HubError(503, 'HUB_IDENTITY_PROVIDER_UNAVAILABLE', 'Trez Training Hub authentication is not configured.');
  };
  return Object.freeze({
    login: unavailable,
    logout: unavailable,
    listAccounts: unavailable,
    createAccount: unavailable,
    createPostulante: unavailable,
    listPostulantes: unavailable,
    updatePostulante: unavailable,
    deactivatePostulante: unavailable,
    changeOwnPassword: unavailable,
    resetStaffPassword: unavailable,
    deactivate: unavailable,
  });
}

function createDefaultHubDependencies() {
  const authConfig = getHubAuthConfig();
  const csrfProtection = createHubCsrfProtection(authConfig);
  const visibilityResolver = createAssignedTrainerVisibilityResolver();
  const repository = createSupabaseHubRepository({
    client: supabase,
    trainerVisibilityResolver: visibilityResolver,
  });
  const administrationService = createHubAdministrationService({
    client: supabase,
    trainerVisibilityResolver: visibilityResolver,
  });
  const auditorService = createHubAuditorService({
    repository: createSupabaseHubAuditorRepository({
      client: supabase,
    }),
    sessionReportReader: buildSessionReport,
    actionLogReader: getSessionActionLog,
  });
  const focusedPracticeRepository = createSupabaseHubFocusedPracticeRepository({
    client: supabase,
  });
  const assessmentService = createHubAssessmentService({ client: supabase });

  if (!authConfig.configured) {
    return {
      authConfig,
      csrfProtection,
      identityVerifier: createUnconfiguredHubIdentityVerifier(),
      accountService: unavailableAccountService(),
      repository,
      administrationService,
      auditorService,
      focusedPracticeRepository,
      assessmentService,
    };
  }

  // A machine without the Supabase Auth service can sign sessions locally.
  // The provider is stateless, so it cannot revoke an issued token: it is a
  // development facility and is refused in production.
  const localAuthMode =
    String(process.env.HUB_AUTH_MODE || '').trim().toLowerCase() === 'local';

  if (localAuthMode && process.env.NODE_ENV === 'production') {
    throw new Error('HUB_AUTH_MODE=local must never be used in production.');
  }

  let authClientFactory;
  let hubServiceClient = supabase;

  if (localAuthMode) {
    const localAuth = createLocalHubAuth({
      serviceClient: supabase,
      secret: process.env.HUB_LOCAL_AUTH_SECRET,
    });
    hubServiceClient = withLocalHubAuth(supabase, localAuth);
    authClientFactory = () => ({ auth: localAuth });
  } else {
    authClientFactory = () => createSupabaseAuthClient({
      url: authConfig.supabaseUrl,
      anonKey: authConfig.anonKey,
    });
  }

  return {
    authConfig,
    csrfProtection,
    identityVerifier: createSupabaseHubIdentityVerifier({
      authClientFactory,
      serviceClient: hubServiceClient,
      config: authConfig,
    }),
    accountService: createHubAccountService({
      authClientFactory,
      serviceClient: hubServiceClient,
      authConfig,
      csrfProtection,
    }),
    repository,
    administrationService,
    auditorService,
    focusedPracticeRepository,
    assessmentService,
  };
}

export function createApp(options = {}) {
  const defaults = createDefaultHubDependencies();
  const hubIdentityVerifier = options.hubIdentityVerifier || defaults.identityVerifier;
  const hubRepository = options.hubRepository || defaults.repository;
  const hubCsrfProtection = options.hubCsrfProtection || defaults.csrfProtection;
  const hubAccountService = options.hubAccountService || defaults.accountService;
  const hubAdministrationService = options.hubAdministrationService || defaults.administrationService;
  const hubAuditorService = options.hubAuditorService || defaults.auditorService;
  const focusedPracticeRepository = options.focusedPracticeRepository || defaults.focusedPracticeRepository;
  const hubAssessmentService = options.hubAssessmentService || defaults.assessmentService;
  const app = express();

  app.use(cors(createCorsOptions(process.env)));
  app.use(setApiSecurityHeaders);
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Simulador-dos backend running'
    });
  });

  app.use('/api/sessions', sessionRoutes);
  app.use('/api/operations', operationRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/trainer', trainerRoutes);
  if (defaults.authConfig.configured) {
    app.use('/api/hub/auth', createHubAuthRouter({
      accountService: hubAccountService,
      csrfProtection: hubCsrfProtection,
    }));
  } else {
    app.use('/api/hub/auth', (_req, res) => {
      res.status(503).json({
        error: {
          code: 'HUB_IDENTITY_PROVIDER_UNAVAILABLE',
          message: 'Trez Training Hub authentication is not configured.',
        },
      });
    });
  }
  app.use(
    '/api/hub',
    createHubRouter({
      identityVerifier: hubIdentityVerifier,
      repository: hubRepository,
      csrfProtection: hubCsrfProtection,
      accountService: hubAccountService,
      administrationService: hubAdministrationService,
      auditorService: hubAuditorService,
      focusedPracticeRepository,
      assessmentService: hubAssessmentService,
    })
  );

  app.use(sendApiError);

  return app;
}

const app = createApp();

export default app;
