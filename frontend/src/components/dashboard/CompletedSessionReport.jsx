import { useEffect, useState } from 'react';

import api from '../../api/client';
import { StatCard } from './DashboardShared';

export default function CompletedSessionReport({ sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchReport = async () => {
      try {
        const response = await api.get(`/trainer/sessions/${sessionId}/report`);
        if (mounted) {
          setReport(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch report', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchReport();

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  if (loading) return <div className="text-slate-500 animate-pulse mt-8">Generating performance report...</div>;
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

  const formatRequirementValue = (value) => {
    if (typeof value === 'number') {
      return `$${value.toFixed(2)}`;
    }
    if (value == null || value === '') {
      return 'N/A';
    }
    return String(value);
  };

  const formatDuration = (seconds) => {
    const value = Number(seconds);

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
        Prototype evaluation metrics. Final grading thresholds require Trez approval.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Overall Score" value={overallScore} suffix="/ 100" />
        <StatCard title="Accuracy" value={`${accValue.toFixed(1)}%`} />
        <StatCard title="Processed" value={`${completedOperations} / ${initialOperationsCount}`} />
        <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-center items-center backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="text-sm text-slate-400 mb-2 font-medium">Final Grade</span>
          <span className="text-xl font-bold text-amber-300">Pending approval</span>
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
                            Posted: {formatRequirementValue(item.sent)}
                          </div>
                          {item.expected !== '' && (
                            <div className="text-[11px] opacity-70">
                              Expected: {formatRequirementValue(item.expected)}
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
