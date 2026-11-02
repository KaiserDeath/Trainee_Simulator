import { useState } from 'react';
import { useSessionReport } from '../../hooks/useSessionReport';
import { StatCard } from './DashboardShared';
import AuditLogPanel from '../audit/AuditLogPanel';
import { duration, explain, requirements, requirementValue, reviewResult, sentResult } from '../../domain/trainerReview';

function LegacyReport({ report }) {
  if (!report) return <div className="text-red-400 mt-8 bg-red-500/10 p-4 rounded-xl border border-red-500/20">Failed to load report data.</div>;

  const performance = report.performance || {};
  const {
    accuracy = 0,
    completedOperations = 0,
    totalOperations = 0
  } = performance;

  const initialOperationsCount = totalOperations;
  const overallScore = Math.round(Number(accuracy) || 0);
  const accValue = Number(accuracy) || 0;

  const getCustomerDisplay = (op) =>
    op.customerName ||
    op.customer_name ||
    op.customer?.first_name ||
    op.customer?.username ||
    'N/A';

  const getMobileIdDisplay = (op) =>
    op.mobileId ||
    op.mobile_id ||
    op.game_account?.game_username ||
    'N/A';

  const getResultLabel = (value) => {
    const normalized = String(value || 'PENDING').toUpperCase();
    if (normalized === 'APPROVED') return 'Approved';
    if (normalized === 'CANCELLED') return 'Cancelled';
    if (normalized === 'PENDING') return 'Pending';
    if (normalized === 'UNKNOWN') return 'Unknown';
    return normalized;
  };

  const getExpectedResult = (op) =>
    op.expectedResult ||
    op.expected_result ||
    'UNKNOWN';

  const getSentResult = (op) =>
    op.sentResult ||
    op.sent_result ||
    op.status ||
    'PENDING';

  const getValidationRequirements = (op) =>
    op.validationRequirements ||
    op.validation_requirements ||
    [];

  const getDisplayedResult = (op) => {
    const sentResult =
      String(getSentResult(op)).toUpperCase();

    if (sentResult === 'PENDING') {
      return 'Pending';
    }

    const requirements =
      getValidationRequirements(op);

    if (requirements.length > 0) {
      return requirements.every((item) => item.ok)
        ? 'Correct'
        : 'Incorrect';
    }

    if (op.is_correct === true) return 'Correct';
    if (op.is_correct === false) return 'Incorrect';

    return 'Pending';
  };

  const getDisplayedResultClass = (result) => {
    if (result === 'Correct') {
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    }
    if (result === 'Incorrect') {
      return 'bg-red-500/10 text-red-300 border-red-500/30';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getResultBadgeClass = (value) => {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'APPROVED') {
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    }
    if (normalized === 'CANCELLED') {
      return 'bg-red-500/10 text-red-300 border-red-500/30';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getOperationPoints = (op) => {
    if (getDisplayedResult(op) === 'Correct') {
      return 1;
    }
    if (getDisplayedResult(op) === 'Incorrect') {
      return 0;
    }
    if (op.is_correct === true) return 1;
    if (op.is_correct === false) return 0;
    return op.score || 0;
  };

  const formatRequirementValue = requirementValue;

  const formatDuration = (seconds) => {
    const value = seconds == null || seconds === '' ? NaN : Number(seconds);

    if (!Number.isFinite(value)) {
      return 'N/A';
    }

    const totalSeconds = Math.max(
      0,
      Math.round(value)
    );
    const minutes = Math.floor(
      totalSeconds / 60
    );
    const remainingSeconds =
      totalSeconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Legacy scoring presentation (unchanged).
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Overall Score" value={overallScore} suffix="/ 100" />
        <StatCard title="Accuracy" value={`${accValue.toFixed(1)}%`} />
        <StatCard title="Processed" value={`${completedOperations} / ${initialOperationsCount}`} />
        <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-center items-center backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="text-sm text-slate-400 mb-2 font-medium">Final Grade</span>
          <span className="text-xl font-bold text-amber-300">Provisional</span>
        </div>
      </div>
      
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <h3 className="font-semibold text-lg">Transaction History Breakdown</h3>
          <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full">
            {report.operations?.length || 0} Records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">Requested</th>
                <th className="px-6 py-4 font-medium">Processed</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Mobile ID</th>
                <th className="px-6 py-4 font-medium text-left">Requirements</th>
                <th className="px-6 py-4 font-medium text-center">Sent Operation</th>
                <th className="px-6 py-4 font-medium text-center">Expected Operation</th>
                <th className="px-6 py-4 font-medium text-right">Handling Time</th>
                <th className="px-6 py-4 font-medium text-center">Result</th>
                <th className="px-6 py-4 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50 bg-slate-900/20">
              {report.operations?.map((op, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {op.created_at ? new Date(op.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {op.processed_at ? new Date(op.processed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-300 font-medium">{op.type}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    <div className="font-medium">{getCustomerDisplay(op)}</div>
                    {op.customerUsername && (
                      <div className="text-xs text-slate-500">{op.customerUsername}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                    {getMobileIdDisplay(op)}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="flex min-w-96 flex-wrap gap-2">
                      {getValidationRequirements(op).map((item, requirementIndex) => (
                        <div
                          key={`${item.label}-${requirementIndex}`}
                          className={`rounded-md border px-2.5 py-1.5 text-xs ${item.ok ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30' : 'bg-red-500/10 text-red-200 border-red-500/30'}`}
                        >
                          <div className="font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] opacity-80">
                            Posted: {formatRequirementValue(item.sent, item.label)}
                          </div>
                          {item.expected !== '' && (
                            <div className="text-[11px] opacity-70">
                              Expected: {formatRequirementValue(item.expected, item.label)}
                            </div>
                          )}
                          {!item.ok && item.label === 'Game amount' && (
                            <div className="mt-1 text-[11px] font-semibold">
                              Amount mismatch
                            </div>
                          )}
                        </div>
                      ))}
                      {getValidationRequirements(op).length === 0 && (
                        <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400">
                          No checks
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getResultBadgeClass(getSentResult(op))}`}>
                      {getResultLabel(getSentResult(op))}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getResultBadgeClass(getExpectedResult(op))}`}>
                      {getResultLabel(getExpectedResult(op))}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-300">
                    {formatDuration(op.handling_time_seconds)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full border text-xs font-semibold ${getDisplayedResultClass(getDisplayedResult(op))}`}>
                      {getDisplayedResult(op)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">
                    <span className={getOperationPoints(op) > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                      +{getOperationPoints(op)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CompletedSessionReport({ sessionId }) {
  const [filter, setFilter] = useState('Attention');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [game, setGame] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [retry, setRetry] = useState(0);
  const data = useSessionReport(sessionId, retry);
  if (data.loading) return <p role="status">Loading session evidence…</p>;
  if (data.error) return <div role="alert">Failed to load report data. <button onClick={() => setRetry((n) => n + 1)}>Retry report</button></div>;
  const report = data.report;
  const operations = report.operations || [];
  const visible = operations.filter((op) => (!type || op.type === type) && (!game || (op.game || op.game_account?.game) === game) && (filter === 'All' || (filter === 'Attention' ? reviewResult(op) !== 'Correct' : reviewResult(op) === filter)) && [op.id, op.type, op.game, op.game_account?.game, op.customerName, op.customer_name].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => ['Incorrect', 'Unverified', 'Pending', 'Correct'].indexOf(reviewResult(a)) - ['Incorrect', 'Unverified', 'Pending', 'Correct'].indexOf(reviewResult(b)));
  const selected = visible.find((op) => op.id === selectedId) || visible[0];
  return <div className="space-y-6">
    <p className="text-amber-200">Prototype evaluation metrics. Final grading thresholds require Trez approval.</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {['Correct', 'Incorrect', 'Pending', 'Unverified'].map((result) => <StatCard key={result} title={result} value={operations.filter((op) => reviewResult(op) === result).length} />)}
    </div>
    <p className="text-sm text-slate-400">Report accuracy: {Number(report.performance?.accuracy || 0).toFixed(1)}%. Accuracy is correct reconstructed results divided by processed operations, using the existing scoring formula. Evidence review counts may differ from the recorded result. Review completion is not recorded. Grading thresholds: Pending approval.</p>
    <p className="text-sm text-amber-200">Checks are reconstructed from available evidence, including mutable account state. They can differ from the original stored result; they are not immutable grading snapshots.</p>
    <p className="text-sm text-slate-400">Report loaded: {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : 'Not recorded'} (browser time zone). <button className="underline" onClick={() => setRetry((n) => n + 1)}>Refresh report</button></p>
    <section aria-label="Operation review" className="rounded-xl border border-slate-700 p-4 space-y-4">
      <h3 className="text-lg font-semibold">Mistakes &amp; evidence</h3>
      <div className="flex flex-wrap gap-3">
        <label>Result <select aria-label="Operation result" className="bg-slate-800 p-2" value={filter} onChange={(e) => setFilter(e.target.value)}>{['Attention', 'Incorrect', 'Unverified', 'Pending', 'Correct', 'All'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Type <select aria-label="Operation type" className="bg-slate-800 p-2" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{[...new Set(operations.map((op) => op.type).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Game <select aria-label="Operation game" className="bg-slate-800 p-2" value={game} onChange={(e) => setGame(e.target.value)}><option value="">All games</option>{[...new Set(operations.map((op) => op.game || op.game_account?.game).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Find operation <input className="bg-slate-800 p-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, type, game or customer" /></label>
      </div>
      <div className="trainer-review-grid">
        <div className="space-y-2" aria-label="Operation list">{!visible.length && <p>No operations match this filter.</p>}{visible.map((op) => <button key={op.id} aria-pressed={selected?.id === op.id} onClick={() => setSelectedId(op.id)} className="trainer-review-operation">
          <strong>{op.type} · {reviewResult(op)}</strong><span>{op.customerName || op.customer_name || 'Customer not recorded'} · {op.game || op.game_account?.game || 'Game not recorded'}</span><span className="break-all">{op.id}</span>
        </button>)}</div>
        {selected && <article aria-label="Selected operation evidence" className="min-w-0 space-y-4">
          <h4 className="font-semibold">{selected.type} · {reviewResult(selected)}</h4>
          <p className="text-sm text-slate-400">Requested: {selected.created_at ? new Date(selected.created_at).toLocaleString() : 'Not recorded'} · Handling: {duration(selected.handling_time_seconds)}</p>
          <p>Recorded terminal action: {sentResult(selected)} · Original stored result: {selected.original_is_correct === true ? 'Correct' : selected.original_is_correct === false ? 'Incorrect' : 'Not recorded'}</p>
          {reviewResult(selected) === 'Unverified' && <p className="text-amber-200">Unable to verify from available evidence. Missing or ambiguous evidence is not a confirmed mistake.</p>}
          {!requirements(selected).length && <p>No structured checks recorded.</p>}
          {requirements(selected).map((check, index) => { const issue = explain(check); return <section key={index} className="rounded-lg border border-slate-700 p-3 space-y-2">
            <h5 className="font-semibold">{issue.title}</h5><p>{issue.explanation}</p><p className="text-sm text-slate-400">Expected procedure: {issue.instruction}</p><small>Source: report validation check “{check.label}” · {issue.code} v{issue.version}</small>
          </section>; })}
          <details><summary className="cursor-pointer">Linked trainee evidence timeline</summary><p className="text-sm text-slate-400 my-3">Only events explicitly linked by operation ID are included. Times use your browser time zone.</p>{selected.id ? <AuditLogPanel key={selected.id} sessionId={sessionId} operationId={selected.id} /> : <p>Operation ID not recorded; events cannot be linked.</p>}</details>
          <p className="text-sm text-slate-500">Private notes are unavailable until the authenticated reviewer boundary is verified.</p>
        </article>}
      </div>
    </section>
    <details><summary className="cursor-pointer">Legacy report and full checks</summary><LegacyReport report={report} /></details>
  </div>;
}
