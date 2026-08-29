import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  RadioTower,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
  XCircle
} from 'lucide-react';

import {
  CompactOperationBars,
  MiniStat
} from './DashboardShared';
import { formatDurationValue } from './dashboardFormatters';

export default function DashboardSidebar({
  activeSessionCount,
  allSelected,
  dashboardSection,
  deleteSelectedSessions,
  filteredSessions,
  handleMaxOpmChange,
  handleMinOpmChange,
  handleTimeoutChange,
  loading,
  maxOpm,
  minOpm,
  operationTimeStats,
  saveStatus,
  selectedSessionIds,
  sessionTimeoutMinutes,
  sessions,
  setDashboardSection,
  setTraineeSearch,
  sidebarMaxAverage,
  sidebarOperationRows,
  sidebarTopOperation,
  toggleSelectAll,
  traineeSearch
}) {
  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-r border-slate-800 bg-[#09111f] text-slate-200 shadow-2xl">
      <div className="border-b border-slate-800/80 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
            <RadioTower className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-white">
              Trainer Command
            </h1>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              Casino Simulator
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <SidebarMetric
            label="Active"
            value={activeSessionCount}
            tone="emerald"
          />
          <SidebarMetric
            label="Sessions"
            value={sessions.length}
            tone="cyan"
          />
        </div>
      </div>

      <div className="border-b border-slate-800/80 p-4">
        <div className="grid gap-2">
          <SidebarNavButton
            active={dashboardSection === 'trainees'}
            description={`${filteredSessions.length} visible`}
            icon={Users}
            label="Trainees"
            onClick={() => setDashboardSection('trainees')}
          />
          <SidebarNavButton
            active={dashboardSection === 'statistics'}
            description="Global timing"
            icon={BarChart3}
            label="Statistics"
            onClick={() => setDashboardSection('statistics')}
          />
        </div>
      </div>

      {dashboardSection === 'trainees' ? (
        <TraineeSidebarContent
          allSelected={allSelected}
          deleteSelectedSessions={deleteSelectedSessions}
          filteredSessions={filteredSessions}
          handleMaxOpmChange={handleMaxOpmChange}
          handleMinOpmChange={handleMinOpmChange}
          handleTimeoutChange={handleTimeoutChange}
          loading={loading}
          maxOpm={maxOpm}
          minOpm={minOpm}
          saveStatus={saveStatus}
          selectedSessionIds={selectedSessionIds}
          sessionTimeoutMinutes={sessionTimeoutMinutes}
          setTraineeSearch={setTraineeSearch}
          toggleSelectAll={toggleSelectAll}
          traineeSearch={traineeSearch}
        />
      ) : (
        <StatisticsSidebarContent
          activeSessionCount={activeSessionCount}
          operationTimeStats={operationTimeStats}
          sidebarMaxAverage={sidebarMaxAverage}
          sidebarOperationRows={sidebarOperationRows}
          sidebarTopOperation={sidebarTopOperation}
        />
      )}
    </aside>
  );
}

function TraineeSidebarContent({
  allSelected,
  deleteSelectedSessions,
  filteredSessions,
  handleMaxOpmChange,
  handleMinOpmChange,
  handleTimeoutChange,
  loading,
  maxOpm,
  minOpm,
  saveStatus,
  selectedSessionIds,
  sessionTimeoutMinutes,
  setTraineeSearch,
  toggleSelectAll,
  traineeSearch
}) {
  return (
    <>
      <div className="border-b border-slate-800/80 p-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-cyan-300" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Controls
              </p>
            </div>
            <SaveStatus status={saveStatus} />
          </div>

          <div className="space-y-4">
            <NumberField
              label="Session limit"
              min="1"
              suffix="min"
              value={sessionTimeoutMinutes}
              onChange={handleTimeoutChange}
            />

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Min OPM"
                min="0"
                value={minOpm}
                onChange={handleMinOpmChange}
              />
              <NumberField
                label="Max OPM"
                min="0"
                value={maxOpm}
                onChange={handleMaxOpmChange}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={traineeSearch}
              onChange={(event) =>
                setTraineeSearch(event.target.value)
              }
              placeholder="Search trainee or session ID"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {allSelected ? 'Clear all' : 'Select all'}
            </button>

            {selectedSessionIds.size > 0 && (
              <button
                type="button"
                onClick={deleteSelectedSessions}
                className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedSessionIds.size}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Trainee Directory
          </p>
          <p className="mt-2 text-sm leading-5 text-slate-400">
            Trainees and their sessions are now grouped in the main workspace.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Visible
              </p>
              <p className="mt-1 text-xl font-bold text-white">
                {filteredSessions.length}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Selected
              </p>
              <p className="mt-1 text-xl font-bold text-cyan-300">
                {selectedSessionIds.size}
              </p>
            </div>
          </div>
          {loading && (
            <p className="mt-4 text-xs text-slate-500">
              Loading latest sessions...
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function StatisticsSidebarContent({
  activeSessionCount,
  operationTimeStats,
  sidebarMaxAverage,
  sidebarOperationRows,
  sidebarTopOperation
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
      <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-300" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Overview
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            glyph="clock"
            label="Avg handling"
            value={formatDurationValue(
              operationTimeStats?.overall?.averageSeconds
            )}
            tone="cyan"
          />
          <MiniStat
            glyph="pulse"
            label="Timed ops"
            value={operationTimeStats?.overall?.count || 0}
            tone="slate"
          />
          <MiniStat
            glyph="users"
            label="Active"
            value={activeSessionCount}
            tone="emerald"
          />
          <MiniStat
            glyph="layers"
            label="Types"
            value={sidebarOperationRows.length}
            tone="violet"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/55 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Top volume
          </span>
          <span className="truncate text-xs font-semibold text-slate-300">
            {sidebarTopOperation?.type || 'No data'}
          </span>
        </div>
        <CompactOperationBars
          rows={sidebarOperationRows}
          maxAverage={sidebarMaxAverage}
        />
      </div>
    </div>
  );
}

function SidebarMetric({
  label,
  value,
  tone
}) {
  const toneClasses =
    tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
      : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300';

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClasses}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold leading-none">
        {value}
      </p>
    </div>
  );
}

function SidebarNavButton({
  active,
  description,
  icon: Icon,
  label,
  onClick
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        active
          ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 shadow-[inset_3px_0_0_rgba(34,211,238,0.8)]'
          : 'border-transparent bg-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-200'
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${
        active
          ? 'bg-cyan-400/15 text-cyan-200'
          : 'bg-slate-900 text-slate-500'
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {label}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {description}
        </span>
      </span>
    </button>
  );
}

function NumberField({
  label,
  min,
  onChange,
  suffix,
  value
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <SlidersHorizontal className="h-3 w-3" />
        {label}
      </span>
      <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/70 focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/10">
        <input
          type="number"
          min={min}
          value={value}
          onChange={(event) =>
            onChange(Number(event.target.value))
          }
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm font-semibold text-white outline-none"
          aria-label={label}
        />
        {suffix && (
          <span className="pr-3 text-xs font-medium text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SaveStatus({ status }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-300">
        <Clock3 className="h-3 w-3 animate-pulse" />
        Syncing
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Saved
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }

  return (
    <span className="rounded-full border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-500">
      Ready
    </span>
  );
}
