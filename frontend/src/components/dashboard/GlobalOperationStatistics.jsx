import { useEffect, useMemo, useState } from 'react';

import { getOperationTimeStats } from '../../api/client';
import {
  ChartGlyph,
  OperationStatsTable,
  OperationVisualGrid,
  StatCard
} from './DashboardShared';
import { formatDurationValue } from './dashboardFormatters';

export default function GlobalOperationStatistics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTrainees, setExpandedTrainees] = useState(() => new Set());

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      try {
        const response =
          await getOperationTimeStats();

        if (mounted) {
          setStats(response.data);
        }
      } catch (err) {
        console.error(
          'Failed to fetch operation time stats',
          err
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      mounted = false;
    };
  }, []);

  const perPersonGroups = useMemo(() => {
    const groups = new Map();

    stats?.perPerson?.forEach((sessionStat) => {
      const traineeName =
        sessionStat.traineeName || 'Unknown Trainee';
      const existing = groups.get(traineeName);
      const sessionCount = Number(sessionStat.overall?.count) || 0;
      const sessionAvg = Number(sessionStat.overall?.averageSeconds) || 0;
      const sessionTotal = sessionCount * sessionAvg;

      if (!existing) {
        groups.set(traineeName, {
          traineeName,
          sessions: [],
          totalSeconds: 0,
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          operations: new Map()
        });
      }

      const group = groups.get(traineeName);
      group.sessions.push(sessionStat);
      group.totalSeconds += sessionTotal;
      group.count += sessionCount;
      group.minSeconds =
        group.minSeconds == null
          ? sessionStat.overall?.minSeconds
          : Math.min(
              group.minSeconds,
              sessionStat.overall?.minSeconds ?? Infinity
            );
      group.maxSeconds =
        group.maxSeconds == null
          ? sessionStat.overall?.maxSeconds
          : Math.max(
              group.maxSeconds,
              sessionStat.overall?.maxSeconds ?? 0
            );

      sessionStat.operations?.forEach((operation) => {
        const type = operation.type || 'Unknown operation';
        const opCount = Number(operation.count) || 0;
        const opAverage = Number(operation.averageSeconds) || 0;
        const opTotal = opCount * opAverage;

        if (!group.operations.has(type)) {
          group.operations.set(type, {
            type,
            count: 0,
            totalSeconds: 0,
            minSeconds: null,
            maxSeconds: null
          });
        }

        const opStats = group.operations.get(type);
        opStats.count += opCount;
        opStats.totalSeconds += opTotal;
        opStats.minSeconds =
          opStats.minSeconds == null
            ? operation.minSeconds
            : Math.min(
                opStats.minSeconds,
                operation.minSeconds ?? Infinity
              );
        opStats.maxSeconds =
          opStats.maxSeconds == null
            ? operation.maxSeconds
            : Math.max(
                opStats.maxSeconds,
                operation.maxSeconds ?? 0
              );
      });
    });

    return Array.from(groups.values()).map((group) => ({
      traineeName: group.traineeName,
      sessionCount: group.sessions.length,
      overall: {
        count: group.count,
        averageSeconds:
          group.count > 0
            ? group.totalSeconds / group.count
            : 0,
        minSeconds:
          group.minSeconds == null ? null : group.minSeconds,
        maxSeconds:
          group.maxSeconds == null ? null : group.maxSeconds
      },
      operations: Array.from(group.operations.values())
        .map((operation) => ({
          type: operation.type,
          count: operation.count,
          averageSeconds:
            operation.count > 0
              ? operation.totalSeconds / operation.count
              : 0,
          minSeconds: operation.minSeconds,
          maxSeconds: operation.maxSeconds,
          child: true
        }))
        .sort((a, b) => a.type.localeCompare(b.type))
    }));
  }, [stats?.perPerson]);

  if (loading) {
    return (
      <div className="mt-8 text-slate-500 animate-pulse">
        Loading handling-time statistics...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
        Failed to load operation statistics.
      </div>
    );
  }

  const allOperations =
    stats.allOperations || [];

  const maxAverageSeconds =
    Math.max(
      1,
      ...allOperations.map(operation =>
        Number(operation.averageSeconds) || 0
      )
    );
  const topOperation =
    allOperations.reduce(
      (top, operation) =>
        !top || operation.count > top.count
          ? operation
          : top,
      null
    );
  const toggleTraineeExpanded = (traineeName) => {
    setExpandedTrainees((current) => {
      const next = new Set(current);
      if (next.has(traineeName)) {
        next.delete(traineeName);
      } else {
        next.add(traineeName);
      }
      return next;
    });
  };
  return (
    <div className="space-y-8 animate-fade-in-up">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                <ChartGlyph type="trend" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Statistics
                </p>
                <h3 className="text-2xl font-bold text-white">
                  Handling-time overview
                </h3>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm text-slate-400">
              Visual comparison of speed, volume, and operation mix across completed trainee work.
            </p>
          </div>
          <div className="border-t border-slate-800 bg-slate-950/40 p-6 lg:border-l lg:border-t-0">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Highest volume
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-white">
                  {topOperation?.type || 'No operations'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {topOperation?.count || 0} timed records
                </p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-2xl font-black text-emerald-300">
                {topOperation?.count || 0}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          glyph="pulse"
          title="Timed Operations"
          value={stats.overall?.count || 0}
        />
        <StatCard
          glyph="clock"
          title="Average Handling"
          value={formatDurationValue(
            stats.overall?.averageSeconds
          )}
        />
        <StatCard
          glyph="layers"
          title="Operation Types"
          value={allOperations.length}
        />
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Operation Visuals
          </h3>
          <p className="text-sm text-slate-500">
            Average handling time by operation type, shown as visual bars.
          </p>
        </div>

        <OperationVisualGrid
          rows={allOperations}
          maxAverageSeconds={maxAverageSeconds}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Per Person
          </h3>
          <p className="text-sm text-slate-500">
            Average handling time by trainee and operation type.
          </p>
        </div>

        {perPersonGroups.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
            No per-person handling-time data recorded yet.
          </div>
        ) : (
          <div className="space-y-4">
            {perPersonGroups.map((group) => {
              const isExpanded =
                expandedTrainees.has(group.traineeName);

              return (
                <section
                  key={group.traineeName}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50"
                >
                  <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Trainee
                      </p>
                      <h4 className="mt-2 text-xl font-semibold text-white">
                        {group.traineeName}
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        {group.sessionCount} session{group.sessionCount === 1 ? '' : 's'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        toggleTraineeExpanded(group.traineeName)
                      }
                      className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
                    >
                      {isExpanded
                        ? 'Hide operation details'
                        : 'Show operation details'}
                    </button>
                  </div>

                  <div className="border-t border-slate-800/70 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-white">
                      All sessions average
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Average across all sessions for this trainee.
                    </p>
                    <div className="mt-4">
                      <OperationStatsTable
                        rows={[
                          {
                            type: 'All operations',
                            ...group.overall
                          }
                        ]}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-800/70 bg-slate-900/60 p-4">
                      <p className="text-sm font-semibold text-white">
                        Operation detail
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Averages, fastest, and slowest times for each operation across all sessions.
                      </p>
                      <div className="mt-4">
                        <OperationStatsTable
                          rows={group.operations}
                        />
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            All Sessions
          </h3>
          <p className="text-sm text-slate-500">
            Average handling time for each operation type across every session.
          </p>
        </div>

        <OperationStatsTable
          rows={allOperations}
        />
      </section>
    </div>
  );
}
