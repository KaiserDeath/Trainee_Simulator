import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Search,
  Trash2,
  UserRound
} from 'lucide-react';

const SESSION_STATUS_META = {
  active: {
    label: 'Active',
    dot: 'bg-emerald-400',
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  },
  completed: {
    label: 'Completed',
    dot: 'bg-slate-400',
    classes: 'border-slate-600 bg-slate-800 text-slate-300'
  },
  submitted: {
    label: 'Submitted',
    dot: 'bg-violet-300',
    classes: 'border-violet-500/30 bg-violet-500/10 text-violet-200'
  }
};

export default function TraineesDirectory({
  allSelected,
  deleteSelectedSessions,
  filteredSessions,
  loading,
  selectedSessionIds,
  setSelectedSession,
  toggleSelectAll,
  toggleSessionSelection,
  traineeSearch
}) {
  const traineeGroups =
    useMemo(
      () => groupSessionsByTrainee(filteredSessions),
      [filteredSessions]
    );
  const [expandedNames, setExpandedNames] =
    useState(() => new Set());

  const toggleExpanded = (traineeName) => {
    setExpandedNames((current) => {
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
    <div className="space-y-6 animate-fade-in-up">
      <header className="flex flex-col gap-4 border-b border-slate-800/60 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Trainee Directory
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Training Sessions
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Sessions are grouped by trainee. Expand a trainee, then open a session to view live activity, reports, audit logs, and session statistics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DirectoryStat
            label="Trainees"
            value={traineeGroups.length}
          />
          <DirectoryStat
            label="Sessions"
            value={filteredSessions.length}
          />
          <DirectoryStat
            label="Selected"
            value={selectedSessionIds.size}
          />
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <Search className="h-4 w-4 text-slate-500" />
          <span>
            {traineeSearch
              ? `Filtered by "${traineeSearch}"`
              : 'Showing all trainees'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {allSelected ? 'Clear selection' : 'Select visible'}
          </button>

          {selectedSessionIds.size > 0 && (
            <button
              type="button"
              onClick={deleteSelectedSessions}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/15"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </button>
          )}
        </div>
      </div>

      {loading && filteredSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500">
          Loading trainee sessions...
        </div>
      ) : traineeGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500">
          No trainee sessions match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {traineeGroups.map((group) => {
            const isExpanded =
              expandedNames.has(group.traineeName);

            return (
              <TraineeGroup
                key={group.traineeName}
                group={group}
                isExpanded={isExpanded}
                selectedSessionIds={selectedSessionIds}
                setSelectedSession={setSelectedSession}
                toggleExpanded={toggleExpanded}
                toggleSessionSelection={toggleSessionSelection}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupSessionsByTrainee(sessions) {
  const groups = new Map();

  sessions.forEach((session) => {
    const traineeName =
      session.trainee_name || 'Unknown Trainee';
    const group =
      groups.get(traineeName) || {
        traineeName,
        sessions: [],
        active: 0,
        completed: 0,
        submitted: 0
      };

    group.sessions.push(session);
    if (session.status === 'active') {
      group.active += 1;
    } else if (session.status === 'submitted') {
      group.submitted += 1;
    } else {
      group.completed += 1;
    }

    groups.set(traineeName, group);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort(
        (a, b) =>
          new Date(b.started_at || 0).getTime() -
          new Date(a.started_at || 0).getTime()
      )
    }))
    .sort((a, b) =>
      a.traineeName.localeCompare(b.traineeName)
    );
}

function DirectoryStat({
  label,
  value
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function TraineeGroup({
  group,
  isExpanded,
  selectedSessionIds,
  setSelectedSession,
  toggleExpanded,
  toggleSessionSelection
}) {
  const latestSession = group.sessions[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <button
        type="button"
        onClick={() => toggleExpanded(group.traineeName)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-slate-800/35"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-white">
              {group.traineeName}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {group.sessions.length} sessions
              {latestSession?.started_at
                ? ` · latest ${formatDateTime(latestSession.started_at)}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <StatusCounter
            label="Active"
            value={group.active}
            tone="emerald"
          />
          <StatusCounter
            label="Submitted"
            value={group.submitted}
            tone="violet"
          />
          <StatusCounter
            label="Closed"
            value={group.completed}
            tone="slate"
          />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-800 bg-slate-950/25 p-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {group.sessions.map((session) => (
              <SessionTile
                key={session.id}
                checked={selectedSessionIds.has(session.id)}
                session={session}
                setSelectedSession={setSelectedSession}
                toggleSessionSelection={toggleSessionSelection}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusCounter({
  label,
  tone,
  value
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'violet'
        ? 'text-violet-300'
        : 'text-slate-300';

  return (
    <div className="hidden rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-right md:block">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`text-sm font-bold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function SessionTile({
  checked,
  session,
  setSelectedSession,
  toggleSessionSelection
}) {
  const status =
    SESSION_STATUS_META[session.status] || {
      label: session.status || 'Unknown',
      dot: 'bg-slate-500',
      classes: 'border-slate-700 bg-slate-800 text-slate-300'
    };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={() =>
              toggleSessionSelection(session.id)
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
          />
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${status.classes}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setSelectedSession(session)}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/15"
        >
          <FileText className="h-3.5 w-3.5" />
          Open
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <p className="truncate font-mono text-xs text-slate-500">
          {session.id}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <TimeBox
            label="Started"
            value={session.started_at}
          />
          <TimeBox
            label="Ended"
            value={session.completed_at || session.ended_at}
            fallback="Open"
          />
        </div>
      </div>
    </div>
  );
}

function TimeBox({
  fallback = 'N/A',
  label,
  value
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Clock3 className="h-3 w-3" />
        {label}
      </span>
      <span className="mt-1 block font-mono text-xs text-slate-300">
        {value ? formatDateTime(value) : fallback}
      </span>
    </div>
  );
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
