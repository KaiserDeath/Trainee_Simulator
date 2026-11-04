import {hubText} from '../../i18n/hubLocale';
import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import HubAttemptHistory from './HubAttemptHistory';
import HubReportBreakdown from './HubReportBreakdown';
import HubEvaluationPolicyEditor from './HubEvaluationPolicyEditor';
import HubQuestionBank from './HubQuestionBank';
import HubFormalEvidence from './HubFormalEvidence';
import { useCallback, useEffect, useRef,useState } from 'react';

import {
  assignHubCourse,
  createHubPostulante,
  deactivateHubPostulante,
  getHubAssignableCourses,
  getHubAssessmentReport,
  getHubAssessmentCsv,
  getHubAssessmentSettings,
  getHubPostulanteAccounts,
  getHubScoredEvaluationPolicies,
  reopenHubScoredEvaluation,
  updateHubAssessmentSettings,
  updateHubPostulante,
  updateHubScoredEvaluationPolicy,
} from '../../api/client';

const OPERATION_TYPES = ['ADD CREDITS', 'WITHDRAW CREDITS', 'CREATE ACCOUNT', 'REFRESH BALANCE', 'RESET PASSWORD'];
const emptyFilters = { postulanteId: '', from: '', to: '', status: '', result: '', scoreMin: '', scoreMax: '', operationType: '', category: '', game: '', failure: '', durationMin: '', durationMax: '', settingsRevision: '' };

export default function HubAssessmentManagement({ canEditEvaluations = false }) {
  const {locale,t} = useHubLocale();
  const [accounts, setAccounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseSelections, setCourseSelections] = useState({});
  const [settings, setSettings] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [report, setReport] = useState({ attempts: [], statistics: {} });
  const [evaluationPolicies, setEvaluationPolicies] = useState({ evaluations: [], gameFamilies: [], attemptSets: [], attempts: [], itemResults: [], reopenEvents: [] });
  const [newAccount, setNewAccount] = useState({ firstName: '', surname: '' });
  const [editingAccount,setEditingAccount]=useState(null);
  const editFirstName=useRef(null);
  const editingId=editingAccount?.id;
  useEffect(()=>{if(editingId)editFirstName.current?.focus();},[editingId]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState('people');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState('active');
  const workspaceRequest=useRef(0);

  const load = useCallback(async () => {
    const [accountResponse, courseResponse, settingsResponse, reportResponse, policyResponse] = await Promise.all([
      getHubPostulanteAccounts(), getHubAssignableCourses(), getHubAssessmentSettings(), workspace==='reports'?getHubAssessmentReport(filters):null, workspace==='evaluations'?getHubScoredEvaluationPolicies():null,
    ]);
    setAccounts(accountResponse.data.postulantes || []);
    setCourses(courseResponse.data.courses || []);
    setSettings(settingsResponse.data.settings);
    if(reportResponse)setReport(reportResponse.data);
    if(policyResponse)setEvaluationPolicies(policyResponse.data);
  }, [filters,workspace]);

  useEffect(() => {
    let active = true;
    Promise.all([getHubPostulanteAccounts(), getHubAssignableCourses(), getHubAssessmentSettings()])
      .then(([accountResponse, courseResponse, settingsResponse]) => {
        if (!active) return;
        setAccounts(accountResponse.data.postulantes || []);
        setCourses(courseResponse.data.courses || []);
        setSettings(settingsResponse.data.settings);
      })
      .catch(() => { if (active) setNotice(hubMessage("Assessment administration could not be loaded.")); });
    return () => { active = false; };
  }, []);
  const openWorkspace=async(id)=>{
    const request=++workspaceRequest.current;setWorkspace(id);setNotice('');
    if(id==='people'){setBusy(false);return;}setBusy(true);
    try{
      if(id==='reports'){const response=await getHubAssessmentReport(filters);if(request===workspaceRequest.current)setReport(response.data);}
      else{const response=await getHubScoredEvaluationPolicies();if(request===workspaceRequest.current)setEvaluationPolicies(response.data);}
    }catch(error){if(request===workspaceRequest.current)setNotice(hubServerMessage(error?.response?.data?.error?.message||hubMessage("This workspace could not be loaded."), hubMessage("This workspace could not be loaded.")));}finally{if(request===workspaceRequest.current)setBusy(false);}
  };

  const create = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try { const response = await createHubPostulante(newAccount); setNotice(hubMessage("Postulante created. Username and initial password: {0}", [response.data.identity.username])); setNewAccount({ firstName: '', surname: '' }); await load(); }
    catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The Postulante could not be created."), hubMessage("The Postulante could not be created."))); }
    finally { setBusy(false); }
  };

  const edit = (account) => {
    setNotice('');setEditingAccount({id:account.id,displayName:account.displayName,firstName:account.firstName||'',surname:account.surname||''});
  };
  const saveAccount = async (event) => {
    event.preventDefault();setBusy(true);setNotice('');
    try { await updateHubPostulante(editingAccount.id, { firstName:editingAccount.firstName.trim(), surname:editingAccount.surname.trim() }); await load();setEditingAccount(null);setNotice(hubMessage("Postulante updated.")); }
    catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The Postulante could not be updated."), hubMessage("The Postulante could not be updated."))); }
    finally { setBusy(false); }
  };

  const deactivate = async (account) => {
    if (!window.confirm(`Deactivate ${account.displayName}?`)) return;
    setBusy(true);
    try { await deactivateHubPostulante(account.id); setNotice(hubMessage("Postulante deactivated.")); await load(); }
    catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The Postulante could not be deactivated."), hubMessage("The Postulante could not be deactivated."))); }
    finally { setBusy(false); }
  };

  const assignCourse = async (account) => {
    const courseId = courseSelections[account.id] || courses[0]?.id;
    if (!courseId) { setNotice(hubMessage("No course is available to assign.")); return; }
    setBusy(true); setNotice('');
    try { await assignHubCourse(account.id, courseId); setNotice(hubMessage("Course assigned to {0}.", [account.displayName])); }
    catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The course could not be assigned."), hubMessage("The course could not be assigned."))); }
    finally { setBusy(false); }
  };

  const saveSettings = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const response = await updateHubAssessmentSettings({
        durationMinutes: Number(settings.duration_minutes), minimumOperations: Number(settings.minimum_operations), maximumOperations: Number(settings.maximum_operations),
        operationTypes: settings.operation_types, advancedEnabled: settings.advanced_enabled,
      });
      setSettings(response.data.settings); setNotice(hubMessage("Assessment settings saved. New attempts will use this configuration."));
    } catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("Assessment settings could not be saved."), hubMessage("Assessment settings could not be saved."))); }
    finally { setBusy(false); }
  };

  const changeEvaluation = (evaluationId, patch) => setEvaluationPolicies((current) => ({
    ...current,
    evaluations: current.evaluations.map((evaluation) => evaluation.id === evaluationId ? { ...evaluation, ...patch } : evaluation),
  }));

  const saveEvaluation = async (evaluation) => {
    setBusy(true); setNotice('');
    try {
      const response = await updateHubScoredEvaluationPolicy(evaluation.id, {
        expectedRevision: Number(evaluation.revision),
        durationMinutes: Number(evaluation.duration_minutes),
        theoryWeight: Number(evaluation.theory_weight),
        practicalWeight: Number(evaluation.practical_weight),
        includeAllVerifiedFamilies: evaluation.game_family_selection_mode === 'all_verified',
        gameFamilyKeys: evaluation.selected_game_family_keys,
        historyReviewDays: Number(evaluation.history_review_days),
        historyRecordLimit: evaluation.history_record_limit === null || evaluation.history_record_limit === '' ? null : Number(evaluation.history_record_limit),
      });
      changeEvaluation(evaluation.id, response.data.evaluation);
      setNotice(hubMessage("{0} settings saved. New attempts will retain this revision.", [hubText(evaluation.title)]));
    } catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The scored evaluation settings could not be saved."), hubMessage("The scored evaluation settings could not be saved."))); }
    finally { setBusy(false); }
  };

  const toggleEvaluationFamily = (evaluation, familyKey) => {
    const selected = evaluation.selected_game_family_keys || [];
    changeEvaluation(evaluation.id, {
      game_family_selection_mode: 'selected_verified',
      selected_game_family_keys: selected.includes(familyKey) ? selected.filter((item) => item !== familyKey) : [...selected, familyKey],
    });
  };

  const latestAttemptSet = (evaluationId, identityId) => (evaluationPolicies.attemptSets || [])
    .filter((set) => set.evaluation_id === evaluationId && set.identity_id === identityId)
    .sort((a, b) => b.set_number - a.set_number)[0];

  const reopenEvaluation = async (evaluation, account) => {
    const reason = window.prompt(`Reason for reopening ${evaluation.title} for ${account.displayName}`);
    if (!reason?.trim()) return;
    if (reason.trim().length > 500) { setNotice(hubMessage("The reopening reason must be 500 characters or fewer.")); return; }
    setBusy(true); setNotice('');
    try {
      await reopenHubScoredEvaluation(evaluation.id, account.id, reason.trim());
      setNotice(hubMessage("{0} reopened for {1} with three new attempts.", [hubText(evaluation.title), account.displayName]));
      await load();
    } catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The scored evaluation could not be reopened."), hubMessage("The scored evaluation could not be reopened."))); }
    finally { setBusy(false); }
  };

  const toggleType = (type) => setSettings((current) => ({ ...current, operation_types: current.operation_types.includes(type) ? current.operation_types.filter((item) => item !== type) : [...current.operation_types, type] }));
  const updateFilter = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));
  const fetchReport = async (values) => {
    setBusy(true); setNotice('');
    try { setReport((await getHubAssessmentReport(values)).data); }
    catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The report could not be loaded. Please try again."), hubMessage("The report could not be loaded. Please try again."))); }
    finally { setBusy(false); }
  };
  const applyFilters = async (event) => { event.preventDefault(); await fetchReport(filters); };
  const exportCsv=async()=>{
    setBusy(true);setNotice('');try{
      const response=await getHubAssessmentCsv(report.filters||filters);const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download='training-assessment-report.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setNotice(hubMessage("The filtered report could not be exported. Please retry."));}finally{setBusy(false);}
  };
  const visibleAccounts = accounts.filter((account) =>
    (!accountStatus || account.status === accountStatus) &&
    `${account.displayName} ${account.username}`.toLowerCase().includes(accountSearch.trim().toLowerCase())
  );
  const stats = report.statistics || {};
  const evaluationById = new Map((evaluationPolicies.evaluations || []).map((evaluation) => [evaluation.id, evaluation]));
  const setById = new Map((evaluationPolicies.attemptSets || []).map((set) => [set.id, set]));
  const evidenceByAttempt = new Map();
  for (const item of evaluationPolicies.itemResults || []) {
    const existing = evidenceByAttempt.get(item.attempt_id) || [];
    existing.push(item);
    evidenceByAttempt.set(item.attempt_id, existing);
  }
  const failureText = (failures) => Array.isArray(failures) && failures.length > 0 ? failures.join('; ') : '—';

  return <div className="hub-assessment-admin">
    <header className="hub-workspace-header">
      <div><p className="hub-eyebrow">{t("Training administration")}</p><h2>{t("Trainer workspace")}</h2><p>{t("Manage people, configure evaluations, and review results in one place.")}</p></div>
      <div className="hub-workspace-summary"><strong>{accounts.filter((account) => account.status === 'active').length}</strong><span>{t("Active Postulantes")}</span></div>
    </header>
    <nav className="hub-workspace-nav" aria-label={t("Training administration")}>
      {[
        ['people', 'Postulantes', 'Accounts & course assignments'],
        ['evaluations', 'Evaluations', 'Rules & attempt reopening'],
        ['reports', 'Reports', 'Results & performance'],
      ].map(([id, label, description]) => <button type="button" key={id} aria-pressed={workspace === id} aria-controls={`hub-workspace-${id}`} onClick={() => openWorkspace(id)}><strong>{t(label)}</strong><span>{t(description)}</span></button>)}
    </nav>
    {notice && <p className="hub-page-notice" role="status">{t(notice)}</p>}
    <div id="hub-workspace-people" hidden={workspace !== 'people'}>
    <section className="hub-admin-accounts" aria-labelledby="postulante-management-title">
      <p className="hub-eyebrow">{t("TRAINER / RRHH")}</p><h2 id="postulante-management-title">{t("Postulante management")}</h2>
      <form className="hub-account-form" onSubmit={create}><label>{t("First name")}<input required value={newAccount.firstName} onChange={(event) => setNewAccount((value) => ({ ...value, firstName: event.target.value }))} /></label><label>{t("First surname")}<input required value={newAccount.surname} onChange={(event) => setNewAccount((value) => ({ ...value, surname: event.target.value }))} /></label><button className="hub-primary-button" disabled={busy}>{t("Create Postulante")}</button></form>
      {editingAccount&&<section className="hub-inline-account-editor" aria-labelledby="hub-edit-account-title">
        <h3 id="hub-edit-account-title">{t("Edit ")}{editingAccount.displayName}</h3>
        <p className="hub-readonly-note">{t("Changing a name preserves the login username, assigned courses and training history.")}</p>
        <form className="hub-account-form" onSubmit={saveAccount}>
          <label>{t("Edit first name")}<input ref={editFirstName} required maxLength={120} value={editingAccount.firstName} onChange={event=>setEditingAccount({...editingAccount,firstName:event.target.value})}/></label>
          <label>{t("Edit surname")}<input required maxLength={120} value={editingAccount.surname} onChange={event=>setEditingAccount({...editingAccount,surname:event.target.value})}/></label>
          <button className="hub-primary-button" disabled={busy||!editingAccount.firstName.trim()||!editingAccount.surname.trim()}>{t("Save learner name")}</button>
          <button className="hub-secondary-button" type="button" disabled={busy} onClick={()=>setEditingAccount(null)}>{t("Cancel name edit")}</button>
        </form>
      </section>}
      <div className="hub-directory-toolbar">
        <label>{t("Search Postulantes")}<input type="search" placeholder={t("Name or username")} value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} /></label>
        <label>{t("Account status")}<select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}><option value="active">{t("Active")}</option><option value="">{t("All statuses")}</option><option value="deactivated">{t("Deactivated")}</option></select></label>
        <p>{visibleAccounts.length}{t(" of ")}{accounts.length}{t(" Postulantes")}</p>
      </div>
      <div className="hub-account-table-wrap hub-mobile-directory" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Username")}</th><th>{t("Full name")}</th><th>{t("Status")}</th><th>{t("Course assignment")}</th><th>{t("Actions")}</th></tr></thead><tbody>{visibleAccounts.map((account) => <tr key={account.id}><td data-label={t("Username")}>{account.username}</td><td data-label={t("Full name")}>{account.displayName}</td><td data-label={t("Status")}>{t(account.status)}</td><td data-label={t("Course assignment")} className="hub-directory-actions"><select aria-label={t("Course for {0}", [account.displayName])} value={courseSelections[account.id] || courses[0]?.id || ''} onChange={(event) => setCourseSelections((current) => ({ ...current, [account.id]: event.target.value }))}>{courses.map((course) => <option value={course.id} key={course.id}>{t(course.title)}{course.is_provisional ? t(" (provisional)") : ''}</option>)}</select> <button type="button" onClick={() => assignCourse(account)} disabled={busy || account.status !== 'active' || courses.length === 0}>{t("Assign")}</button></td><td data-label={t("Actions")} className="hub-directory-actions"><button type="button" onClick={() => edit(account)} disabled={busy || account.status !== 'active'}>{t("Edit")}</button> <button type="button" onClick={() => deactivate(account)} disabled={busy || account.status !== 'active'}>{t("Deactivate")}</button></td></tr>)}{visibleAccounts.length === 0 && <tr><td colSpan="5" className="hub-empty-state">{t("No Postulantes match. Try another name or account status.")}</td></tr>}</tbody></table></div>
    </section>

    </div>
    <div id="hub-workspace-evaluations" hidden={workspace !== 'evaluations'}>
    {settings && <section className="hub-admin-accounts" aria-labelledby="assessment-settings-title"><p className="hub-eyebrow">{t("Assessment")}</p><h2 id="assessment-settings-title">{t("Final assessment settings")}</h2><p className="hub-readonly-note">{t("These limits set the total operations in each assessment attempt. Simulator operations per minute are configured in the simulator dashboard.")}</p><form className="hub-account-form" onSubmit={saveSettings}>
      <label>{t("Duration (minutes)")}<input type="number" min="1" disabled={!canEditEvaluations} value={settings.duration_minutes} onChange={(event) => setSettings((value) => ({ ...value, duration_minutes: event.target.value }))} /></label>
      <label>{t("Minimum operations")}<input type="number" min="1" disabled={!canEditEvaluations} value={settings.minimum_operations} onChange={(event) => setSettings((value) => ({ ...value, minimum_operations: event.target.value }))} /></label>
      <label>{t("Maximum operations")}<input type="number" min="1" disabled={!canEditEvaluations} value={settings.maximum_operations} onChange={(event) => setSettings((value) => ({ ...value, maximum_operations: event.target.value }))} /></label>
      <label><input type="checkbox" disabled={!canEditEvaluations} checked={settings.advanced_enabled} onChange={(event) => setSettings((value) => ({ ...value, advanced_enabled: event.target.checked }))} />{t(" Advanced Settings")}</label>
      {settings.advanced_enabled && <fieldset className="hub-checklist" disabled={!canEditEvaluations}><legend>{t("Eligible operation types")}</legend>{OPERATION_TYPES.map((type) => <label key={type}><input type="checkbox" checked={settings.operation_types.includes(type)} onChange={() => toggleType(type)} /><span>{t(type)}</span></label>)}</fieldset>}
      {canEditEvaluations && <button className="hub-primary-button" disabled={busy}>{t("Save settings")}</button>}
    </form><p className="hub-readonly-note">{t("Defaults are 30 minutes and 2–6 randomly generated operations. Configuration revision ")}{settings.revision}{t("; each attempt retains its exact snapshot.")}</p></section>}

    <section className="hub-admin-accounts" aria-labelledby="scored-evaluations-title">
      <p className="hub-eyebrow">{t("Scored evaluations")}</p>
      <h2 id="scored-evaluations-title">{t("Four governed evaluations")}</h2>
      <p className="hub-readonly-note">{t("Every evaluation requires 100%. Each attempt set contains three attempts. POSTULANTE sees numerical scores but not detailed failure evidence; TRAINER and RRHH retain the complete audit history.")}</p>
      <div className="hub-evaluation-policy-grid">
        {(evaluationPolicies.evaluations || []).map((evaluation) => <article className="hub-evaluation-policy-card" key={evaluation.id}>
          <header><div><span>{t("Evaluation ")}{evaluation.position}</span><h3>{t(evaluation.title)}</h3></div><strong>{t(evaluation.publication_status)}{evaluation.is_provisional ? t(" · provisional") : ''}</strong></header>
          <div className="hub-account-form">
            <label>{t("Duration (minutes)")}<input type="number" min="1" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'} value={evaluation.duration_minutes} onChange={(event) => changeEvaluation(evaluation.id, { duration_minutes: event.target.value })} /></label>
            <label>{t("Theory weight (%)")}<input type="number" min="0" max="100" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'} value={evaluation.theory_weight} onChange={(event) => changeEvaluation(evaluation.id, { theory_weight: event.target.value })} /></label>
            <label>{t("Practical weight (%)")}<input type="number" min="0" max="100" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'} value={evaluation.practical_weight} onChange={(event) => changeEvaluation(evaluation.id, { practical_weight: event.target.value })} /></label>
            <label>{t("History window (days)")}<input type="number" min="1" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'} value={evaluation.history_review_days} onChange={(event) => changeEvaluation(evaluation.id, { history_review_days: event.target.value })} /></label>
            <label>{t("Optional recent-record limit")}<input type="number" min="1" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'} value={evaluation.history_record_limit ?? ''} onChange={(event) => changeEvaluation(evaluation.id, { history_record_limit: event.target.value })} placeholder={t("All in window")} /></label>
          </div>
          <p><strong>{t("Attempts:")}</strong>{t(" 3 per set · ")}<strong>{t("Pass:")}</strong> 100% · <strong>{t("Revision:")}</strong> {evaluation.revision}</p>
          <fieldset className="hub-checklist" disabled={!canEditEvaluations || evaluation.publication_status !== 'draft'}>
            <legend>{t("Verified game families")}</legend>
            <label><input type="checkbox" checked={evaluation.game_family_selection_mode === 'all_verified'} onChange={(event) => changeEvaluation(evaluation.id, { game_family_selection_mode: event.target.checked ? 'all_verified' : 'selected_verified' })} /><span>{t("Use every verified family by default")}</span></label>
            {(evaluationPolicies.gameFamilies || []).map((family) => <label key={family.stable_key}><input type="checkbox" disabled={!canEditEvaluations || family.adapter_status !== 'verified' || evaluation.game_family_selection_mode === 'all_verified'} checked={(evaluation.selected_game_family_keys || []).includes(family.stable_key)} onChange={() => toggleEvaluationFamily(evaluation, family.stable_key)} /><span>{family.display_name} · {t(family.adapter_status)}</span></label>)}
          </fieldset>
          {evaluation.required_action_codes?.length > 0 && <div><strong>{t("Mandatory fixed sequence")}</strong><ol>{evaluation.required_action_codes.map((action) => <li key={action}>{action.replaceAll('_', ' ')}</li>)}</ol><p>{t("Transaction Records defaults to all available movements in the previous seven days; TRAINER may change the history window or recent-record limit.")}</p></div>}
          {canEditEvaluations && evaluation.publication_status === 'draft' && <button type="button" className="hub-primary-button" disabled={busy} onClick={() => saveEvaluation(evaluation)}>{t("Save draft settings")}</button>}
          {canEditEvaluations&&<HubEvaluationPolicyEditor evaluation={evaluation} onPublished={published=>changeEvaluation(evaluation.id,published)}/>}
        </article>)}
      </div>
      <HubQuestionBank canEdit={canEditEvaluations}/>
      {(evaluationPolicies.attempts||[]).length>0&&<details><summary>{t("Private recorded assessment actions")}</summary>{evaluationPolicies.attempts.map(attempt=><HubFormalEvidence key={attempt.id} attempt={attempt} label={evaluationById.get(attempt.evaluation_id)?.title||t("Assessment")}/>)}</details>}
      <h3>{t("Attempt-set reopening")}</h3>
      <div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Postulante")}</th><th>{t("Evaluation")}</th><th>{t("Latest set")}</th><th>{t("Status")}</th><th>{t("Action")}</th></tr></thead><tbody>{accounts.flatMap((account) => (evaluationPolicies.evaluations || []).map((evaluation) => {
        const set = latestAttemptSet(evaluation.id, account.id);
        return <tr key={`${account.id}-${evaluation.id}`}><td>{account.displayName}</td><td>{t(evaluation.title)}</td><td>{set?.set_number || '—'}</td><td>{set?.status || t("not started")}</td><td>{canEditEvaluations && set?.status === 'closed' ? <button type="button" disabled={busy} onClick={() => reopenEvaluation(evaluation, account)}>{t("Reopen with reason")}</button> : '—'}</td></tr>;
      }))}</tbody></table></div>
      {(evaluationPolicies.attempts || []).length > 0 && <details><summary>{t("Private TRAINER / RRHH scored-attempt evidence")}</summary><div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("Postulante")}</th><th>{t("Evaluation")}</th><th>{t("Attempt")}</th><th>{t("Score")}</th><th>{t("Item")}</th><th>{t("Game family")}</th><th>{t("Result")}</th><th>{t("Detailed failure")}</th></tr></thead><tbody>{(evaluationPolicies.attempts || []).flatMap((attempt) => {
        const attemptSet = setById.get(attempt.attempt_set_id);
        const evidence = [...(evidenceByAttempt.get(attempt.id) || [])].sort((a, b) => (a.section.localeCompare(b.section) || (a.sequence_number || 0) - (b.sequence_number || 0)));
        const postulante = attemptSet?.postulante;
        if (evidence.length === 0) return <tr key={attempt.id}><td>{postulante?.display_name || postulante?.username || attempt.identity_id}</td><td>{t(evaluationById.get(attempt.evaluation_id)?.title || attempt.evaluation_id)}</td><td>{attempt.attempt_in_set}</td><td>{attempt.score ?? '—'}</td><td colSpan="4">{t("No item evidence recorded")}{attempt.completion_reason === 'timed_out' ? t(" (timed out)") : ''}.</td></tr>;
        return evidence.map((item) => <tr key={item.id}><td>{postulante?.display_name || postulante?.username || attempt.identity_id}</td><td>{t(evaluationById.get(attempt.evaluation_id)?.title || attempt.evaluation_id)}</td><td>{attempt.attempt_in_set}</td><td>{attempt.score ?? '—'}</td><td>{item.section}: {item.item_code.replaceAll('_', ' ')}</td><td>{item.game_family_key || '—'}</td><td>{item.is_correct ? t("Correct") : t("Failed")}</td><td>{failureText(item.failure_points)}</td></tr>);
      })}</tbody></table></div></details>}
      {(evaluationPolicies.reopenEvents || []).length > 0 && <details><summary>{t("Private TRAINER / RRHH reopening audit")}</summary><div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><thead><tr><th>{t("When")}</th><th>{t("Postulante ID")}</th><th>{t("Reopened by")}</th><th>{t("Reason")}</th></tr></thead><tbody>{evaluationPolicies.reopenEvents.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString(locale==='es'?'es-PE':'en-US')}</td><td>{event.identity_id}</td><td>{event.reopenedBy?.display_name || event.reopenedBy?.username}</td><td>{event.reason}</td></tr>)}</tbody></table></div></details>}
    </section>

    </div>
    <div id="hub-workspace-reports" hidden={workspace !== 'reports'}>
    <section className="hub-admin-accounts" aria-labelledby="assessment-report-title"><p className="hub-eyebrow">{t("Reporting")}</p><h2 id="assessment-report-title">{t("Assessment attempts and statistics")}</h2>
      <p className="hub-readonly-note">{t("Legacy and governed assessments share this report. A scored pass and an official submission are shown separately. Daily summary buckets use UTC; displayed timestamps and date filters use your browser time zone.")}</p>
      <button type="button" disabled={busy} onClick={exportCsv}>{t("Export filtered report CSV")}</button>
      {report.truncated&&<p role="status">{t("Showing the 500 most recent attempts in this learner/date window. Narrow the date range to review older results.")}</p>}
      <form className="hub-assessment-filters" onSubmit={applyFilters}>
        <label>{t("Postulante")}<select value={filters.postulanteId} onChange={updateFilter('postulanteId')}><option value="">{t("All")}</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName}</option>)}</select></label>
        <label>{t("From")}<input type="date" value={filters.from} onChange={updateFilter('from')} /></label><label>{t("To")}<input type="date" value={filters.to} onChange={updateFilter('to')} /></label>
        <label>{t("Status")}<select value={filters.status} onChange={updateFilter('status')}><option value="">{t("All")}</option>{['in_progress','passed','unsuccessful','timed_out','abandoned'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label>{t("Result")}<select value={filters.result} onChange={updateFilter('result')}><option value="">{t("All")}</option><option value="passed">{t("Passed")}</option><option value="unsuccessful">{t("Unsuccessful")}</option></select></label>
        <details className="hub-advanced-filters"><summary>{t("More filters")}</summary><div className="hub-assessment-filters"><label>{t("Operation")}<select value={filters.operationType} onChange={updateFilter('operationType')}><option value="">{t("All")}</option>{OPERATION_TYPES.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label>{t("Category")}<select value={filters.category} onChange={updateFilter('category')}><option value="">{t("All")}</option><option value="movement">{t("Movement")}</option><option value="request">{t("Request")}</option></select></label>
        <label>{t("Game")}<input value={filters.game} onChange={updateFilter('game')} /></label><label>{t("Failure")}<input value={filters.failure} onChange={updateFilter('failure')} /></label>
        <label>{t("Minimum score")}<input type="number" min="0" max="100" value={filters.scoreMin} onChange={updateFilter('scoreMin')} /></label><label>{t("Maximum score")}<input type="number" min="0" max="100" value={filters.scoreMax} onChange={updateFilter('scoreMax')} /></label>
        <label>{t("Minimum minutes")}<input type="number" min="0" value={filters.durationMin} onChange={updateFilter('durationMin')} /></label><label>{t("Maximum minutes")}<input type="number" min="0" value={filters.durationMax} onChange={updateFilter('durationMax')} /></label>
        <label>{t("Configuration revision")}<input type="number" min="1" value={filters.settingsRevision} onChange={updateFilter('settingsRevision')} /></label>
        </div></details><div className="hub-filter-actions"><button className="hub-primary-button" disabled={busy}>{busy ? t("Loading…") : t("Apply filters")}</button><button type="button" disabled={busy} className="hub-secondary-button" onClick={() => { setFilters(emptyFilters); void fetchReport(emptyFilters); }}>{t("Clear filters")}</button></div>
      </form>
      <div className="hub-assessment-stats">{[['Attempts',stats.attempts],['Postulantes',stats.uniquePostulantes],['Pass rate',`${stats.passRate || 0}%`],['First-attempt pass',`${stats.firstAttemptPassRate || 0}%`],['Average score',stats.averageScore ?? '—'],['Best score',stats.bestScore ?? '—'],['Latest score',stats.latestScore ?? '—'],['Average attempts to pass',stats.averageAttemptsToPass ?? '—'],['Average minutes',stats.averageDurationMinutes ?? '—'],['Timed out',stats.timedOut || 0],['Abandoned',stats.abandoned || 0],['Module ready',stats.moduleReadyPostulantes || 0]].map(([label,value]) => <div key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}</div>
      <HubAttemptHistory attempts={report.attempts || []} />
      <HubReportBreakdown statistics={stats} />
    </section>
    </div>
  </div>;
}
