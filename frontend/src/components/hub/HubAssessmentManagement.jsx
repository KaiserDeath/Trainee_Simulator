import { useCallback, useEffect, useState } from 'react';

import {
  assignHubCourse,
  createHubPostulante,
  deactivateHubPostulante,
  getHubAssignableCourses,
  getHubAssessmentReport,
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
  const [accounts, setAccounts] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseSelections, setCourseSelections] = useState({});
  const [settings, setSettings] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [report, setReport] = useState({ attempts: [], statistics: {} });
  const [evaluationPolicies, setEvaluationPolicies] = useState({ evaluations: [], gameFamilies: [], attemptSets: [], attempts: [], itemResults: [], reopenEvents: [] });
  const [newAccount, setNewAccount] = useState({ firstName: '', surname: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [accountResponse, courseResponse, settingsResponse, reportResponse, policyResponse] = await Promise.all([
      getHubPostulanteAccounts(), getHubAssignableCourses(), getHubAssessmentSettings(), getHubAssessmentReport(filters), getHubScoredEvaluationPolicies(),
    ]);
    setAccounts(accountResponse.data.postulantes || []);
    setCourses(courseResponse.data.courses || []);
    setSettings(settingsResponse.data.settings);
    setReport(reportResponse.data);
    setEvaluationPolicies(policyResponse.data);
  }, [filters]);

  useEffect(() => {
    let active = true;
    Promise.all([getHubPostulanteAccounts(), getHubAssignableCourses(), getHubAssessmentSettings(), getHubAssessmentReport(), getHubScoredEvaluationPolicies()])
      .then(([accountResponse, courseResponse, settingsResponse, reportResponse, policyResponse]) => {
        if (!active) return;
        setAccounts(accountResponse.data.postulantes || []);
        setCourses(courseResponse.data.courses || []);
        setSettings(settingsResponse.data.settings);
        setReport(reportResponse.data);
        setEvaluationPolicies(policyResponse.data);
      })
      .catch(() => { if (active) setNotice('Assessment administration could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const create = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try { const response = await createHubPostulante(newAccount); setNotice(`Postulante created. Username and initial password: ${response.data.identity.username}`); setNewAccount({ firstName: '', surname: '' }); await load(); }
    catch (error) { setNotice(error?.response?.data?.error?.message || 'The Postulante could not be created.'); }
    finally { setBusy(false); }
  };

  const edit = async (account) => {
    const firstName = window.prompt('First name', account.firstName || '');
    if (firstName === null) return;
    const surname = window.prompt('First surname', account.surname || '');
    if (surname === null) return;
    setBusy(true);
    try { await updateHubPostulante(account.id, { firstName, surname }); setNotice('Postulante updated.'); await load(); }
    catch (error) { setNotice(error?.response?.data?.error?.message || 'The Postulante could not be updated.'); }
    finally { setBusy(false); }
  };

  const deactivate = async (account) => {
    if (!window.confirm(`Deactivate ${account.displayName}?`)) return;
    setBusy(true);
    try { await deactivateHubPostulante(account.id); setNotice('Postulante deactivated.'); await load(); }
    catch (error) { setNotice(error?.response?.data?.error?.message || 'The Postulante could not be deactivated.'); }
    finally { setBusy(false); }
  };

  const assignCourse = async (account) => {
    const courseId = courseSelections[account.id] || courses[0]?.id;
    if (!courseId) { setNotice('No course is available to assign.'); return; }
    setBusy(true); setNotice('');
    try { await assignHubCourse(account.id, courseId); setNotice(`Course assigned to ${account.displayName}.`); }
    catch (error) { setNotice(error?.response?.data?.error?.message || 'The course could not be assigned.'); }
    finally { setBusy(false); }
  };

  const saveSettings = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const response = await updateHubAssessmentSettings({
        durationMinutes: Number(settings.duration_minutes), minimumOperations: Number(settings.minimum_operations), maximumOperations: Number(settings.maximum_operations),
        operationTypes: settings.operation_types, advancedEnabled: settings.advanced_enabled,
      });
      setSettings(response.data.settings); setNotice('Assessment settings saved. New attempts will use this configuration.');
    } catch (error) { setNotice(error?.response?.data?.error?.message || 'Assessment settings could not be saved.'); }
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
      setNotice(`${evaluation.title} settings saved. New attempts will retain this revision.`);
    } catch (error) { setNotice(error?.response?.data?.error?.message || 'The scored evaluation settings could not be saved.'); }
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
    if (reason.trim().length > 500) { setNotice('The reopening reason must be 500 characters or fewer.'); return; }
    setBusy(true); setNotice('');
    try {
      await reopenHubScoredEvaluation(evaluation.id, account.id, reason.trim());
      setNotice(`${evaluation.title} reopened for ${account.displayName} with three new attempts.`);
      await load();
    } catch (error) { setNotice(error?.response?.data?.error?.message || 'The scored evaluation could not be reopened.'); }
    finally { setBusy(false); }
  };

  const toggleType = (type) => setSettings((current) => ({ ...current, operation_types: current.operation_types.includes(type) ? current.operation_types.filter((item) => item !== type) : [...current.operation_types, type] }));
  const updateFilter = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));
  const applyFilters = async (event) => { event.preventDefault(); setBusy(true); try { setReport((await getHubAssessmentReport(filters)).data); } finally { setBusy(false); } };
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
    <section className="hub-admin-accounts" aria-labelledby="postulante-management-title">
      <p className="hub-eyebrow">TRAINER / RRHH</p><h2 id="postulante-management-title">Postulante management</h2>
      <form className="hub-account-form" onSubmit={create}><label>First name<input required value={newAccount.firstName} onChange={(event) => setNewAccount((value) => ({ ...value, firstName: event.target.value }))} /></label><label>First surname<input required value={newAccount.surname} onChange={(event) => setNewAccount((value) => ({ ...value, surname: event.target.value }))} /></label><button className="hub-primary-button" disabled={busy}>Create Postulante</button></form>
      <div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Username</th><th>Full name</th><th>Status</th><th>Course assignment</th><th>Actions</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td>{account.username}</td><td>{account.displayName}</td><td>{account.status}</td><td><select aria-label={`Course for ${account.displayName}`} value={courseSelections[account.id] || courses[0]?.id || ''} onChange={(event) => setCourseSelections((current) => ({ ...current, [account.id]: event.target.value }))}>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}{course.is_provisional ? ' (provisional)' : ''}</option>)}</select> <button type="button" onClick={() => assignCourse(account)} disabled={busy || account.status !== 'active' || courses.length === 0}>Assign</button></td><td><button type="button" onClick={() => edit(account)} disabled={busy || account.status !== 'active'}>Edit</button> <button type="button" onClick={() => deactivate(account)} disabled={busy || account.status !== 'active'}>Deactivate</button></td></tr>)}</tbody></table></div>
    </section>

    {settings && <section className="hub-admin-accounts" aria-labelledby="assessment-settings-title"><p className="hub-eyebrow">Assessment</p><h2 id="assessment-settings-title">Final assessment settings</h2><form className="hub-account-form" onSubmit={saveSettings}>
      <label>Duration (minutes)<input type="number" min="1" disabled={!canEditEvaluations} value={settings.duration_minutes} onChange={(event) => setSettings((value) => ({ ...value, duration_minutes: event.target.value }))} /></label>
      <label>Minimum operations<input type="number" min="1" disabled={!canEditEvaluations} value={settings.minimum_operations} onChange={(event) => setSettings((value) => ({ ...value, minimum_operations: event.target.value }))} /></label>
      <label>Maximum operations<input type="number" min="1" disabled={!canEditEvaluations} value={settings.maximum_operations} onChange={(event) => setSettings((value) => ({ ...value, maximum_operations: event.target.value }))} /></label>
      <label><input type="checkbox" disabled={!canEditEvaluations} checked={settings.advanced_enabled} onChange={(event) => setSettings((value) => ({ ...value, advanced_enabled: event.target.checked }))} /> Advanced Settings</label>
      {settings.advanced_enabled && <fieldset className="hub-checklist" disabled={!canEditEvaluations}><legend>Eligible operation types</legend>{OPERATION_TYPES.map((type) => <label key={type}><input type="checkbox" checked={settings.operation_types.includes(type)} onChange={() => toggleType(type)} /><span>{type}</span></label>)}</fieldset>}
      {canEditEvaluations && <button className="hub-primary-button" disabled={busy}>Save settings</button>}
    </form><p className="hub-readonly-note">Defaults are 30 minutes and 2–6 randomly generated operations. Configuration revision {settings.revision}; each attempt retains its exact snapshot.</p></section>}

    <section className="hub-admin-accounts" aria-labelledby="scored-evaluations-title">
      <p className="hub-eyebrow">Scored evaluations</p>
      <h2 id="scored-evaluations-title">Four governed evaluations</h2>
      <p className="hub-readonly-note">Every evaluation requires 100%. Each attempt set contains three attempts. POSTULANTE sees numerical scores but not detailed failure evidence; TRAINER and RRHH retain the complete audit history.</p>
      <div className="hub-evaluation-policy-grid">
        {(evaluationPolicies.evaluations || []).map((evaluation) => <article className="hub-evaluation-policy-card" key={evaluation.id}>
          <header><div><span>Evaluation {evaluation.position}</span><h3>{evaluation.title}</h3></div><strong>{evaluation.publication_status}{evaluation.is_provisional ? ' · provisional' : ''}</strong></header>
          <div className="hub-account-form">
            <label>Duration (minutes)<input type="number" min="1" disabled={!canEditEvaluations} value={evaluation.duration_minutes} onChange={(event) => changeEvaluation(evaluation.id, { duration_minutes: event.target.value })} /></label>
            <label>Theory weight (%)<input type="number" min="0" max="100" disabled={!canEditEvaluations} value={evaluation.theory_weight} onChange={(event) => changeEvaluation(evaluation.id, { theory_weight: event.target.value })} /></label>
            <label>Practical weight (%)<input type="number" min="0" max="100" disabled={!canEditEvaluations} value={evaluation.practical_weight} onChange={(event) => changeEvaluation(evaluation.id, { practical_weight: event.target.value })} /></label>
            <label>History window (days)<input type="number" min="1" disabled={!canEditEvaluations} value={evaluation.history_review_days} onChange={(event) => changeEvaluation(evaluation.id, { history_review_days: event.target.value })} /></label>
            <label>Optional recent-record limit<input type="number" min="1" disabled={!canEditEvaluations} value={evaluation.history_record_limit ?? ''} onChange={(event) => changeEvaluation(evaluation.id, { history_record_limit: event.target.value })} placeholder="All in window" /></label>
          </div>
          <p><strong>Attempts:</strong> 3 per set · <strong>Pass:</strong> 100% · <strong>Revision:</strong> {evaluation.revision}</p>
          <fieldset className="hub-checklist" disabled={!canEditEvaluations}>
            <legend>Verified game families</legend>
            <label><input type="checkbox" checked={evaluation.game_family_selection_mode === 'all_verified'} onChange={(event) => changeEvaluation(evaluation.id, { game_family_selection_mode: event.target.checked ? 'all_verified' : 'selected_verified' })} /><span>Use every verified family by default</span></label>
            {(evaluationPolicies.gameFamilies || []).map((family) => <label key={family.stable_key}><input type="checkbox" disabled={!canEditEvaluations || family.adapter_status !== 'verified' || evaluation.game_family_selection_mode === 'all_verified'} checked={(evaluation.selected_game_family_keys || []).includes(family.stable_key)} onChange={() => toggleEvaluationFamily(evaluation, family.stable_key)} /><span>{family.display_name} · {family.adapter_status}</span></label>)}
          </fieldset>
          {evaluation.required_action_codes?.length > 0 && <div><strong>Mandatory fixed sequence</strong><ol>{evaluation.required_action_codes.map((action) => <li key={action}>{action.replaceAll('_', ' ')}</li>)}</ol><p>Transaction Records defaults to all available movements in the previous seven days; TRAINER may change the history window or recent-record limit.</p></div>}
          {canEditEvaluations && <button type="button" className="hub-primary-button" disabled={busy} onClick={() => saveEvaluation(evaluation)}>Save evaluation settings</button>}
        </article>)}
      </div>
      <h3>Attempt-set reopening</h3>
      <div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Postulante</th><th>Evaluation</th><th>Latest set</th><th>Status</th><th>Action</th></tr></thead><tbody>{accounts.flatMap((account) => (evaluationPolicies.evaluations || []).map((evaluation) => {
        const set = latestAttemptSet(evaluation.id, account.id);
        return <tr key={`${account.id}-${evaluation.id}`}><td>{account.displayName}</td><td>{evaluation.title}</td><td>{set?.set_number || '—'}</td><td>{set?.status || 'not started'}</td><td>{canEditEvaluations && set?.status === 'closed' ? <button type="button" disabled={busy} onClick={() => reopenEvaluation(evaluation, account)}>Reopen with reason</button> : '—'}</td></tr>;
      }))}</tbody></table></div>
      {(evaluationPolicies.attempts || []).length > 0 && <details><summary>Private TRAINER / RRHH scored-attempt evidence</summary><div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Postulante</th><th>Evaluation</th><th>Attempt</th><th>Score</th><th>Item</th><th>Game family</th><th>Result</th><th>Detailed failure</th></tr></thead><tbody>{(evaluationPolicies.attempts || []).flatMap((attempt) => {
        const attemptSet = setById.get(attempt.attempt_set_id);
        const evidence = [...(evidenceByAttempt.get(attempt.id) || [])].sort((a, b) => (a.section.localeCompare(b.section) || (a.sequence_number || 0) - (b.sequence_number || 0)));
        const postulante = attemptSet?.postulante;
        if (evidence.length === 0) return <tr key={attempt.id}><td>{postulante?.display_name || postulante?.username || attempt.identity_id}</td><td>{evaluationById.get(attempt.evaluation_id)?.title || attempt.evaluation_id}</td><td>{attempt.attempt_in_set}</td><td>{attempt.score ?? '—'}</td><td colSpan="4">No item evidence recorded{attempt.completion_reason === 'timed_out' ? ' (timed out)' : ''}.</td></tr>;
        return evidence.map((item) => <tr key={item.id}><td>{postulante?.display_name || postulante?.username || attempt.identity_id}</td><td>{evaluationById.get(attempt.evaluation_id)?.title || attempt.evaluation_id}</td><td>{attempt.attempt_in_set}</td><td>{attempt.score ?? '—'}</td><td>{item.section}: {item.item_code.replaceAll('_', ' ')}</td><td>{item.game_family_key || '—'}</td><td>{item.is_correct ? 'Correct' : 'Failed'}</td><td>{failureText(item.failure_points)}</td></tr>);
      })}</tbody></table></div></details>}
      {(evaluationPolicies.reopenEvents || []).length > 0 && <details><summary>Private TRAINER / RRHH reopening audit</summary><div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>When</th><th>Postulante ID</th><th>Reopened by</th><th>Reason</th></tr></thead><tbody>{evaluationPolicies.reopenEvents.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.identity_id}</td><td>{event.reopenedBy?.display_name || event.reopenedBy?.username}</td><td>{event.reason}</td></tr>)}</tbody></table></div></details>}
    </section>

    <section className="hub-admin-accounts" aria-labelledby="assessment-report-title"><p className="hub-eyebrow">Reporting</p><h2 id="assessment-report-title">Assessment attempts and statistics</h2>
      <form className="hub-assessment-filters" onSubmit={applyFilters}>
        <label>Postulante<select value={filters.postulanteId} onChange={updateFilter('postulanteId')}><option value="">All</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName}</option>)}</select></label>
        <label>From<input type="date" value={filters.from} onChange={updateFilter('from')} /></label><label>To<input type="date" value={filters.to} onChange={updateFilter('to')} /></label>
        <label>Status<select value={filters.status} onChange={updateFilter('status')}><option value="">All</option>{['in_progress','passed','unsuccessful','timed_out','abandoned'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Result<select value={filters.result} onChange={updateFilter('result')}><option value="">All</option><option value="passed">Passed</option><option value="unsuccessful">Unsuccessful</option></select></label>
        <label>Operation<select value={filters.operationType} onChange={updateFilter('operationType')}><option value="">All</option>{OPERATION_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<select value={filters.category} onChange={updateFilter('category')}><option value="">All</option><option value="movement">Movement</option><option value="request">Request</option></select></label>
        <label>Game<input value={filters.game} onChange={updateFilter('game')} /></label><label>Failure<input value={filters.failure} onChange={updateFilter('failure')} /></label>
        <label>Minimum score<input type="number" min="0" max="100" value={filters.scoreMin} onChange={updateFilter('scoreMin')} /></label><label>Maximum score<input type="number" min="0" max="100" value={filters.scoreMax} onChange={updateFilter('scoreMax')} /></label>
        <label>Minimum minutes<input type="number" min="0" value={filters.durationMin} onChange={updateFilter('durationMin')} /></label><label>Maximum minutes<input type="number" min="0" value={filters.durationMax} onChange={updateFilter('durationMax')} /></label>
        <label>Configuration revision<input type="number" min="1" value={filters.settingsRevision} onChange={updateFilter('settingsRevision')} /></label>
        <button className="hub-primary-button" disabled={busy}>Apply filters</button><button type="button" className="hub-secondary-button" onClick={() => setFilters(emptyFilters)}>Clear</button>
      </form>
      <div className="hub-assessment-stats">{[['Attempts',stats.attempts],['Postulantes',stats.uniquePostulantes],['Pass rate',`${stats.passRate || 0}%`],['First-attempt pass',`${stats.firstAttemptPassRate || 0}%`],['Average score',stats.averageScore ?? '—'],['Best score',stats.bestScore ?? '—'],['Latest score',stats.latestScore ?? '—'],['Average attempts to pass',stats.averageAttemptsToPass ?? '—'],['Average minutes',stats.averageDurationMinutes ?? '—'],['Timed out',stats.timedOut || 0],['Abandoned',stats.abandoned || 0],['Module ready',stats.moduleReadyPostulantes || 0]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="hub-account-table-wrap"><table className="hub-trainer-table"><thead><tr><th>Postulante</th><th>Attempt</th><th>Status</th><th>Score</th><th>Started</th></tr></thead><tbody>{(report.attempts || []).map((attempt) => <tr key={attempt.id}><td>{attempt.postulante?.display_name}</td><td>{attempt.attempt_number}</td><td>{attempt.status}</td><td>{attempt.score ?? '—'}</td><td>{new Date(attempt.started_at).toLocaleString()}</td></tr>)}</tbody></table></div>
      <details><summary>Accuracy and failure breakdown</summary><pre>{JSON.stringify({ byOperationType: stats.accuracyByOperationType, byGame: stats.accuracyByGame, byCategory: stats.accuracyByCategory, failures: stats.failureBreakdown }, null, 2)}</pre></details>
      <details><summary>Progress over time</summary><pre>{JSON.stringify(stats.progressOverTime || [], null, 2)}</pre></details>
    </section>
    {notice && <p className="hub-page-notice" role="status">{notice}</p>}
  </div>;
}
