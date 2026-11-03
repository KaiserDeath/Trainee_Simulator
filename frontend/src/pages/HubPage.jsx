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
import HubContentStudio from '../components/hub/HubContentStudio';
import HubCoachingWorkspace from '../components/hub/HubCoachingWorkspace';
import HubPolicyStudio from '../components/hub/HubPolicyStudio';
import HubMediaLibrary from '../components/hub/HubMediaLibrary';
import HubCohorts from '../components/hub/HubCohorts';
import '../styles/hub.css';
import '../styles/hub-theme.css';

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
      readOnly:completeStatus(module.status)&&(module.activities||[]).some(item=>item.content?.executionKind==='official_evaluation'),
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
  const [staffSection,setStaffSection]=useState(()=>window.location.hash.replace('#hub-',''));
  useEffect(()=>{const change=()=>{if(window.location.hash!=='#hub-main-content')setStaffSection(window.location.hash.replace('#hub-',''));};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const [path, setPath] = useState(null);
  const [assessmentOpen,setAssessmentOpen]=useState(false);
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
      if (['account_id_lab','account_creation','reset_current_account','exception_decision','mixed_practice'].includes(activity.content?.executionKind) && activityState.serverCompleted) {
        // The dedicated command already committed server-verified completion.
      } else if (activity.type === 'focused_practice' && activity.content?.surface === 'balance') {
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
      <main className="hub-state-page hub-light-theme">
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
      <main className="hub-state-page hub-light-theme">
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
  const availableSections=isAdministrator?['people','policies','curriculum','media','profile']:isTrainer?['curriculum','media','coaching','groups','progress','management','profile']:['coaching','groups','management','auditor-title','profile'];
  const activeSection=availableSections.includes(staffSection)?staffSection:(isAdministrator?'people':'management');
  function chooseSection(event,section){
    event.preventDefault();setStaffSection(section);window.history.pushState(null,'',`#hub-${section}`);
    window.scrollTo(0,0);
    requestAnimationFrame(()=>{const heading=document.getElementById(`hub-${section}`)?.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
  }

  return (
    <div className={`hub-app-shell hub-light-theme${isTrainer ? ' hub-staff-console' : ''}`} lang={staffLanguage}>
      <a className="hub-skip-link" href="#hub-main-content">Skip to workspace</a>
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

      <div className={(isAdministrator||canManagePostulantes)?'hub-workspace-layout':'hub-learner-workspace'}>
      {(isAdministrator||canManagePostulantes)&&<aside className="hub-sidebar" aria-label="Workspace navigation">
        <p className="hub-sidebar-label">{staffLanguage==='es'?'ESPACIO DE TRABAJO':'WORKSPACE'}</p>
        <nav aria-label="Hub tools">
          {isAdministrator&&<a href="#hub-people" aria-current={activeSection==='people'?'page':undefined} onClick={event=>chooseSection(event,'people')}>{staffLanguage==='es'?'Personas y acceso':'People & access'}</a>}
          {isAdministrator&&<a href="#hub-policies" aria-current={activeSection==='policies'?'page':undefined} onClick={event=>chooseSection(event,'policies')}>{staffLanguage==='es'?'Reglas de cuentas':'Account policies'}</a>}
          {(isAdministrator||isTrainer)&&<a href="#hub-curriculum" aria-current={activeSection==='curriculum'?'page':undefined} onClick={event=>chooseSection(event,'curriculum')}>{staffLanguage==='es'?'Contenido de formación':'Training content'}</a>}
          {(isAdministrator||isTrainer)&&<a href="#hub-media" aria-current={activeSection==='media'?'page':undefined} onClick={event=>chooseSection(event,'media')}>{staffLanguage==='es'?'Biblioteca de recursos':'Media library'}</a>}
          {canManagePostulantes&&<a href="#hub-coaching" aria-current={activeSection==='coaching'?'page':undefined} onClick={event=>chooseSection(event,'coaching')}>{staffLanguage==='es'?'Seguimiento y notas':'Coaching'}</a>}
          {canManagePostulantes&&<a href="#hub-groups" aria-current={activeSection==='groups'?'page':undefined} onClick={event=>chooseSection(event,'groups')}>{staffLanguage==='es'?'Grupos y fechas':'Cohorts & dates'}</a>}
          {isTrainer&&<a href="#hub-progress" aria-current={activeSection==='progress'?'page':undefined} onClick={event=>chooseSection(event,'progress')}>{staffLanguage==='es'?'Progreso de participantes':'Learner progress'}</a>}
          {canManagePostulantes&&<a href="#hub-management" aria-current={activeSection==='management'?'page':undefined} onClick={event=>chooseSection(event,'management')}>{staffLanguage==='es'?'Evaluaciones y reportes':'People, evaluations & reports'}</a>}
          {isAuditor&&<a href="#hub-auditor-title" aria-current={activeSection==='auditor-title'?'page':undefined} onClick={event=>chooseSection(event,'auditor-title')}>{staffLanguage==='es'?'Auditoría de RRHH':'RRHH audit'}</a>}
          <a href="#hub-profile" aria-current={activeSection==='profile'?'page':undefined} onClick={event=>chooseSection(event,'profile')}>{staffLanguage==='es'?'Contraseña y seguridad':'Password & security'}</a>
        </nav>
        <p className="hub-sidebar-help">{staffLanguage==='es'?'Selecciona una sección para acceder a tus herramientas.':'Choose a section to focus on the tools you need.'}</p>
      </aside>}
      <main className="hub-main" id="hub-main-content">
        {(isAdministrator||canManagePostulantes)&&<div className="hub-workspace-intro"><p className="hub-eyebrow">{staffLanguage==='es'?'FORMACIÓN DE OPERADORES':'OPERATOR TRAINING'}</p><h1>{isAdministrator?(staffLanguage==='es'?'Administración del Hub':'Hub administration'):(staffLanguage==='es'?'Tu espacio de formación':'Your training workspace')}</h1><p>{isAdministrator?(staffLanguage==='es'?'Gestiona el acceso, las reglas y el contenido de formación.':'Manage staff access, account policies and training content.'):(staffLanguage==='es'?'Organiza participantes, revisa evidencias y acompaña su progreso.':'Organize learners, review evidence and support their progress.')}</p></div>}
        {!assessmentOpen&&!isTrainer && !isAuditor && !isAdministrator && <section className="hub-course-hero" aria-labelledby="hub-course-title">
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
        {!assessmentOpen&&roles.includes(POSTULANTE_ROLE) && <p><a className="hub-secondary-link" href="/simulator">Open free operator simulator</a></p>}
        {isTrainer && <p><a className="hub-secondary-link" href="/trainer">Open simulator session reports</a></p>}

        {isAdministrator && <div id="hub-people" hidden={activeSection!=='people'} className="hub-section-anchor"><HubAdminAccounts /></div>}
        {isAdministrator && <div id="hub-policies" hidden={activeSection!=='policies'} className="hub-section-anchor"><HubPolicyStudio locale={staffLanguage} /></div>}
        {(isAdministrator || isTrainer) && <div id="hub-curriculum" hidden={activeSection!=='curriculum'} className="hub-section-anchor"><HubContentStudio canEdit={isAdministrator} locale={staffLanguage} /></div>}
        {(isAdministrator||isTrainer)&&<div id="hub-media" hidden={activeSection!=='media'} className="hub-section-anchor"><HubMediaLibrary canEdit={isAdministrator}/></div>}
        {canManagePostulantes && <div id="hub-coaching" hidden={activeSection!=='coaching'} className="hub-section-anchor"><HubCoachingWorkspace canEdit={isTrainer} locale={staffLanguage} /></div>}
        {!assessmentOpen&&(canManagePostulantes||roles.includes(POSTULANTE_ROLE))&&<div id="hub-groups" hidden={canManagePostulantes&&activeSection!=='groups'} className="hub-section-anchor"><HubCohorts canManage={canManagePostulantes}/></div>}

        {isTrainer && (
          <section id="hub-progress" hidden={activeSection!=='progress'} className="hub-trainer-section hub-section-anchor" aria-labelledby="hub-trainer-title">
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

        {canManagePostulantes && <div id="hub-management" hidden={activeSection!=='management'} className="hub-section-anchor"><HubAssessmentManagement canEditEvaluations={isTrainer} /></div>}

        {isAuditor && (
          <section hidden={activeSection!=='auditor-title'} className="hub-trainer-section" aria-labelledby="hub-auditor-title">
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
            {!assessmentOpen&&<HubLearningPath
              path={path}
              selectedModuleId={selectedModuleId}
              onSelectModule={setSelectedModuleId}
              busyActivityId={busyActivityId}
              onCompleteActivity={handleCompleteActivity}
            />}
            <HubScoredEvaluationOverview onActiveChange={setAssessmentOpen}/>
          </>
        )}

        {(isTrainer || isAuditor || isAdministrator) && <div id="hub-profile" hidden={activeSection!=='profile'} className="hub-section-anchor"><HubPasswordPanel /></div>}
      </main>
      </div>
      <footer className="hub-footer">
        <span>{staffCopy.footerStatus}</span>
        <a href="/">{staffCopy.simulatorLink}</a>
      </footer>
    </div>
  );
}
