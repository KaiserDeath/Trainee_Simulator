import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeHubActivity,
  approveHubAddCreditsPractice,
  cancelHubAddCreditsPractice,
  approveHubWithdrawCreditsPractice,
  cancelHubWithdrawCreditsPractice,
  getHubAuditorAttempt,
  getHubAuditorOverview,
  getHubAuditorSimulatorSession,
  getHubAuditorTraineeLearningRecords,
  getHubContext,
  getHubLearningPath,
  getHubTrainerLearners,
  loginHub,
  logoutHub,
  submitHubRefreshBalance,
} from '../api/client';
import HubAdminAccounts from '../components/hub/HubAdminAccounts';
import HubAssessmentManagement from '../components/hub/HubAssessmentManagement';
import HubAuditorOverview from '../components/hub/HubAuditorOverview';
import HubLearningPath, { ProgressBar } from '../components/hub/HubLearningPath';
import HubPasswordPanel from '../components/hub/HubPasswordPanel';
import HubScoredEvaluationOverview from '../components/hub/HubScoredEvaluationOverview';
import HubTrainerOverview from '../components/hub/HubTrainerOverview';
import '../styles/hub.css';

const TRAINER_ROLE = 'TRAINER';
const POSTULANTE_ROLE = 'POSTULANTE';
const ADMIN_ROLE = 'ADMIN';
const RRHH_ROLE = 'RRHH';

const STAFF_VIEW_COPY = {
  en: {
    brandSubtitle: 'Foundation preview',
    currentIdentity: 'Current server identity',
    serverIdentity: 'Server identity',
    signOut: 'Sign out',
    administratorView: 'ADMIN view',
    trainerView: 'Trainer view',
    progressTitle: 'All Postulante progress',
    visibilityUnavailable: 'Postulante progress could not be loaded.',
    languageLabel: 'Language / Idioma',
    footerStatus: 'Working product name — subject to Trez validation',
    simulatorLink: 'Open Operator Simulator',
    auditorView: 'RRHH view',
  },
  es: {
    brandSubtitle: 'Vista preliminar de la base',
    currentIdentity: 'Identidad actual del servidor',
    serverIdentity: 'Identidad del servidor',
    signOut: 'Cerrar sesión',
    administratorView: 'Vista ADMIN',
    trainerView: 'Vista de formador',
    progressTitle: 'Progreso de todos los Postulantes',
    visibilityUnavailable: 'No se pudo cargar el progreso de Postulantes.',
    languageLabel: 'Idioma / Language',
    footerStatus: 'Nombre provisional del producto — sujeto a validación de Trez',
    simulatorLink: 'Abrir Simulador de Operadores',
    auditorView: 'Vista RRHH',
  },
};

const unavailableCopy = (error) => {
  const status = error?.response?.status;
  const serverMessage = error?.response?.data?.error?.message || error?.response?.data?.message;

  if (status === 401) {
    return {
      title: 'Server identity required',
      message: serverMessage || 'The Hub could not establish an authenticated server session. Use the identity access process selected by Trez when it becomes available.',
      canSignIn: true,
    };
  }

  if (status === 403) {
    return {
      title: 'Hub access unavailable',
      message: serverMessage || 'Your server identity does not have an assigned Hub role or learning path.',
    };
  }

  return {
    title: 'Training Hub is not configured',
    message: serverMessage || 'Authentication and identity provisioning must be configured by Trez before this Hub can load assigned training.',
  };
};

const normaliseContext = (data) => ({
  available: data?.available ?? data?.configured ?? true,
  identity: data?.identity || data?.user || (data?.subject ? {
    id: data.subject.id,
    displayName: data.subject.displayName,
    username: data.subject.username,
    preferredLocale: data.subject.preferredLocale,
    roles: data.subject.roles || [],
  } : null),
  message: data?.message,
});

const completeStatus = (status) => status === 'completed';

const normalisePath = (data) => {
  const directPath = data?.learningPath || data?.path;
  if (directPath) return directPath;
  if (data?.course || data?.modules) return data;

  const enrolment = data?.enrolments?.find((item) => item.status !== 'withdrawn') || data?.enrolments?.[0];
  if (!enrolment) return { course: null, modules: [], progress: {} };
  const rawModules = enrolment.modules || [];
  const moduleById = new Map(rawModules.map((module) => [module.id, module]));
  const modules = rawModules.map((module) => {
    const activities = (module.activities || []).map((activity) => ({
      ...activity,
      completed: completeStatus(activity.status),
    }));
    const completedActivities = activities.filter((activity) => activity.completed).length;
    return {
      ...module,
      order: module.order ?? module.position,
      locked: module.locked ?? module.available === false,
      completed: completeStatus(module.status),
      prerequisites: (module.prerequisiteModuleIds || []).map((id) => {
        const prerequisite = moduleById.get(id);
        return {
          id,
          title: prerequisite?.title || 'Assigned prerequisite',
          completed: completeStatus(prerequisite?.status),
        };
      }),
      progress: {
        completedActivities,
        totalActivities: activities.length,
        percentage: activities.length ? Math.round((completedActivities / activities.length) * 100) : 0,
      },
      activities,
    };
  });
  const allActivities = modules.flatMap((module) => module.activities);
  const completedActivities = allActivities.filter((activity) => activity.completed).length;

  return {
    enrolment,
    course: enrolment.course,
    modules,
    progress: {
      completedActivities,
      totalActivities: allActivities.length,
      percentage: allActivities.length ? Math.round((completedActivities / allActivities.length) * 100) : 0,
    },
  };
};

const identityRoles = (identity) => {
  const roles = identity?.roles || (identity?.role ? [identity.role] : []);
  return roles.map((role) => String(role).toUpperCase());
};

export default function HubPage() {
  const [context, setContext] = useState(null);
  const [path, setPath] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [busyActivityId, setBusyActivityId] = useState(null);
  const [trainerLearners, setTrainerLearners] = useState(null);
  const [trainerUnavailable, setTrainerUnavailable] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [staffLanguagePreference, setStaffLanguagePreference] = useState('en');
  const [auditorOverview, setAuditorOverview] = useState(null);
  const [auditorOverviewCursors, setAuditorOverviewCursors] = useState({
    postulanteCursor: null,
    sessionCursor: null,
  });
  const [auditorOverviewHistory, setAuditorOverviewHistory] = useState({
    postulanteCursor: [],
    sessionCursor: [],
  });
  const [auditorReport, setAuditorReport] = useState(null);
  const [auditorReportSessionId, setAuditorReportSessionId] = useState(null);
  const [auditorReportCursors, setAuditorReportCursors] = useState({
    operationCursor: null,
    actionCursor: null,
  });
  const [auditorReportHistory, setAuditorReportHistory] = useState({
    operationCursor: [],
    actionCursor: [],
  });
  const [auditorLearningRecord, setAuditorLearningRecord] = useState(null);
  const [auditorLearningIdentityId, setAuditorLearningIdentityId] = useState(null);
  const [auditorLearningCursors, setAuditorLearningCursors] = useState({
    moduleCursor: null,
    attemptCursor: null,
  });
  const [auditorLearningHistory, setAuditorLearningHistory] = useState({
    moduleCursor: [],
    attemptCursor: [],
  });
  const [auditorAttempt, setAuditorAttempt] = useState(null);
  const [auditorAttemptId, setAuditorAttemptId] = useState(null);
  const [auditorAttemptCursors, setAuditorAttemptCursors] = useState({
    activityCursor: null,
    evidenceCursor: null,
    artifactCursor: null,
  });
  const [auditorAttemptHistory, setAuditorAttemptHistory] = useState({
    activityCursor: [],
    evidenceCursor: [],
    artifactCursor: [],
  });
  const [auditorDetailLoading, setAuditorDetailLoading] = useState(false);
  const [auditorDetailError, setAuditorDetailError] = useState('');
  const pendingCompletionKeys = useRef(new Map());

  const loadPath = useCallback(async () => {
    const response = await getHubLearningPath();
    const nextPath = normalisePath(response.data);
    setPath(nextPath);
    setSelectedModuleId((current) => current || nextPath?.modules?.[0]?.id || null);
  }, []);

  const loadAuditorOverview = useCallback(async (cursors = {}) => {
    const response = await getHubAuditorOverview(cursors);
    setAuditorOverview(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const contextResponse = await getHubContext();
        if (cancelled) return;
        const nextContext = normaliseContext(contextResponse.data);

        if (!nextContext.available || !nextContext.identity) {
          setError({
            title: 'Training Hub is not configured',
            message: nextContext.message || 'Authentication and identity provisioning must be configured by Trez before this Hub can load assigned training.',
          });
          return;
        }

        setContext(nextContext);
        const roles = identityRoles(nextContext.identity);
        if (roles.includes(ADMIN_ROLE) || roles.includes(TRAINER_ROLE) || roles.includes(RRHH_ROLE)) {
          setStaffLanguagePreference(nextContext.identity.preferredLocale === 'es' ? 'es' : 'en');
        }
        if (roles.includes(POSTULANTE_ROLE)) {
          await loadPath();
        } else if (roles.includes(TRAINER_ROLE) || roles.includes(RRHH_ROLE)) {
          try {
            const learnersResponse = await getHubTrainerLearners();
            if (!cancelled) setTrainerLearners(learnersResponse.data.postulantes || learnersResponse.data || []);
          } catch (trainerError) {
            if (trainerError?.response?.status === 404 || trainerError?.response?.status === 501) {
              if (!cancelled) {
                setTrainerUnavailable({
                  serverMessage: trainerError?.response?.data?.error?.message,
                });
              }
            } else {
              throw trainerError;
            }
          }
          if (roles.includes(RRHH_ROLE)) await loadAuditorOverview();
        } else if (roles.includes(ADMIN_ROLE)) {
          // ADMIN is intentionally limited to debugging and TRAINER account creation.
        } else {
          setError({
            title: 'Hub access unavailable',
            message: 'This authenticated server identity does not have an implemented Hub experience.',
          });
        }
      } catch (loadError) {
        if (!cancelled) setError(unavailableCopy(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [loadAuditorOverview, loadPath]);

  const changeAuditorOverviewPage = async (stream, direction) => {
    const cursorKey = stream === 'postulantes' ? 'postulanteCursor' : 'sessionCursor';
    const pageKey = stream === 'postulantes' ? 'postulantes' : 'legacySimulatorSessions';
    const history = auditorOverviewHistory[cursorKey];
    const nextCursor = direction === 'next'
      ? auditorOverview?.pageInfo?.[pageKey]?.nextCursor
      : history.at(-1) || null;
    if (direction === 'next' && !nextCursor) return;

    const nextCursors = { ...auditorOverviewCursors, [cursorKey]: nextCursor };
    await loadAuditorOverview(nextCursors);
    setAuditorOverviewCursors(nextCursors);
    setAuditorOverviewHistory((current) => ({
      ...current,
      [cursorKey]: direction === 'next'
        ? [...current[cursorKey], auditorOverviewCursors[cursorKey]]
        : current[cursorKey].slice(0, -1),
    }));
  };

  const loadAuditorSessionReport = async (sessionId, cursors = {}, reset = true) => {
    setAuditorDetailLoading(true);
    setAuditorDetailError('');
    setAuditorAttempt(null);
    try {
      const response = await getHubAuditorSimulatorSession(sessionId, cursors);
      setAuditorReport(response.data);
      setAuditorReportSessionId(sessionId);
      if (reset) {
        setAuditorReportCursors({ operationCursor: null, actionCursor: null });
        setAuditorReportHistory({ operationCursor: [], actionCursor: [] });
      }
    } catch (detailError) {
      setAuditorReport(null);
      setAuditorDetailError(
        detailError?.response?.data?.error?.message ||
        'The read-only simulator report could not be loaded.'
      );
    } finally {
      setAuditorDetailLoading(false);
    }
  };

  const changeAuditorReportPage = async (stream, direction) => {
    const streamConfig = {
      operations: ['operationCursor', 'operations'],
      auditLog: ['actionCursor', 'auditLog'],
    };
    const [cursorKey, pageKey] = streamConfig[stream];
    const history = auditorReportHistory[cursorKey];
    const nextCursor = direction === 'next'
      ? auditorReport?.pageInfo?.[pageKey]?.nextCursor
      : history.at(-1) || null;
    if (direction === 'next' && !nextCursor) return;
    const nextCursors = { ...auditorReportCursors, [cursorKey]: nextCursor };
    await loadAuditorSessionReport(auditorReportSessionId, nextCursors, false);
    setAuditorReportCursors(nextCursors);
    setAuditorReportHistory((current) => ({
      ...current,
      [cursorKey]: direction === 'next'
        ? [...current[cursorKey], auditorReportCursors[cursorKey]]
        : current[cursorKey].slice(0, -1),
    }));
  };

  const loadAuditorLearningRecord = async (identityId, cursors = {}, reset = true) => {
    setAuditorDetailLoading(true);
    setAuditorDetailError('');
    setAuditorReport(null);
    setAuditorAttempt(null);
    try {
      const response = await getHubAuditorTraineeLearningRecords(identityId, cursors);
      setAuditorLearningRecord(response.data);
      setAuditorLearningIdentityId(identityId);
      if (reset) {
        setAuditorLearningCursors({ moduleCursor: null, attemptCursor: null });
        setAuditorLearningHistory({ moduleCursor: [], attemptCursor: [] });
      }
    } catch (detailError) {
      setAuditorLearningRecord(null);
      setAuditorDetailError(
        detailError?.response?.data?.error?.message ||
        'The read-only Postulante record could not be loaded.'
      );
    } finally {
      setAuditorDetailLoading(false);
    }
  };

  const changeAuditorLearningPage = async (stream, direction) => {
    const streamConfig = {
      moduleRecords: ['moduleCursor', 'moduleRecords'],
      attempts: ['attemptCursor', 'attempts'],
    };
    const [cursorKey, pageKey] = streamConfig[stream];
    const history = auditorLearningHistory[cursorKey];
    const nextCursor = direction === 'next'
      ? auditorLearningRecord?.pageInfo?.[pageKey]?.nextCursor
      : history.at(-1) || null;
    if (direction === 'next' && !nextCursor) return;
    const nextCursors = { ...auditorLearningCursors, [cursorKey]: nextCursor };
    await loadAuditorLearningRecord(auditorLearningIdentityId, nextCursors, false);
    setAuditorLearningCursors(nextCursors);
    setAuditorLearningHistory((current) => ({
      ...current,
      [cursorKey]: direction === 'next'
        ? [...current[cursorKey], auditorLearningCursors[cursorKey]]
        : current[cursorKey].slice(0, -1),
    }));
  };

  const loadAuditorAttempt = async (attemptId, cursors = {}, reset = true) => {
    setAuditorDetailLoading(true);
    setAuditorDetailError('');
    setAuditorReport(null);
    try {
      const response = await getHubAuditorAttempt(attemptId, cursors);
      setAuditorAttempt(response.data);
      setAuditorAttemptId(attemptId);
      if (reset) {
        setAuditorAttemptCursors({
          activityCursor: null,
          evidenceCursor: null,
          artifactCursor: null,
        });
        setAuditorAttemptHistory({
          activityCursor: [],
          evidenceCursor: [],
          artifactCursor: [],
        });
      }
    } catch (detailError) {
      setAuditorAttempt(null);
      setAuditorDetailError(
        detailError?.response?.data?.error?.message ||
        'The read-only Hub attempt evidence could not be loaded.'
      );
    } finally {
      setAuditorDetailLoading(false);
    }
  };

  const changeAuditorAttemptPage = async (stream, direction) => {
    const streamConfig = {
      activityAttempts: ['activityCursor', 'activityAttempts'],
      evidenceEvents: ['evidenceCursor', 'evidenceEvents'],
      artifacts: ['artifactCursor', 'artifacts'],
    };
    const [cursorKey, pageKey] = streamConfig[stream];
    const history = auditorAttemptHistory[cursorKey];
    const nextCursor = direction === 'next'
      ? auditorAttempt?.pageInfo?.[pageKey]?.nextCursor
      : history.at(-1) || null;
    if (direction === 'next' && !nextCursor) return;

    const nextCursors = { ...auditorAttemptCursors, [cursorKey]: nextCursor };
    await loadAuditorAttempt(auditorAttemptId, nextCursors, false);
    setAuditorAttemptCursors(nextCursors);
    setAuditorAttemptHistory((current) => ({
      ...current,
      [cursorKey]: direction === 'next'
        ? [...current[cursorKey], auditorAttemptCursors[cursorKey]]
        : current[cursorKey].slice(0, -1),
    }));
  };

  const handleCompleteActivity = async (activity, activityState = {}) => {
    setBusyActivityId(activity.id);
    setNotice('');
    const idempotencyKey = pendingCompletionKeys.current.get(activity.id) || crypto.randomUUID();
    pendingCompletionKeys.current.set(activity.id, idempotencyKey);
    try {
      if (activity.type === 'focused_practice' && activity.content?.surface === 'balance') {
        await submitHubRefreshBalance(activity.id, {
          ...activityState,
          idempotencyKey,
        });
      } else if (activity.type === 'focused_practice' && activity.content?.surface === 'add_credits') {
        const settle = activityState.action === 'CANCELLED'
          ? cancelHubAddCreditsPractice
          : approveHubAddCreditsPractice;
        await settle(activity.id, {
          ...activityState,
          idempotencyKey,
        });
      } else if (activity.type === 'focused_practice' && activity.content?.surface === 'withdraw_credits') {
        const settle = activityState.action === 'CANCELLED'
          ? cancelHubWithdrawCreditsPractice
          : approveHubWithdrawCreditsPractice;
        await settle(activity.id, { ...activityState, idempotencyKey });
      } else {
        await completeHubActivity(activity.id, {
          state: activity.type === 'acknowledgement'
            ? { acknowledged: true, ...activityState }
            : activityState,
          idempotencyKey,
        });
      }
      await loadPath();
      pendingCompletionKeys.current.delete(activity.id);
      setNotice(`${activity.title} progress was saved.`);
    } catch (completionError) {
      setNotice(
        completionError?.response?.data?.error?.message ||
        completionError?.response?.data?.message ||
        'Progress could not be saved. Retry will safely reuse the same request.'
      );
    } finally {
      setBusyActivityId(null);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setSigningIn(true);
    setLoginStatus('');
    try {
      await loginHub(username, password);
      window.location.assign('/hub');
    } catch (loginError) {
      setLoginStatus(loginError?.response?.data?.error?.message || 'The username or password is incorrect.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutHub().catch(() => {});
    window.location.assign('/hub');
  };

  if (loading) {
    return (
      <main className="hub-state-page">
        <div className="hub-state-card" role="status">
          <span className="hub-loader" aria-hidden="true" />
          <h1>Loading assigned training</h1>
          <p>The Hub is requesting identity and progress from the server.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hub-state-page">
        <div className="hub-state-card">
          <span className="hub-brand-mark" aria-hidden="true">T</span>
          <p className="hub-eyebrow">Trez Training Hub</p>
          <h1>{error.title}</h1>
          <p>{error.message}</p>
          {error.canSignIn && (
            <form className="hub-auth-form" onSubmit={handleLogin}>
              <label htmlFor="hub-sign-in-username">Username</label>
              <input
                id="hub-sign-in-username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <label htmlFor="hub-sign-in-password">Password</label>
              <input
                id="hub-sign-in-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button className="hub-primary-button" type="submit" disabled={signingIn}>
                {signingIn ? 'Signing in…' : 'Sign in'}
              </button>
              {loginStatus && <p role="status">{loginStatus}</p>}
              <small>TRAINER and RRHH create Postulante accounts; ADMIN creates TRAINER accounts. Email addresses are not used to sign in.</small>
            </form>
          )}
          <a className="hub-secondary-link" href="/">Return to Operator Simulator</a>
        </div>
      </main>
    );
  }

  const identity = context.identity;
  const roles = identityRoles(identity);
  const isTrainer = roles.includes(TRAINER_ROLE) && !roles.includes(POSTULANTE_ROLE);
  const isAdministrator = roles.includes(ADMIN_ROLE) && !roles.includes(POSTULANTE_ROLE);
  const isAuditor = roles.includes(RRHH_ROLE) && !roles.includes(POSTULANTE_ROLE);
  const canManagePostulantes = isTrainer || isAuditor;
  const canSwitchStaffLanguage = canManagePostulantes || isAdministrator;
  const staffLanguage = canSwitchStaffLanguage ? staffLanguagePreference : 'en';
  const staffCopy = STAFF_VIEW_COPY[staffLanguage];
  const displayedRoles = roles.map((role) => {
    if (staffLanguage !== 'es') return role;
    if (role === ADMIN_ROLE) return 'ADMIN';
    if (role === TRAINER_ROLE) return 'FORMADOR';
    if (role === RRHH_ROLE) return 'RRHH';
    return role;
  });
  const course = path?.course || {};

  return (
    <div className="hub-app-shell" lang={staffLanguage}>
      <header className="hub-topbar">
        <a className="hub-brand" href="/hub" aria-label="Trez Training Hub home">
          <span className="hub-brand-mark" aria-hidden="true">T</span>
          <span><strong>Trez Training Hub</strong><small>{staffCopy.brandSubtitle}</small></span>
        </a>
        <div className="hub-header-actions">
          {canSwitchStaffLanguage && (
            <div className="hub-language-switch" role="group" aria-label={staffCopy.languageLabel}>
              <button
                type="button"
                aria-pressed={staffLanguagePreference === 'en'}
                onClick={() => setStaffLanguagePreference('en')}
              >
                English
              </button>
              <button
                type="button"
                aria-pressed={staffLanguagePreference === 'es'}
                onClick={() => setStaffLanguagePreference('es')}
              >
                Español
              </button>
            </div>
          )}
          <div className="hub-identity" aria-label={staffCopy.currentIdentity}>
            <span>{identity.displayName || identity.name || staffCopy.serverIdentity}</span>
            <small>{identity.username ? `${identity.username} · ` : ''}{displayedRoles.join(', ')}</small>
            <button type="button" onClick={handleLogout}>{staffCopy.signOut}</button>
          </div>
        </div>
      </header>

      <main className="hub-main">
        {!isTrainer && !isAuditor && !isAdministrator && <section className="hub-course-hero" aria-labelledby="hub-course-title">
          <div>
            <p className="hub-eyebrow">Assigned course</p>
            <h1 id="hub-course-title">{course.title || 'Operator foundations'}</h1>
            {course.description && <p>{course.description}</p>}
          </div>
          <ProgressBar progress={path?.progress} label="Course progress" />
          {(course.provisional || course.scored === false) && (
            <p className="hub-course-classification">Provisional · Non-scored foundation</p>
          )}
        </section>}

        {notice && <p className="hub-page-notice" role="status">{notice}</p>}

        {isAdministrator && <HubAdminAccounts />}

        {canManagePostulantes && <HubAssessmentManagement canEditEvaluations={isTrainer} />}

        {isTrainer && (
          <section className="hub-trainer-section" aria-labelledby="hub-trainer-title">
            <p className="hub-eyebrow">{staffCopy.trainerView}</p>
            <h2 id="hub-trainer-title">{staffCopy.progressTitle}</h2>
            {trainerUnavailable ? (
              <p className="hub-inline-notice" role="status">
                {staffLanguage === 'es'
                  ? staffCopy.visibilityUnavailable
                  : trainerUnavailable.serverMessage || staffCopy.visibilityUnavailable}
              </p>
            ) : (
              <HubTrainerOverview learners={trainerLearners || []} locale={staffLanguage} />
            )}
          </section>
        )}

        {isAuditor && (
          <section className="hub-trainer-section" aria-labelledby="hub-auditor-title">
            <p className="hub-eyebrow">{staffCopy.auditorView}</p>
            <h2 id="hub-auditor-title">RRHH reporting</h2>
            <HubAuditorOverview
              overview={auditorOverview}
              report={auditorReport}
              learningRecord={auditorLearningRecord}
              attempt={auditorAttempt}
              reportLoading={auditorDetailLoading}
              reportError={auditorDetailError}
              traineeCanGoBack={auditorOverviewHistory.postulanteCursor.length > 0}
              sessionCanGoBack={auditorOverviewHistory.sessionCursor.length > 0}
              onTraineePrevious={() => changeAuditorOverviewPage('postulantes', 'previous')}
              onTraineeNext={() => changeAuditorOverviewPage('postulantes', 'next')}
              onSessionPrevious={() => changeAuditorOverviewPage('sessions', 'previous')}
              onSessionNext={() => changeAuditorOverviewPage('sessions', 'next')}
              onSelectSession={loadAuditorSessionReport}
              onSelectTrainee={loadAuditorLearningRecord}
              onSelectAttempt={loadAuditorAttempt}
              learningHistory={auditorLearningHistory}
              reportHistory={auditorReportHistory}
              onLearningPrevious={(stream) => changeAuditorLearningPage(stream, 'previous')}
              onLearningNext={(stream) => changeAuditorLearningPage(stream, 'next')}
              onReportPrevious={(stream) => changeAuditorReportPage(stream, 'previous')}
              onReportNext={(stream) => changeAuditorReportPage(stream, 'next')}
              attemptHistory={auditorAttemptHistory}
              onAttemptPrevious={(stream) => changeAuditorAttemptPage(stream, 'previous')}
              onAttemptNext={(stream) => changeAuditorAttemptPage(stream, 'next')}
            />
          </section>
        )}

        {!isTrainer && !isAuditor && !isAdministrator && (
          <>
            <HubLearningPath
              path={path}
              selectedModuleId={selectedModuleId}
              onSelectModule={setSelectedModuleId}
              busyActivityId={busyActivityId}
              onCompleteActivity={handleCompleteActivity}
            />
            <HubScoredEvaluationOverview />
          </>
        )}

        {(isTrainer || isAuditor || isAdministrator) && <HubPasswordPanel />}
      </main>

      <footer className="hub-footer">
        <span>{staffCopy.footerStatus}</span>
        <a href="/">{staffCopy.simulatorLink}</a>
      </footer>
    </div>
  );
}
