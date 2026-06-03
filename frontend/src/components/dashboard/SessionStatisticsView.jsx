import { useEffect, useState } from 'react';

import api from '../../api/client';
import {
  ChartGlyph,
  StatCard,
  formatDurationValue
} from './DashboardShared';

export default function SessionStatisticsView({ sessionId }) {
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
        console.error('Failed to fetch session statistics', err);
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

  if (loading) {
    return (
      <div className="text-slate-500 animate-pulse mt-8">
        Loading session statistics...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-red-400 mt-8 bg-red-500/10 p-4 rounded-xl border border-red-500/20">
        Failed to load session statistics.
      </div>
    );
  }

  const performance = report.performance || {};
  const operations = report.operations || [];
  const breakdown = report.operationBreakdown || {};
  const movementTotal =
    Object.values(breakdown.movements || {})
      .reduce((sum, value) => sum + Number(value || 0), 0);
  const requestTotal =
    Object.values(breakdown.requests || {})
      .reduce((sum, value) => sum + Number(value || 0), 0);
  const accuracy = Number(performance.accuracy) || 0;
  const averageHandlingSeconds =
    averageOperationSeconds(
      operations,
      'handling_time_seconds'
    );
  const operationRows =
    buildSessionOperationRows(operations);
  const gameRows =
    buildSessionGameRows(operations);
  const maxTypeCount =
    Math.max(
      1,
      ...operationRows.map(row => row.count)
    );
  const maxGameCount =
    Math.max(
      1,
      ...gameRows.map(row => row.count)
    );

  return (
    <div className="space-y-8 animate-fade-in-up">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          glyph="gauge"
          title="Session Accuracy"
          value={`${accuracy.toFixed(1)}%`}
        />
        <StatCard
          glyph="pulse"
          title="Completed"
          value={`${performance.completedOperations || 0} / ${performance.totalOperations || 0}`}
        />
        <StatCard
          glyph="clock"
          title="Avg Handling"
          value={formatDurationValue(averageHandlingSeconds)}
        />
        <StatCard
          glyph="layers"
          title="Incorrect"
          value={performance.incorrectOperations || 0}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Session Mix
              </h3>
              <p className="text-sm text-slate-500">
                Requests and movements in this session only.
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <ChartGlyph type="layers" />
            </span>
          </div>

          <div className="space-y-4">
            <SessionRatioBar
              label="Movements"
              value={movementTotal}
              total={performance.totalOperations || 0}
              barClass="bg-linear-to-r from-cyan-400 to-blue-400"
            />
            <SessionRatioBar
              label="Requests"
              value={requestTotal}
              total={performance.totalOperations || 0}
              barClass="bg-linear-to-r from-violet-400 to-fuchsia-400"
            />
            <SessionRatioBar
              label="Pending"
              value={performance.pendingOperations || 0}
              total={performance.totalOperations || 0}
              barClass="bg-linear-to-r from-amber-400 to-orange-400"
            />
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-white">
              Operation Types
            </h3>
            <p className="text-sm text-slate-500">
              Counts, results, and handling time within this session.
            </p>
          </div>
          <SessionOperationTable rows={operationRows} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">
            Games In This Session
          </h3>
          <p className="text-sm text-slate-500">
            Operation volume by game for the selected trainee session.
          </p>
        </div>
        <SessionDistributionGrid
          rows={gameRows}
          maxCount={maxGameCount}
        />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">
            Type Distribution
          </h3>
          <p className="text-sm text-slate-500">
            Relative volume for each operation type in this session.
          </p>
        </div>
        <SessionDistributionGrid
          rows={operationRows}
          maxCount={maxTypeCount}
        />
      </section>
    </div>
  );
}

function getSessionOperationResult(operation) {
  if (operation.status === 'PENDING') {
    return 'pending';
  }

  const requirements =
    operation.validationRequirements ||
    operation.validation_requirements ||
    [];

  if (requirements.length > 0) {
    return requirements.every(item => item.ok)
      ? 'correct'
      : 'incorrect';
  }

  if (operation.is_correct === true) {
    return 'correct';
  }

  if (operation.is_correct === false) {
    return 'incorrect';
  }

  return 'pending';
}

function averageOperationSeconds(
  operations,
  fieldName
) {
  const values = operations
    .filter(op => op.status !== 'PENDING')  // âœ… exclude pending
    .map(operation => Number(operation[fieldName]))
    .filter(Number.isFinite);

  if (values.length === 0) {
    return null;
  }

  return values.reduce(
    (sum, value) => sum + value,
    0
  ) / values.length;
}

function buildSessionOperationRows(operations) {
  const rows = new Map();

  operations.forEach(operation => {
    const type =
      operation.type || 'UNKNOWN';
    const current =
      rows.get(type) || {
        label: type,
        type,
        count: 0,
        correct: 0,
        incorrect: 0,
        pending: 0,
        handlingSamples: []
      };
    const result =
      getSessionOperationResult(operation);
    const handlingSeconds =
      Number(operation.handling_time_seconds);

    current.count += 1;
    current[result] += 1;

    // âœ… Only include handling time for processed operations
    const isProcessed = operation.status !== 'PENDING';
    if (isProcessed && Number.isFinite(handlingSeconds)) {
      current.handlingSamples.push(handlingSeconds);
    }

    rows.set(type, current);
  });

  return Array.from(rows.values())
    .map(row => ({
      ...row,
      averageHandlingSeconds:
        row.handlingSamples.length > 0
          ? row.handlingSamples.reduce(
              (sum, value) => sum + value,
              0
            ) / row.handlingSamples.length
          : null
    }))
    .sort((a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label)
    );
}

function buildSessionGameRows(operations) {
  const rows = new Map();

  operations.forEach(operation => {
    const label =
      operation.game ||
      operation.game_account?.game ||
      'Unknown Game';
    const current =
      rows.get(label) || {
        label,
        count: 0,
        correct: 0,
        incorrect: 0,
        pending: 0
      };
    const result =
      getSessionOperationResult(operation);

    current.count += 1;
    current[result] += 1;

    rows.set(label, current);
  });

  return Array.from(rows.values())
    .sort((a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label)
    );
}

function SessionRatioBar({
  label,
  value,
  total,
  barClass
}) {
  const safeTotal =
    Math.max(1, Number(total) || 0);
  const width =
    Math.round(
      (Number(value || 0) / safeTotal) * 100
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-400">
          {label}
        </span>
        <span className="font-mono text-slate-200">
          {value}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.max(4, width)}%` }}
        />
      </div>
    </div>
  );
}

function SessionOperationTable({ rows }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
        No operations recorded for this session.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
            <th className="px-4 py-3 text-right font-medium">Correct</th>
            <th className="px-4 py-3 text-right font-medium">Incorrect</th>
            <th className="px-4 py-3 text-right font-medium">Pending</th>
            <th className="px-4 py-3 text-right font-medium">Avg Handling</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
          {rows.map(row => (
            <tr
              key={row.type}
              className="hover:bg-slate-800/30"
            >
              <td className="px-4 py-3 font-medium text-slate-200">
                {row.label}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-300">
                {row.count}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300">
                {row.correct}
              </td>
              <td className="px-4 py-3 text-right font-mono text-red-300">
                {row.incorrect}
              </td>
              <td className="px-4 py-3 text-right font-mono text-amber-300">
                {row.pending}
              </td>
              <td className="px-4 py-3 text-right font-mono text-cyan-300">
                {formatDurationValue(row.averageHandlingSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionDistributionGrid({
  rows,
  maxCount
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
        No distribution data for this session.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map(row => {
        const width =
          Math.round(
            (row.count / Math.max(1, maxCount)) * 100
          );

        return (
          <div
            key={row.label}
            className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-100">
                  {row.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.count} operations
                </p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                <ChartGlyph type="bars" small />
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                style={{ width: `${Math.max(6, width)}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 py-2 text-emerald-200">
                {row.correct} OK
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/10 py-2 text-red-200">
                {row.incorrect} Bad
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 py-2 text-amber-200">
                {row.pending} Open
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
