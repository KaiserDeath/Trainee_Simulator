const MINI_STAT_TONES = {
  cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  slate: 'border-slate-700 bg-slate-800 text-slate-200',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-300'
};

function ChartGlyph({
  type = 'bars',
  small = false
}) {
  const sizeClass = small
    ? 'h-4 w-4'
    : 'h-5 w-5';

  if (type === 'clock') {
    return (
      <span className={`${sizeClass} relative block rounded-full border-2 border-current`}>
        <span className="absolute left-1/2 top-1/2 h-[38%] w-0.5 origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-current" />
        <span className="absolute left-1/2 top-1/2 h-0.5 w-[34%] -translate-y-1/2 rounded-full bg-current" />
      </span>
    );
  }

  if (type === 'pulse') {
    return (
      <span className={`${sizeClass} flex items-end gap-0.5`}>
        <span className="h-1/3 w-1 rounded-full bg-current" />
        <span className="h-full w-1 rounded-full bg-current" />
        <span className="h-2/3 w-1 rounded-full bg-current" />
      </span>
    );
  }

  if (type === 'users') {
    return (
      <span className={`${sizeClass} relative block`}>
        <span className="absolute left-0 top-1 h-2 w-2 rounded-full border-2 border-current" />
        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-current" />
        <span className="absolute bottom-0 left-0 h-1.5 w-full rounded-full bg-current" />
      </span>
    );
  }

  if (type === 'layers') {
    return (
      <span className={`${sizeClass} flex flex-col justify-center gap-0.5`}>
        <span className="h-1.5 rounded-sm border border-current" />
        <span className="h-1.5 rounded-sm border border-current" />
        <span className="h-1.5 rounded-sm border border-current" />
      </span>
    );
  }

  if (type === 'gauge') {
    return (
      <span className={`${sizeClass} relative block overflow-hidden rounded-t-full border-2 border-b-0 border-current`}>
        <span className="absolute bottom-0 left-1/2 h-0.5 w-1/2 origin-left -rotate-45 rounded-full bg-current" />
      </span>
    );
  }

  if (type === 'trend') {
    return (
      <span className={`${sizeClass} relative block`}>
        <span className="absolute bottom-1 left-0 h-0.5 w-full -rotate-12 rounded-full bg-current" />
        <span className="absolute right-0 top-1 h-2 w-2 rotate-45 border-r-2 border-t-2 border-current" />
      </span>
    );
  }

  return (
    <span className={`${sizeClass} flex items-end gap-0.5`}>
      <span className="h-1/2 w-1 rounded-full bg-current" />
      <span className="h-full w-1 rounded-full bg-current" />
      <span className="h-3/4 w-1 rounded-full bg-current" />
    </span>
  );
}

function MiniStat({
  glyph,
  label,
  value,
  tone = 'slate'
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${MINI_STAT_TONES[tone] || MINI_STAT_TONES.slate}`}
        >
          <ChartGlyph type={glyph} small />
        </span>
        <span className="text-[11px] text-slate-500">
          {label}
        </span>
      </div>
      <p className="text-lg font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function CompactOperationBars({
  rows,
  maxAverage
}) {
  const visibleRows = rows.slice(0, 4);

  if (visibleRows.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-800 py-4 text-center text-xs text-slate-500">
        No timed operations yet
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {visibleRows.map((row) => {
        const width = Math.max(
          8,
          Math.round(
            ((Number(row.averageSeconds) || 0) /
              maxAverage) *
              100
          )
        );

        return (
          <div key={row.type}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-slate-400">
                {row.type}
              </span>
              <span className="font-mono text-slate-500">
                {formatDurationValue(row.averageSeconds)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDurationValue(seconds) {
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
}

function OperationStatsTable({
  rows,
  showTrainee = false
}) {
  if (!rows?.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        No handling-time data recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
            {showTrainee && (
              <th className="px-4 py-3 font-medium">Trainee</th>
            )}
            <th className="px-4 py-3 font-medium">Operation</th>
            <th className="px-4 py-3 text-right font-medium">Count</th>
            <th className="px-4 py-3 text-right font-medium">Average</th>
            <th className="px-4 py-3 text-right font-medium">Fastest</th>
            <th className="px-4 py-3 text-right font-medium">Slowest</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
          {rows.map((row, index) => (
            <tr
              key={`${row.traineeName || 'all'}-${row.type}-${index}`}
              className="hover:bg-slate-800/30"
            >
              {showTrainee && (
                <td className="px-4 py-3 font-medium text-slate-200">
                  {row.traineeName}
                </td>
              )}
              <td className="px-4 py-3 text-slate-300">
                {row.type}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-400">
                {row.count}
              </td>
              <td className="px-4 py-3 text-right font-mono text-cyan-300">
                {formatDurationValue(row.averageSeconds)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-400">
                {formatDurationValue(row.minSeconds)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-400">
                {formatDurationValue(row.maxSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationVisualGrid({
  rows,
  maxAverageSeconds
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
        No operation visuals available yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {rows.map((row) => {
        const averageSeconds =
          Number(row.averageSeconds) || 0;
        const width = Math.max(
          6,
          Math.round(
            (averageSeconds / maxAverageSeconds) * 100
          )
        );
        const countWidth = Math.max(
          6,
          Math.min(100, row.count * 12)
        );

        return (
          <div
            key={row.type}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">
                  {row.type}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.count} timed records
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                <ChartGlyph type="gauge" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <VisualMetricBar
                label="Average"
                value={formatDurationValue(row.averageSeconds)}
                width={width}
                barClass="bg-linear-to-r from-cyan-400 to-blue-400"
              />
              <VisualMetricBar
                label="Fastest"
                value={formatDurationValue(row.minSeconds)}
                width={Math.max(6, width * 0.55)}
                barClass="bg-linear-to-r from-emerald-400 to-cyan-300"
              />
              <VisualMetricBar
                label="Volume"
                value={row.count}
                width={countWidth}
                barClass="bg-linear-to-r from-violet-400 to-fuchsia-400"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisualMetricBar({
  label,
  value,
  width,
  barClass
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">
          {label}
        </span>
        <span className="font-mono text-slate-300">
          {value}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  glyph,
  title,
  value,
  suffix = ''
}) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-between backdrop-blur-sm relative overflow-hidden group hover:border-slate-600 transition-colors">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-colors" />
      <div className="z-10 mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400 font-medium">
          {title}
        </span>
        {glyph && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <ChartGlyph type={glyph} />
          </span>
        )}
      </div>
      <div className="z-10">
        <span className="text-3xl font-bold text-white">{value}</span>
        {suffix && <span className="text-slate-500 ml-1 font-medium">{suffix}</span>}
      </div>
    </div>
  );
}

export {
  ChartGlyph,
  CompactOperationBars,
  MiniStat,
  OperationStatsTable,
  OperationVisualGrid,
  StatCard,
  formatDurationValue
};
