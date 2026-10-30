import { useState } from 'react';

const timestamp = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const date = (value) => timestamp(value) ? new Date(value).toLocaleString() : 'Not recorded';
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
    <h3 id="hub-attempt-history-title">History by Postulante</h3>
    <p className="hub-readonly-note">Histories reflect the applied report filters and include up to the 500 most recent attempts returned by the server. Expand a person, then an attempt to review its evidence. Dates use your browser’s time zone.</p>
    <div className="hub-directory-toolbar">
      <label>Find a report<input type="search" placeholder="Name, username, or account ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Order histories<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Most recent activity</option><option value="name">Name A–Z</option></select></label>
      <p>{people.length} Postulantes</p>
    </div>
    {!people.length && <p className="hub-empty-state">No attempt histories match. Clear the report filters or try another name.</p>}
    {people.map((group) => {
      const latest = group.attempts[0];
      const scored = group.attempts.filter((attempt) => attempt.status !== 'in_progress' && score(attempt.score) !== 'Not scored');
      const best = scored.length ? Math.max(...scored.map((attempt) => Number(attempt.score))) : null;
      return <details key={group.id} className="hub-person-history">
        <summary><span><strong>{group.person.display_name || group.person.username || 'Unknown Postulante'}</strong><small>{group.person.username || group.id} · View attempts</small></span><span className="hub-history-overview"><span>{group.attempts.length} {group.attempts.length === 1 ? 'attempt' : 'attempts'}</span><span>Latest: {score(latest.score)}</span><span>Best: {score(best)}</span><span>{label(latest.status)}</span></span></summary>
        <p className="hub-history-meta">Last started: {date(latest.started_at)} · {group.attempts.filter((attempt) => attempt.status === 'passed').length} passed · Account ID: {group.id}</p>
        <div className="hub-account-table-wrap"><table className="hub-trainer-table"><caption>Attempts, newest first</caption><thead><tr><th>Attempt</th><th>Started</th><th>Duration</th><th>Status</th><th>Score</th><th>Details</th></tr></thead><tbody>
          {group.attempts.map((attempt) => <tr key={attempt.id}><th scope="row" data-label="Attempt">#{attempt.attempt_number ?? '—'}</th><td data-label="Started">{date(attempt.started_at)}</td><td data-label="Duration">{elapsed(attempt)}</td><td data-label="Status">{label(attempt.status)}</td><td data-label="Score">{score(attempt.score)}</td><td data-label="Evidence"><details className="hub-attempt-evidence"><summary>Review attempt {attempt.attempt_number ?? ''}</summary>
            <dl className="hub-history-fields"><div><dt>Attempt ID</dt><dd>{attempt.id}</dd></div><div><dt>Completed</dt><dd>{attempt.completed_at ? date(attempt.completed_at) : 'Not completed'}</dd></div><div><dt>Configuration revision</dt><dd>{attempt.settings_snapshot?.revision ?? 'Not recorded'}</dd></div><div><dt>Linked simulator session</dt><dd>{attempt.legacy_trainee_session_id || 'No linked session'}</dd></div></dl>
            {(attempt.operationResults || []).length ? <ul className="hub-history-results">{attempt.operationResults.map((result, index) => <li key={result.id || index}><strong>{result.operation_type} · {result.game || 'Game not recorded'}</strong><span>{result.is_correct === true ? 'Correct' : result.is_correct === false ? 'Incorrect' : 'Not graded'} · {label(result.status)}</span>{result.failure_points?.length > 0 && <ul>{result.failure_points.map((failure, i) => <li key={i}>{String(failure)}</li>)}</ul>}</li>)}</ul> : <p>No operation evidence recorded for this attempt.</p>}
          </details></td></tr>)}
        </tbody></table></div>
      </details>;
    })}
  </section>;
}
