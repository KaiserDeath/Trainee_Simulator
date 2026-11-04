import {useHubLocale} from '../../i18n/HubLocaleContext';
import { useState } from 'react';
import HubFormalEvidence from './HubFormalEvidence';

const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const date = (value,locale) => timestamp(value) ? new Date(value).toLocaleString(locale==='es'?'es-PE':'en-US') : 'Not recorded';
const score = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? `${Number(value)}%` : 'Not scored';
const label = (value) => String(value || 'Unknown').replaceAll('_', ' ');

function elapsed(attempt) {
  if (!attempt.completed_at) return attempt.status === 'in_progress' ? 'In progress' : 'Not recorded';
  const duration = timestamp(attempt.completed_at) - timestamp(attempt.started_at);
  if (!timestamp(attempt.started_at) || duration < 0) return 'Not recorded';
  const seconds = Math.round(duration / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function HubAttemptHistory({ attempts = [] }) {
  const {t,locale} = useHubLocale();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const groups = new Map();
  for (const attempt of attempts) {
    // A display name is never an identity key. Unknown identities stay separate.
    const key = attempt.identity_id || attempt.postulante?.id || attempt.id;
    if (!groups.has(key)) groups.set(key, { id: key, person: attempt.postulante || {}, attempts: [] });
    groups.get(key).attempts.push(attempt);
  }
  const people = [...groups.values()].map((group) => ({ ...group, attempts: [...group.attempts].sort((a, b) => timestamp(b.started_at) - timestamp(a.started_at)) }))
    .filter((group) => `${group.person.display_name || ''} ${group.person.username || ''} ${group.id}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === 'name'
      ? (a.person.display_name || a.id).localeCompare(b.person.display_name || b.id)
      : timestamp(b.attempts[0].started_at) - timestamp(a.attempts[0].started_at));

  return <section className="hub-attempt-history" aria-labelledby="hub-attempt-history-title">
    <h3 id="hub-attempt-history-title">{t("History by Postulante")}</h3>
    <p className="hub-readonly-note">{t("Histories reflect the applied report filters and include up to the 500 most recent attempts returned by the server. Expand a person, then an attempt to review its evidence. Dates use your browser’s time zone.")}</p>
    <div className="hub-directory-toolbar">
      <label>{t("Find a report")}<input type="search" placeholder={t("Name, username, or account ID")} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>{t("Order histories")}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">{t("Most recent activity")}</option><option value="name">{t("Name A–Z")}</option></select></label>
      <p>{people.length}{t(" Postulantes")}</p>
    </div>
    {!people.length && <p className="hub-empty-state">{t("No attempt histories match. Clear the report filters or try another name.")}</p>}
    {people.map((group) => {
      const latest = group.attempts[0];
      const scored = group.attempts.filter((attempt) => attempt.status !== 'in_progress' && score(attempt.score) !== 'Not scored');
      const best = scored.length ? Math.max(...scored.map((attempt) => Number(attempt.score))) : null;
      return <details key={group.id} className="hub-person-history">
        <summary><span><strong>{group.person.display_name || group.person.username || t("Unknown Postulante")}</strong><small>{group.person.username || group.id}{t(" · View attempts")}</small></span><span className="hub-history-overview"><span>{group.attempts.length} {group.attempts.length === 1 ? t("attempt") : t("attempts")}</span><span>{t("Latest: ")}{score(latest.score)}</span><span>{t("Best: ")}{score(best)}</span><span>{label(latest.status)}</span></span></summary>
        <p className="hub-history-meta">{t("Last started: ")}{date(latest.started_at,locale)} · {group.attempts.filter((attempt) => attempt.status === 'passed').length}{t(" passed · Account ID: ")}{group.id}</p>
        <div className="hub-account-table-wrap" tabIndex={0} role="region" aria-label={t("Table data")}><table className="hub-trainer-table"><caption>{t("Attempts, newest first")}</caption><thead><tr><th>{t("Attempt")}</th><th>{t("Started")}</th><th>{t("Duration")}</th><th>{t("Status")}</th><th>{t("Score")}</th><th>{t("Details")}</th></tr></thead><tbody>
          {group.attempts.map((attempt) => <tr key={`${attempt.source||'legacy'}:${attempt.id}`}><th scope="row" data-label={t("Attempt")}>#{attempt.attempt_number ?? '—'}{attempt.evaluationTitle&&<small>{t(attempt.evaluationTitle)}</small>}</th><td data-label={t("Started")}>{date(attempt.started_at,locale)}</td><td data-label={t("Duration")}>{t(elapsed(attempt))}</td><td data-label={t("Status")}>{t(label(attempt.status))}{attempt.source==='governed_evaluation'&&<small>{attempt.officialSubmitted?t("Officially submitted"):t("Not yet submitted")}</small>}</td><td data-label={t("Score")}>{t(score(attempt.score))}</td><td data-label={t("Evidence")}><details className="hub-attempt-evidence"><summary>{t("Review attempt ")}{attempt.attempt_number ?? ''}</summary>
            <dl className="hub-history-fields"><div><dt>{t("Attempt ID")}</dt><dd>{attempt.id}</dd></div><div><dt>{t("Completed")}</dt><dd>{attempt.completed_at ? date(attempt.completed_at,locale) : t("Not completed")}</dd></div><div><dt>{t("Configuration revision")}</dt><dd>{attempt.settings_snapshot?.revision ?? t("Not recorded")}</dd></div><div><dt>{t("Linked simulator session")}</dt><dd>{attempt.legacy_trainee_session_id || t("No linked session")}</dd></div></dl>
            {(attempt.operationResults || []).length ? <ul className="hub-history-results">{attempt.operationResults.map((result, index) => <li key={result.id || index}><strong>{result.operation_type} · {result.game || t("Game not recorded")}</strong><span>{result.is_correct === true ? t("Correct") : result.is_correct === false ? t("Incorrect") : t("Not graded")} · {label(result.status)}</span>{result.failure_points?.length > 0 && <ul>{result.failure_points.map((failure, i) => <li key={i}>{String(failure)}</li>)}</ul>}</li>)}</ul> : <p>{t("No operation evidence recorded for this attempt.")}</p>}
            {attempt.source==='governed_evaluation'&&<HubFormalEvidence attempt={attempt} label={attempt.evaluationTitle||t("Formal assessment")}/>}
          </details></td></tr>)}
        </tbody></table></div>
      </details>;
    })}
  </section>;
}
