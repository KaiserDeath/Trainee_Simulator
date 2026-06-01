import { useState, useEffect, useCallback, useMemo } from 'react';
import api, {
  deleteSession as deleteSessionApi,
  getOperationTimeStats,
  getSimulatorSettings,
  updateSimulatorSettings
} from '../api/client';
import AuditLogPanel from '../components/audit/AuditLogPanel';
import socket from '../sockets/socket';

const SESSION_STATUS_META = {
  active: {
    label: 'Active',
    classes: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'
  },
  completed: {
    label: 'Completed (stats)',
    classes: 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
  },
  submitted: {
    label: 'Submitted for evaluation',
    classes: 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
  }
};

export default function DashboardPage() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [dashboardSection, setDashboardSection] = useState('trainees');
  const [viewMode, setViewMode] = useState('live'); // 'live', 'report', 'audit'
  const [traineeSearch, setTraineeSearch] = useState('');
  const [operationTimeStats, setOperationTimeStats] = useState(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
  const [minOpm, setMinOpm] = useState(2);
  const [maxOpm, setMaxOpm] = useState(4);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

  // Load settings from backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await getSimulatorSettings();
        if (response.data) {
          if (response.data.sessionTimeoutMinutes !== undefined) {
            setSessionTimeoutMinutes(response.data.sessionTimeoutMinutes);
          }
          if (response.data.minOpm !== undefined) {
            setMinOpm(response.data.minOpm);
          }
          if (response.data.maxOpm !== undefined) {
            setMaxOpm(response.data.maxOpm);
          }
        }
      } catch (err) {
        console.error('Failed to load simulator settings from backend', err);
      }
    };
    loadSettings();
  }, []);

  const handleTimeoutChange = async (minutes) => {
    const val = Number(minutes);
    setSessionTimeoutMinutes(val);
    
    if (!val || val <= 0) return;

    setSaveStatus('saving');
    try {
      await updateSimulatorSettings({ sessionTimeoutMinutes: val });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('Failed to save settings to backend', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const handleMinOpmChange = async (val) => {
    const minVal = Number(val);
    setMinOpm(minVal);
    if (minVal < 0) return;

    // Validate minOpm <= maxOpm, adjust max if needed
    const newMax = Math.max(maxOpm, minVal);
    if (newMax !== maxOpm) {
      setMaxOpm(newMax);
    }

    setSaveStatus('saving');
    try {
      // FIX: Include sessionTimeoutMinutes in the request body
      await updateSimulatorSettings({ 
        sessionTimeoutMinutes, 
        minOpm: minVal, 
        maxOpm: newMax 
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('Failed to save settings to backend', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const handleMaxOpmChange = async (val) => {
    const maxVal = Number(val);
    setMaxOpm(maxVal);
    if (maxVal < 0) return;

    // Validate maxOpm >= minOpm, adjust min if needed
    const newMin = Math.min(minOpm, maxVal);
    if (newMin !== minOpm) {
      setMinOpm(newMin);
    }

    setSaveStatus('saving');
    try {
      // FIX: Include sessionTimeoutMinutes in the request body
      await updateSimulatorSettings({ 
        sessionTimeoutMinutes, 
        minOpm: newMin, 
        maxOpm: maxVal 
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('Failed to save settings to backend', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.get('/trainer/sessions');
      const sessionList = response.data || [];
      setSessions(sessionList);
      setSelectedSessionIds((current) => {
        const validIds = sessionList
          .filter((session) => current.has(session.id))
          .map((session) => session.id);
        return new Set(validIds);
      });

      if (sessionList.length === 0) {
        setSelectedSession(null);
      } else if (
        !selectedSession ||
        !sessionList.some((s) => s.id === selectedSession.id)
      ) {
        setSelectedSession(sessionList[0]);
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    const handleSessionUpdated = (
      updatedSession
    ) => {
      setSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === updatedSession.id
            ? updatedSession
            : session
        )
      );
    };

    const handleSessionCreated = (
      newSession
    ) => {
      setSessions((prevSessions) => [
        newSession,
        ...prevSessions,
      ]);
    };

    socket.on(
      'session-updated',
      handleSessionUpdated
    );

    socket.on(
      'session-created',
      handleSessionCreated
    );

    return () => {
      socket.off(
        'session-updated',
        handleSessionUpdated
      );

      socket.off(
        'session-created',
        handleSessionCreated
      );
    };
  }, []);

  const filteredSessions = useMemo(() => {
    const search = traineeSearch.trim().toLowerCase();
    if (!search) {
      return sessions;
    }

    return sessions.filter((session) => {
      const traineeName = (session.trainee_name || '').toLowerCase();
      return (
        traineeName.includes(search) ||
        session.id.toLowerCase().includes(search)
      );
    });
  }, [sessions, traineeSearch]);

  const allSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((session) =>
      selectedSessionIds.has(session.id)
    );

  const effectiveViewMode =
    selectedSession?.status !== 'active' && viewMode === 'live'
      ? 'report'
      : viewMode;

  const sidebarOperationRows =
    operationTimeStats?.allOperations || [];
  const sidebarTopOperation =
    sidebarOperationRows.reduce(
      (top, operation) =>
        !top || operation.count > top.count
          ? operation
          : top,
      null
    );
  const sidebarMaxAverage =
    Math.max(
      1,
      ...sidebarOperationRows.map(operation =>
        Number(operation.averageSeconds) || 0
      )
    );
  const activeSessionCount =
    sessions.filter(session =>
      session.status === 'active'
    ).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(
        new Set(filteredSessions.map((session) => session.id))
      );
    }
  };

  const toggleSessionSelection = (sessionId) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const deleteSelectedSessions = async () => {
    if (selectedSessionIds.size === 0) {
      return;
    }

    if (!window.confirm(`Delete ${selectedSessionIds.size} selected session(s)?`)) {
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedSessionIds).map((id) =>
          deleteSessionApi(id)
        )
      );
      setSelectedSessionIds(new Set());
      setSelectedSession(null);
      await fetchSessions();
    } catch (err) {
      console.error('Failed to delete selected sessions', err);
      alert('Could not delete all selected sessions.');
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchSessions);
    const interval = setInterval(fetchSessions, 5000); // refresh list every 5s
    return () => clearInterval(interval);
  }, [fetchSessions]);

  useEffect(() => {
    let mounted = true;

    const fetchOperationStats = async () => {
      try {
        const response =
          await getOperationTimeStats();

        if (mounted) {
          setOperationTimeStats(response.data);
        }
      } catch (err) {
        console.error(
          'Failed to fetch operation time stats',
          err
        );
      }
    };

    fetchOperationStats();
    const interval = setInterval(
      fetchOperationStats,
      30000
    );

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col h-full">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <h1 className="text-2xl font-bold bg-linear-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm">
            Instructor Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
            Casino Simulator Platform
          </p>
        </div>
        
        <div className="p-4 border-b border-slate-800/50">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/70 p-1">
            <button
              type="button"
              onClick={() => setDashboardSection('trainees')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                dashboardSection === 'trainees'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              Trainees
            </button>
            <button
              type="button"
              onClick={() => setDashboardSection('statistics')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                dashboardSection === 'statistics'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              Statistics
            </button>
          </div>
        </div>

        {dashboardSection === 'trainees' ? (
          <>
            <div className="p-4 border-b border-slate-800/50 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Session settings
              </p>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-cyan-400 flex items-center gap-1 animate-pulse font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                  Syncing...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="inline-block">✓</span> Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-[10px] text-rose-400 font-medium">
                  ✗ Sync failed
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={sessionTimeoutMinutes}
                onChange={(event) =>
                  handleTimeoutChange(
                    Number(event.target.value)
                  )
                }
                className="w-20 rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-2"
                aria-label="Global session timeout minutes"
              />
              <span className="text-slate-400 text-xs">
                minutes for all sessions
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              This value is stored in the database and applies globally to all computers.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/50">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Difficulty settings
            </p>
            <div className="space-y-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Min operations per minute (OPM)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={minOpm}
                    onChange={(event) =>
                      handleMinOpmChange(
                        Number(event.target.value)
                      )
                    }
                    className="w-20 rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-1.5 text-xs"
                    aria-label="Minimum operations per minute"
                  />
                  <span className="text-slate-500 text-xs">min rate</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Max operations per minute (OPM)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={maxOpm}
                    onChange={(event) =>
                      handleMaxOpmChange(
                        Number(event.target.value)
                      )
                    }
                    className="w-20 rounded-lg border border-slate-700 bg-slate-900 text-white px-3 py-1.5 text-xs"
                    aria-label="Maximum operations per minute"
                  />
                  <span className="text-slate-500 text-xs">max rate</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Sets the operations range per minute. Difficulty dynamically updates in real-time.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              Trainee search
            </p>
            <input
              type="text"
              value={traineeSearch}
              onChange={(event) =>
                setTraineeSearch(event.target.value)
              }
              placeholder="Search by trainee name or session id"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {selectedSessionIds.size} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs px-3 py-1 rounded-lg border border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-700 transition"
              >
                {allSelected ? 'Unselect all' : 'Select all'}
              </button>
              {selectedSessionIds.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelectedSessions}
                  className="text-xs px-3 py-1 rounded-lg border border-red-500 bg-red-500/10 text-red-300 hover:bg-red-500/15 transition"
                >
                  Delete selected
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading && sessions.length === 0 ? (
            <div className="text-center text-slate-500 py-8 animate-pulse">Loading sessions...</div>
          ) : (
            filteredSessions.map((s) => {
              const checked = selectedSessionIds.has(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                    selectedSession?.id === s.id
                      ? 'bg-slate-800 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)] transform scale-[1.02]'
                      : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                  } ${checked ? 'ring-1 ring-cyan-500/40' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2 gap-3">
                    <label className="flex items-center gap-3 text-slate-100 truncate pr-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSessionSelection(s.id);
                        }}
                        className="h-4 w-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="font-semibold text-slate-100 truncate">
                        {s.trainee_name || 'Unknown Trainee'}
                      </span>
                    </label>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        SESSION_STATUS_META[s.status]?.classes || 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}
                    >
                      {SESSION_STATUS_META[s.status]?.label || s.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {s.completed_at && ` - ${new Date(s.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                </div>
              );
            })
          )}
        </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Statistics overview
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MiniStat
                  glyph="clock"
                  label="Avg handling"
                  value={formatDurationValue(
                    operationTimeStats?.overall
                      ?.averageSeconds
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

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  Top volume
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {sidebarTopOperation?.type || 'No data'}
                </span>
              </div>
              <CompactOperationBars
                rows={sidebarOperationRows}
                maxAverage={sidebarMaxAverage}
              />
            </div>
          </div>
        )}
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full bg-[#0a0f18] relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        {dashboardSection === 'statistics' ? (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <OperationTimeStats />
          </div>
        ) : selectedSession ? (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <header className="mb-8 flex justify-between items-end border-b border-slate-800/50 pb-6">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight mb-2">
                  {selectedSession.trainee_name}'s Session
                </h2>
                <p className="text-slate-400 font-mono text-sm">
                  ID: {selectedSession.id}
                </p>
                {selectedSession.status === 'submitted' && (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-200 border border-violet-500/20">
                    <span className="h-2.5 w-2.5 rounded-full bg-violet-300" />
                    Submitted for evaluation
                  </p>
                )}
                {selectedSession.status === 'completed' && (
                  <p className="mt-2 text-xs text-slate-400">
                    This completed session is available for evaluation submission.
                  </p>
                )}
              </div>
              
              <div className="flex gap-3">
                {selectedSession.status === 'active' && (
                  <button
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to stop this session?')) {
                        await api.post(`/sessions/${selectedSession.id}/stop`);
                        fetchSessions();
                      }
                    }}
                    className="bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all duration-300 px-6 py-2.5 rounded-lg font-semibold shadow-[0_0_20px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                  >
                    Stop Session
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (window.confirm('Delete this session permanently?')) {
                      try {
                        await deleteSessionApi(selectedSession.id);
                        setSelectedSession(null);
                        await fetchSessions();
                      } catch (err) {
                        console.error('Failed to delete session', err);
                        alert('Could not delete this session.');
                      }
                    }
                  }}
                  className="bg-slate-700 text-slate-100 border border-slate-600 hover:bg-slate-600 transition-all duration-300 px-6 py-2.5 rounded-lg font-semibold shadow-[0_0_20px_rgba(15,23,42,0.35)] hover:shadow-[0_0_20px_rgba(15,23,42,0.55)]"
                >
                  Delete Session
                </button>
              </div>
            </header>

            {/* VIEW MODE TABS */}
            <div className="flex gap-4 mb-6 border-b border-slate-800/50 pb-4">
              {selectedSession?.status === 'active' && (
              <button
                onClick={() => setViewMode('live')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  viewMode === 'live'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Live Operations
              </button>
            )}
            <button
                onClick={() => setViewMode('report')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  viewMode === 'report'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Report
              </button>
              <button
                onClick={() => setViewMode('session-statistics')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  viewMode === 'session-statistics'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Session Statistics
              </button>
              <button
                onClick={() => setViewMode('audit')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  viewMode === 'audit'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Audit Log
              </button>
            </div>

            {selectedSession.status === 'active' && effectiveViewMode === 'live' ? (
              <LiveSessionView sessionId={selectedSession.id} />
            ) : effectiveViewMode === 'audit' ? (
              <AuditLogPanel sessionId={selectedSession.id} />
            ) : effectiveViewMode === 'session-statistics' ? (
              <SessionStatisticsView sessionId={selectedSession.id} />
            ) : (
              <CompletedSessionReport sessionId={selectedSession.id} />
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center relative z-10">
            <div className="text-center opacity-50">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-lg text-slate-300">Select a session to view details</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

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

function OperationTimeStats() {
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

function LiveSessionView({ sessionId }) {
  const [operations, setOperations] = useState([]);

  // ✅ MOVED OUTSIDE: Define getTypeStyles here, before the useEffect
  const getTypeStyles = (type) => {
    switch (type) {
      case 'ADD':
      case 'CREDIT':
      case 'DEPOSIT':
        return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'; // Transparent light green

      case 'WITHDRAW':
      case 'DEBIT':
      case 'WITHDRAWAL':
        return 'bg-red-500/10 text-red-300 border border-red-500/20'; // Transparent red

      default:
        return 'bg-slate-700/40 text-slate-300 border border-slate-600';
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchOps = async () => {
      try {
        const response = await api.get(`/operations/${sessionId}`);
        if (mounted) setOperations(response.data);
      } catch (err) {
        console.error('Failed to fetch operations', err);
      }
    };

    fetchOps();
    const interval = setInterval(fetchOps, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        <h3 className="text-lg font-semibold text-slate-200">Live Operations Queue</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {operations.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/30 border border-slate-800/50 rounded-2xl border-dashed">
            No pending operations. The GameMaster is generating traffic...
          </div>
        ) : (
          operations.map((op) => {
            // ❌ REMOVED: getTypeStyles is no longer defined here
            return (
              <div
                key={op.id}
                className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl backdrop-blur-sm shadow-xl flex flex-col justify-between"
              >
                <div>
                  {/* HEADER */}
                  <div className="flex justify-between items-start mb-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-md ${getTypeStyles(
                        op.type
                      )}`}
                    >
                      {op.type}
                    </span>

                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(op.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* CUSTOMER */}
                  <div className="mb-2">
                    <div className="text-sm text-slate-400 mb-1">
                      Customer
                    </div>
                    <div className="font-semibold text-slate-200">
                      {op.customer_name}
                    </div>
                  </div>

                  {/* AMOUNT */}
                  {op.amount && (
                    <div>
                      <div className="text-sm text-slate-400 mb-1">
                        Amount
                      </div>
                      <div className="font-semibold text-white text-lg">
                        ${op.amount}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SessionStatisticsView({ sessionId }) {
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
    .filter(op => op.status !== 'PENDING')  // ✅ exclude pending
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

    // ✅ Only include handling time for processed operations
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

function CompletedSessionReport({ sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await api.get(`/trainer/sessions/${sessionId}/report`);
        setReport(response.data);
      } catch (err) {
        console.error('Failed to fetch report', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
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

  let grade = 'F';
  let gradeColor = 'text-red-500';
  if (accValue >= 95) { grade = 'S'; gradeColor = 'text-purple-400'; }
  else if (accValue >= 90) { grade = 'A'; gradeColor = 'text-emerald-400'; }
  else if (accValue >= 80) { grade = 'B'; gradeColor = 'text-blue-400'; }
  else if (accValue >= 70) { grade = 'C'; gradeColor = 'text-amber-400'; }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Overall Score" value={overallScore} suffix="/ 100" />
        <StatCard title="Accuracy" value={`${accValue.toFixed(1)}%`} />
        <StatCard title="Processed" value={`${completedOperations} / ${initialOperationsCount}`} />
        <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-center items-center backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="text-sm text-slate-400 mb-2 font-medium">Final Grade</span>
          <span className={`text-6xl font-black drop-shadow-lg ${gradeColor}`}>{grade}</span>
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
