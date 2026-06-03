import { useEffect, useState } from 'react';

import { getOperationTimeStats } from '../../api/client';
import {
  ChartGlyph,
  OperationStatsTable,
  OperationVisualGrid,
  StatCard,
  formatDurationValue
} from './DashboardShared';

export default function GlobalOperationStatistics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const perPersonRows =
    stats.perPerson?.flatMap(person =>
      [
        {
          traineeName: person.traineeName,
          type: 'All operations',
          ...person.overall
        },
        ...person.operations.map(operation => ({
          traineeName: person.traineeName,
          ...operation
        }))
      ]
    ) || [];
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

        <OperationStatsTable
          rows={perPersonRows}
          showTrainee
        />
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
