import HubWorkspacePanel from '../components/hub/HubWorkspacePanel';
import {hubText} from '../i18n/hubLocale';
import {hubServerMessage} from '../i18n/hubLocale';
import {hubMessage} from '../i18n/hubLocale';
import {useHubLocale} from '../i18n/HubLocaleContext';
import {HubLocaleProvider,HubLanguageSwitch} from '../i18n/HubLanguageProvider';
import {hubValidationMessage} from '../i18n/hubLocale';
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
import HubAdministratorConfiguration from '../components/hub/HubAdministratorConfiguration';
import HubAssessmentManagement from '../components/hub/HubAssessmentManagement';
import HubAuditorOverview from '../components/hub/HubAuditorOverview';
import HubLearnerWorkspace from '../components/hub/HubLearnerWorkspace';
import {normaliseLearningPaths} from '../components/hub/hubLearningModel';
import HubPasswordPanel from '../components/hub/HubPasswordPanel';
import HubTrainerOverview from '../components/hub/HubTrainerOverview';
import HubStaffHome from '../components/hub/HubStaffHome';
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
};

const unavailableCopy = (error) => {
  const status = error?.response?.status;

  if (status === 401) {
    return {
      title: 'Sign in to continue',
      message: 'Sign in with your assigned username and password.',
      canSignIn: true,
    };
  }

  if (status === 403) {
    return {
      title: 'Hub access unavailable',
      message: 'Your account does not have Hub access. Contact your trainer.',
    };
  }

  return {
    title: 'Training Hub is not configured',
    message: 'Training is temporarily unavailable. Try again or contact your trainer.',
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

const identityRoles = (identity) => {
  const roles = identity?.roles || (identity?.role ? [identity.role] : []);
  return roles.map((role) => String(role).toUpperCase());
};

export default function HubPage(){return <HubLocaleProvider><HubScreen/></HubLocaleProvider>;}

function HubScreen() {
  const {t,locale,setIdentity,contentTranslationUnavailable,contentTranslationIssues} = useHubLocale();
  const localizeValidity=event=>event.target.setCustomValidity?.(t(hubValidationMessage(event.target.validity)));
  const clearValidity=event=>event.target.setCustomValidity?.('');
  const [context, setContext] = useState(null);
  const [staffSection,setStaffSection]=useState(()=>window.location.hash.replace('#hub-',''));
  useEffect(()=>{const change=()=>{if(window.location.hash!=='#hub-main-content')setStaffSection(window.location.hash.replace('#hub-',''));};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  const [paths, setPaths] = useState([]);
  const [assessmentOpen,setAssessmentOpen]=useState(false);
  const [busyActivityId, setBusyActivityId] = useState(null);
  const [trainerLearners, setTrainerLearners] = useState(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [translationReloading,setTranslationReloading]=useState(false);
  const [trainerUnavailable, setTrainerUnavailable] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [signingIn, setSigningIn] = useState(false);
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
    const nextPaths=normaliseLearningPaths(response.data);setPaths(nextPaths);return nextPaths;
  }, []);
  async function refreshContentTranslations(){setTranslationReloading(true);try{await loadPath();}catch{setNotice(hubMessage('Translations could not be refreshed. Your entries remain in this view.'));}finally{setTranslationReloading(false);}}

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
        setIdentity(nextContext.identity);
        if (roles.includes(POSTULANTE_ROLE)) {
          await loadPath();
        } else if (roles.includes(TRAINER_ROLE) || roles.includes(RRHH_ROLE)) {
          try {
            const learnersResponse = await getHubTrainerLearners();
            if (!cancelled) {setTrainerLearners(learnersResponse.data.postulantes || learnersResponse.data || []); setSnapshotUpdatedAt(new Date().toISOString());}
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
  }, [loadAuditorOverview, loadPath,setIdentity]);

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
        hubServerMessage(detailError?.response?.data?.error?.message ||
        hubMessage("The read-only simulator report could not be loaded."), hubMessage("The read-only simulator report could not be loaded."))
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
        hubServerMessage(detailError?.response?.data?.error?.message ||
        hubMessage("The read-only Postulante record could not be loaded."), hubMessage("The read-only Postulante record could not be loaded."))
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
        hubServerMessage(detailError?.response?.data?.error?.message ||
        hubMessage("The read-only Hub attempt evidence could not be loaded."), hubMessage("The read-only Hub attempt evidence could not be loaded."))
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
      const savedPaths=await loadPath();
      pendingCompletionKeys.current.delete(activity.id);
      const savedActivity=savedPaths.flatMap(path=>path.modules.flatMap(module=>module.activities)).find(item=>item.id===activity.id)||activity;
      setNotice(hubMessage("{0} progress was saved.", [hubText(savedActivity.title,savedActivity.displayTranslation?.es)]));
      return true;
    } catch (completionError) {
      setNotice(
        hubServerMessage(completionError?.response?.data?.error?.message ||
        completionError?.response?.data?.message ||
        hubMessage("Progress could not be saved. Retry will safely reuse the same request."), hubMessage("Progress could not be saved. Retry will safely reuse the same request."))
      );
      return false;
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
      setLoginStatus(hubServerMessage(loginError?.response?.data?.error?.message || hubMessage("The username or password is incorrect."), hubMessage("The username or password is incorrect.")));
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
      <main className="hub-state-page hub-light-theme" lang={locale} onInvalidCapture={localizeValidity} onInputCapture={clearValidity}>
        <div className="hub-state-card" role="status">
          <span className="hub-loader" aria-hidden="true" />
          <h1>{t("Loading assigned training")}</h1>
          <p>{t("The Hub is requesting identity and progress from the server.")}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hub-state-page hub-light-theme" lang={locale} onInvalidCapture={localizeValidity} onInputCapture={clearValidity}>
        <div className="hub-state-card">
          <HubLanguageSwitch/>
          <span className="hub-brand-mark" aria-hidden="true">{t("T")}</span>
          <p className="hub-eyebrow">{t("Trez Training Hub")}</p>
          <h1>{t(error.title)}</h1>
          <p>{t(hubServerMessage(error.message))}</p>
          {error.canSignIn && (
            <form className="hub-auth-form" onSubmit={handleLogin}>
              <label htmlFor="hub-sign-in-username">{t("Username")}</label>
              <input
                id="hub-sign-in-username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <label htmlFor="hub-sign-in-password">{t("Password")}</label>
              <input
                id="hub-sign-in-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button className="hub-primary-button" type="submit" disabled={signingIn}>
                {signingIn ? t("Signing in…") : t("Sign in")}
              </button>
              {loginStatus && <p role="status">{t(loginStatus)}</p>}
              <small>{t("TRAINER and RRHH create Postulante accounts; ADMIN creates TRAINER accounts. Email addresses are not used to sign in.")}</small>
            </form>
          )}
          <a className="hub-secondary-link" href="/">{t("Return to Operator Simulator")}</a>
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
  const staffLanguage = locale;
  const staffCopy = STAFF_VIEW_COPY.en;
  const displayedRoles = roles.map(role=>t(role));
  const availableSections=isAdministrator?['people','policies','curriculum','media','profile']:isTrainer?['home','curriculum','media','coaching','groups','progress','management','profile']:['coaching','groups','management','auditor-title','profile'];
  const activeSection=availableSections.includes(staffSection)?staffSection:(isAdministrator?'people':isTrainer&&['','#/staff/home'].includes(staffSection)?'home':'management');
  async function refreshSnapshot(){
    setSnapshotBusy(true);setTrainerUnavailable('');
    try{const response=await getHubTrainerLearners();setTrainerLearners(response.data.postulantes||response.data||[]);setSnapshotUpdatedAt(new Date().toISOString());}
    catch{setTrainerUnavailable({unavailable:true});}finally{setSnapshotBusy(false);}
  }
  function chooseSection(event,section){
    event.preventDefault();setStaffSection(section);window.history.pushState(null,'',`#hub-${section}`);
    window.scrollTo(0,0);
    requestAnimationFrame(()=>{const heading=document.getElementById(`hub-${section}`)?.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
  }

  return (
    <div className={`hub-app-shell hub-light-theme${isTrainer ? ' hub-staff-console' : ''}`} lang={staffLanguage} onInvalidCapture={localizeValidity} onInputCapture={clearValidity}>
      <a className="hub-skip-link" href="#hub-main-content">{t("Skip to workspace")}</a>
      <header className="hub-topbar">
        <a className="hub-brand" href="/hub">
          <span className="hub-brand-mark" aria-hidden="true">{t("T")}</span>
          <span><strong>{t("Trez Training Hub")}</strong><small>{t(staffCopy.brandSubtitle)}</small></span>
        </a>
        <div className="hub-header-actions">
          <HubLanguageSwitch/>
          <div className="hub-identity" aria-label={t(staffCopy.currentIdentity)}>
            <span>{identity.displayName || identity.name || staffCopy.serverIdentity}</span>
            <small>{identity.username ? `${identity.username} · ` : ''}{displayedRoles.join(', ')}</small>
            <button type="button" onClick={handleLogout}>{t(staffCopy.signOut)}</button>
          </div>
        </div>
      </header>

      <div className={(isAdministrator||canManagePostulantes)?'hub-workspace-layout':'hub-learner-workspace'}>
      {(isAdministrator||canManagePostulantes)&&<aside className="hub-sidebar" aria-label={t("Workspace navigation")}>
        <p className="hub-sidebar-label">{t("WORKSPACE")}</p>
        <nav aria-label={t("Hub tools")}>
          {isTrainer&&<a href="#hub-home" aria-current={activeSection==='home'?'page':undefined} onClick={event=>chooseSection(event,'home')}>{t('Workspace overview')}</a>}
          {isAdministrator&&<a href="#hub-people" aria-current={activeSection==='people'?'page':undefined} onClick={event=>chooseSection(event,'people')}>{t("People & access")}</a>}
          {isAdministrator&&<a href="#hub-policies" aria-current={activeSection==='policies'?'page':undefined} onClick={event=>chooseSection(event,'policies')}>{t("Account policies")}</a>}
          {(isAdministrator||isTrainer)&&<a href="#hub-curriculum" aria-current={activeSection==='curriculum'?'page':undefined} onClick={event=>chooseSection(event,'curriculum')}>{t("Training content")}</a>}
          {(isAdministrator||isTrainer)&&<a href="#hub-media" aria-current={activeSection==='media'?'page':undefined} onClick={event=>chooseSection(event,'media')}>{t("Media library")}</a>}
          {canManagePostulantes&&<a href="#hub-coaching" aria-current={activeSection==='coaching'?'page':undefined} onClick={event=>chooseSection(event,'coaching')}>{t("Coaching")}</a>}
          {canManagePostulantes&&<a href="#hub-groups" aria-current={activeSection==='groups'?'page':undefined} onClick={event=>chooseSection(event,'groups')}>{t("Cohorts & dates")}</a>}
          {isTrainer&&<a href="#hub-progress" aria-current={activeSection==='progress'?'page':undefined} onClick={event=>chooseSection(event,'progress')}>{t("Learner progress")}</a>}
          {canManagePostulantes&&<a href="#hub-management" aria-current={activeSection==='management'?'page':undefined} onClick={event=>chooseSection(event,'management')}>{t("People, evaluations & reports")}</a>}
          {isAuditor&&<a href="#hub-auditor-title" aria-current={activeSection==='auditor-title'?'page':undefined} onClick={event=>chooseSection(event,'auditor-title')}>{t("RRHH audit")}</a>}
          <a href="#hub-profile" aria-current={activeSection==='profile'?'page':undefined} onClick={event=>chooseSection(event,'profile')}>{t("Password & security")}</a>
        </nav>
        <p className="hub-sidebar-help">{t("Choose a section to focus on the tools you need.")}</p>
      </aside>}
      <main className="hub-main" id="hub-main-content" tabIndex={-1}>
        {(isAdministrator||canManagePostulantes)&&<div className="hub-workspace-intro"><p className="hub-eyebrow">{t("OPERATOR TRAINING")}</p><h1>{isAdministrator?(t("Hub administration")):(t("Your training workspace"))}</h1><p>{isAdministrator?(t("Manage staff access, account policies and training content.")):(t("Organize learners, review evidence and support their progress."))}</p></div>}


        {notice && <p className="hub-page-notice" role="status">{t(notice)}</p>}
        {locale==='es'&&contentTranslationUnavailable&&<p className="hub-inline-notice" role="status">{t('Some content may appear in its source language because translations could not be loaded. Your saved actions are unaffected. Refresh the affected view to retry.')}</p>}
        {locale==='es'&&roles.includes(POSTULANTE_ROLE)&&contentTranslationIssues?.learning&&!assessmentOpen&&<button type="button" className="hub-secondary-button" disabled={translationReloading} onClick={refreshContentTranslations}>{t('Refresh content translations')}</button>}
        {isTrainer&&<HubWorkspacePanel id="hub-home" active={activeSection==='home'} className="hub-section-anchor"><HubStaffHome learners={trainerLearners} updatedAt={snapshotUpdatedAt} busy={snapshotBusy} unavailable={Boolean(trainerUnavailable)} onRefresh={refreshSnapshot}/></HubWorkspacePanel>}
        {isTrainer && <p><a className="hub-secondary-link" href="/trainer">{t("Open simulator session reports")}</a></p>}

        {isAdministrator && <HubWorkspacePanel id="hub-people" active={activeSection==='people'} className="hub-section-anchor"><HubAdministratorConfiguration onSaved={(displayName)=>setContext(current=>({...current,identity:{...current.identity,displayName}}))}/><HubAdminAccounts /></HubWorkspacePanel>}
        {isAdministrator && <HubWorkspacePanel id="hub-policies" active={activeSection==='policies'} className="hub-section-anchor"><HubPolicyStudio locale={staffLanguage} /></HubWorkspacePanel>}
        {(isAdministrator || isTrainer) && <HubWorkspacePanel id="hub-curriculum" active={activeSection==='curriculum'} className="hub-section-anchor"><HubContentStudio canEdit={isAdministrator} locale={staffLanguage} /></HubWorkspacePanel>}
        {(isAdministrator||isTrainer)&&<HubWorkspacePanel id="hub-media" active={activeSection==='media'} className="hub-section-anchor"><HubMediaLibrary canEdit={isAdministrator}/></HubWorkspacePanel>}
        {canManagePostulantes && <HubWorkspacePanel id="hub-coaching" active={activeSection==='coaching'} className="hub-section-anchor"><HubCoachingWorkspace canEdit={isTrainer} locale={staffLanguage} /></HubWorkspacePanel>}
        {canManagePostulantes&&<HubWorkspacePanel id="hub-groups" active={activeSection==='groups'} className="hub-section-anchor"><HubCohorts canManage={canManagePostulantes} locale={staffLanguage}/></HubWorkspacePanel>}

        {isTrainer && (
          <section id="hub-progress" hidden={activeSection!=='progress'} className="hub-trainer-section hub-section-anchor" aria-labelledby="hub-trainer-title">
            <p className="hub-eyebrow">{t(staffCopy.trainerView)}</p>
            <h2 id="hub-trainer-title">{t(staffCopy.progressTitle)}</h2>
            {trainerUnavailable ? (
              <p className="hub-inline-notice" role="status">
                {t(staffCopy.visibilityUnavailable)}
              </p>
            ) : (
              <HubTrainerOverview learners={trainerLearners || []} locale={staffLanguage} />
            )}
          </section>
        )}

        {canManagePostulantes && <HubWorkspacePanel id="hub-management" active={activeSection==='management'} className="hub-section-anchor"><HubAssessmentManagement canEditEvaluations={isTrainer} /></HubWorkspacePanel>}

        {isAuditor && (
          <section hidden={activeSection!=='auditor-title'} className="hub-trainer-section" aria-labelledby="hub-auditor-title">
            <p className="hub-eyebrow">{t(staffCopy.auditorView)}</p>
            <h2 id="hub-auditor-title">{t("RRHH reporting")}</h2>
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

        {!isTrainer && !isAuditor && !isAdministrator && <HubLearnerWorkspace paths={paths} busyActivityId={busyActivityId} onCompleteActivity={handleCompleteActivity} assessmentOpen={assessmentOpen} onActiveChange={setAssessmentOpen}/ >}

        {(isTrainer || isAuditor || isAdministrator) && <HubWorkspacePanel id="hub-profile" active={activeSection==='profile'} className="hub-section-anchor"><HubPasswordPanel /></HubWorkspacePanel>}
      </main>
      </div>
      <footer className="hub-footer">
        <span>{t(staffCopy.footerStatus)}</span>
        <a href="/">{t(staffCopy.simulatorLink)}</a>
      </footer>
    </div>
  );
}
