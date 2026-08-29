import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getMyHubScoredEvaluations,
  startHubScoredEvaluationAttempt,
  submitHubScoredEvaluationAttempt,
} from '../../api/client';

const attemptLabel = (attempt) => {
  if (attempt.status === 'in_progress') return 'In progress';
  if (attempt.completion_reason === 'timed_out') return `Timed out · ${attempt.score ?? 0}%`;
  if (attempt.status === 'submitted') return `Submitted · ${attempt.score}%`;
  if (attempt.status === 'scored') return `${attempt.result_status === 'successful' ? 'Successful' : 'Unsuccessful'} · ${attempt.score}%`;
  return attempt.status.replaceAll('_', ' ');
};

export default function HubScoredEvaluationOverview() {
  const [evaluations, setEvaluations] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const startKeys = useRef(new Map());

  const load = useCallback(async () => {
    const response = await getMyHubScoredEvaluations();
    setEvaluations(response.data.evaluations || []);
  }, []);

  useEffect(() => {
    let active = true;
    getMyHubScoredEvaluations()
      .then((response) => { if (active) setEvaluations(response.data.evaluations || []); })
      .catch(() => { if (active) setNotice('Scored evaluation status could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const start = async (evaluation) => {
    setBusy(true); setNotice('');
    try {
      const idempotencyKey = startKeys.current.get(evaluation.id) || crypto.randomUUID();
      startKeys.current.set(evaluation.id, idempotencyKey);
      await startHubScoredEvaluationAttempt(evaluation.id, idempotencyKey);
      startKeys.current.delete(evaluation.id);
      setNotice(`${evaluation.title} attempt started.`);
      await load();
    } catch (error) { setNotice(error?.response?.data?.error?.message || 'The scored attempt could not be started.'); }
    finally { setBusy(false); }
  };

  const submit = async (evaluation) => {
    const latest = evaluation.attempts?.[0];
    if (!latest || !window.confirm(`Send the ${latest.score}% result? This closes the evaluation and forfeits unused attempts.`)) return;
    setBusy(true); setNotice('');
    try {
      await submitHubScoredEvaluationAttempt(latest.id);
      setNotice(`${evaluation.title} result submitted.`);
      await load();
    } catch (error) { setNotice(error?.response?.data?.error?.message || 'The result could not be submitted.'); }
    finally { setBusy(false); }
  };

  return <section className="hub-scored-evaluations" aria-labelledby="postulante-evaluations-title">
    <p className="hub-eyebrow">Scored evaluations</p>
    <h2 id="postulante-evaluations-title">Checkpoint and readiness results</h2>
    <p>Each evaluation allows three attempts. You may send the latest numerical result after any completed attempt; attempt three is submitted automatically. Detailed failure evidence is available only to TRAINER and RRHH.</p>
    <div className="hub-evaluation-policy-grid">{evaluations.map((evaluation) => {
      const available = evaluation.publication_status === 'published' && !evaluation.is_provisional;
      const latest = evaluation.attempts?.[0];
      return <article className="hub-evaluation-policy-card" key={evaluation.id}>
        <header><div><span>Evaluation {evaluation.position}</span><h3>{evaluation.title}</h3></div><strong>{available ? 'Available' : 'Not yet published'}</strong></header>
        <p><strong>Score:</strong> {latest?.score ?? '—'} · <strong>Attempts remaining:</strong> {evaluation.attemptsRemaining} of 3</p>
        {available
          ? <p><strong>Weighting:</strong> {evaluation.theory_weight}% theory / {evaluation.practical_weight}% practical · <strong>Required:</strong> 100%</p>
          : <p>The evaluation policy and rubric remain hidden until TRAINER publishes this evaluation.</p>}
        {evaluation.attempts?.length > 0 && <ol className="hub-attempt-summary">{[...evaluation.attempts].sort((a, b) => a.attempt_in_set - b.attempt_in_set).map((attempt) => <li key={attempt.id}>Attempt {attempt.attempt_in_set}: {attemptLabel(attempt)}</li>)}</ol>}
        {evaluation.canSubmit && <button className="hub-primary-button" type="button" disabled={busy} onClick={() => submit(evaluation)}>Send latest result</button>}
        {!evaluation.canSubmit && available && evaluation.attemptSet?.status !== 'closed' && !latest?.status?.includes('in_progress') && <button className="hub-primary-button" type="button" disabled={busy || evaluation.attemptsRemaining === 0} onClick={() => start(evaluation)}>Start next attempt</button>}
        {evaluation.requiresTrainerReopen && <p className="hub-inline-notice" role="status">This evaluation is closed. TRAINER must reopen it before another set of three attempts is available.</p>}
      </article>;
    })}</div>
    {notice && <p className="hub-page-notice" role="status">{notice}</p>}
  </section>;
}
