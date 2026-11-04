import {hubText} from '../../i18n/hubLocale';
import {hubServerMessage} from '../../i18n/hubLocale';
import {hubMessage} from '../../i18n/hubLocale';
import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getMyHubScoredEvaluations,
  startHubScoredEvaluationAttempt,
  submitHubScoredEvaluationAttempt,
} from '../../api/client';
import HubEvaluationRuntime from './HubEvaluationRuntime';

const attemptLabel = (attempt,t) => {
  if (attempt.status === 'in_progress') return t('In progress');
  if (attempt.completion_reason === 'timed_out') return `${t('Timed out')} · ${attempt.score ?? 0}%`;
  if (attempt.status === 'submitted') return `${t('Submitted')} · ${attempt.score}%`;
  if (attempt.status === 'scored') return `${t(attempt.result_status==='successful'?'Successful':'Unsuccessful')} · ${attempt.score}%`;
  return t(attempt.status);
};

export default function HubScoredEvaluationOverview({onActiveChange}) {
  const {t} = useHubLocale();
  const [evaluations, setEvaluations] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const startKeys = useRef(new Map());
  const [activeAttemptId,setActiveAttemptId]=useState(null);
  useEffect(()=>{onActiveChange?.(Boolean(activeAttemptId));},[activeAttemptId,onActiveChange]);

  const load = useCallback(async () => {
    const response = await getMyHubScoredEvaluations();
    setEvaluations(response.data.evaluations || []);
  }, []);

  useEffect(() => {
    let active = true;
    getMyHubScoredEvaluations()
      .then((response) => { if (active) setEvaluations(response.data.evaluations || []); })
      .catch(() => { if (active) setNotice(hubMessage("Scored evaluation status could not be loaded.")); });
    return () => { active = false; };
  }, []);

  const start = async (evaluation) => {
    setBusy(true); setNotice('');
    try {
      const idempotencyKey = startKeys.current.get(evaluation.id) || crypto.randomUUID();
      startKeys.current.set(evaluation.id, idempotencyKey);
      await startHubScoredEvaluationAttempt(evaluation.id, idempotencyKey);
      startKeys.current.delete(evaluation.id);
      setNotice(hubMessage("{0} attempt started.", [hubText(evaluation.title)]));
      await load();
    } catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The scored attempt could not be started."), hubMessage("The scored attempt could not be started."))); }
    finally { setBusy(false); }
  };

  const submit = async (evaluation) => {
    const latest = evaluation.attempts?.[0];
    if (!latest || !window.confirm(`Send the ${latest.score}% result? This closes the evaluation and forfeits unused attempts.`)) return;
    setBusy(true); setNotice('');
    try {
      await submitHubScoredEvaluationAttempt(latest.id);
      setNotice(hubMessage("{0} result submitted.", [hubText(evaluation.title)]));
      await load();
    } catch (error) { setNotice(hubServerMessage(error?.response?.data?.error?.message || hubMessage("The result could not be submitted."), hubMessage("The result could not be submitted."))); }
    finally { setBusy(false); }
  };

  if(activeAttemptId)return <HubEvaluationRuntime key={activeAttemptId} attemptId={activeAttemptId} onReturn={async()=>{setActiveAttemptId(null);try{await load();}catch{setNotice(hubMessage("Checkpoint results could not be refreshed. Reload to see the recorded result."));}finally{requestAnimationFrame(()=>document.getElementById('postulante-evaluations-title')?.focus());}}}/>;
  return <section className="hub-scored-evaluations" aria-labelledby="postulante-evaluations-title">
    <p className="hub-eyebrow">{t("Scored evaluations")}</p>
    <h2 id="postulante-evaluations-title" tabIndex={-1}>{t("Checkpoint and readiness results")}</h2>
    <p>{t("Each evaluation allows three attempts. You may send the latest numerical result after any completed attempt; attempt three is submitted automatically. Detailed failure evidence is available only to TRAINER and RRHH.")}</p>
    <div className="hub-evaluation-policy-grid">{evaluations.map((evaluation) => {
      const available = evaluation.publication_status === 'published' && !evaluation.is_provisional;
      const latest = evaluation.attempts?.[0];
      return <article className="hub-evaluation-policy-card" key={evaluation.id}>
        <header><div><span>{t("Evaluation ")}{evaluation.position}</span><h3>{t(evaluation.title)}</h3></div><strong>{available ? t("Available") : t("Not yet published")}</strong></header>
        <p><strong>{t("Score:")}</strong> {latest?.score ?? '—'} · <strong>{t("Attempts remaining:")}</strong> {evaluation.attemptsRemaining}{t(" of 3")}</p>
        {available
          ? <p><strong>{t("Weighting:")}</strong> {evaluation.theory_weight}{t("% theory / ")}{evaluation.practical_weight}{t("% practical · ")}<strong>{t("Required:")}</strong> 100%</p>
          : <p>{t("The evaluation policy and rubric remain hidden until TRAINER publishes this evaluation.")}</p>}
        {evaluation.attempts?.length > 0 && <ol className="hub-attempt-summary">{[...evaluation.attempts].sort((a, b) => a.attempt_in_set - b.attempt_in_set).map((attempt) => <li key={attempt.id}>{t("Attempt ")}{attempt.attempt_in_set}: {attemptLabel(attempt,t)}</li>)}</ol>}
        {evaluation.canSubmit && <button className="hub-primary-button" type="button" disabled={busy} onClick={() => submit(evaluation)}>{t("Send latest result")}</button>}
        {latest?.status==='in_progress'&&<button className="hub-primary-button" type="button" disabled={busy} onClick={()=>setActiveAttemptId(latest.id)}>{t("Open assessment")}</button>}
        {available && evaluation.attemptSet?.status !== 'closed' && !latest?.status?.includes('in_progress') && <button className="hub-primary-button" type="button" disabled={busy || evaluation.attemptsRemaining === 0} onClick={() => start(evaluation)}>{t("Start next attempt")}</button>}
        {evaluation.requiresTrainerReopen && <p className="hub-inline-notice" role="status">{t("This evaluation is closed. TRAINER must reopen it before another set of three attempts is available.")}</p>}
      </article>;
    })}</div>
    {notice && <p className="hub-page-notice" role="status">{t(notice)}</p>}
  </section>;
}
