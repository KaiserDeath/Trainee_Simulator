import { useState, useEffect, useCallback, useMemo } from 'react';
import api, { deleteSession as deleteSessionApi } from '../api/client';
import AuditLogPanel from '../components/audit/AuditLogPanel';

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
  const [viewMode, setViewMode] = useState('live'); // 'live', 'report', 'audit'
  const [traineeSearch, setTraineeSearch] = useState('');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(() => {
    const saved = localStorage.getItem('sessionTimeoutMinutes');
    return saved ? Number(saved) : 30;
  });

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
    localStorage.setItem(
      'sessionTimeoutMinutes',
      String(sessionTimeoutMinutes)
    );
  }, [sessionTimeoutMinutes]);

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
        
        <div className="p-4 border-b border-slate-800/50 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-semibold">
              Session settings
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={sessionTimeoutMinutes}
                onChange={(event) =>
                  setSessionTimeoutMinutes(
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
              This value is saved locally and applies to new sessions.
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
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full bg-[#0a0f18] relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        {selectedSession ? (
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

function LiveSessionView({ sessionId }) {
  const [operations, setOperations] = useState([]);

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
          operations.map((op) => (
            <div key={op.id} className="bg-slate-800/40 border border-slate-700/50 p-5 rounded-2xl backdrop-blur-sm shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${
                    op.type === 'ADD' ? 'bg-blue-500/20 text-blue-400' :
                    op.type === 'WITHDRAW' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}>
                    {op.type}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {new Date(op.created_at).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="mb-2">
                  <div className="text-sm text-slate-400 mb-1">Customer</div>
                  <div className="font-semibold text-slate-200">{op.customer_name}</div>
                </div>
                
                {op.amount && (
                  <div>
                    <div className="text-sm text-slate-400 mb-1">Amount</div>
                    <div className="font-semibold text-white text-lg">${op.amount}</div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
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

  const formatRequestDetails = (op) => {
    const requestData =
      op.requestData ||
      op.request_data ||
      op.requestPayload ||
      op.submitted_data;

    if (requestData) {
      let parsed = requestData;

      if (typeof requestData === 'string') {
        try {
          parsed = JSON.parse(requestData);
        } catch {
          return requestData;
        }
      }

      if (typeof parsed === 'object') {
        const entries = Object.entries(parsed).map(([key, value]) => {
          if (key === 'newPassword' || key === 'password') {
            return `${key}: ${value ?? ''}`;
          }
          if (key === 'amount') {
            return `Entered amount: $${Number(value || 0).toFixed(2)}`;
          }
          return `${key}: ${value ?? ''}`;
        });

        if (op.amount != null && parsed.amount != null) {
          const expected = Number(op.amount || 0);
          const entered = Number(parsed.amount || 0);
          if (expected !== entered) {
            entries.push(`Expected: $${expected.toFixed(2)}`);
            entries.push(`Actual entered: $${entered.toFixed(2)}`);
          }
        }

        return entries.join(' • ');
      }
    }

    if (op.newPassword || op.password) {
      return `Password: ${op.newPassword || op.password}`;
    }

    if (op.type === 'REFRESH BALANCE' && op.amount != null) {
      return `Requested: $${op.amount}`;
    }

    return 'N/A';
  };

  const getBalanceDifference = (op) => {
    if (op.targetBalance == null || op.actualBalance == null) {
      return null;
    }

    const target = Number(op.targetBalance || 0);
    const actual = Number(op.actualBalance || 0);
    const diff = actual - target;

    if (diff === 0) {
      return 'No difference';
    }

    return `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`;
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
                <th className="px-6 py-4 font-medium text-right">Target</th>
                <th className="px-6 py-4 font-medium text-right">Actual</th>
                <th className="px-6 py-4 font-medium text-left">Input / Notes</th>
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
                  <td className="px-6 py-4 text-slate-400">{op.customerName}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-300">
                    ${(op.targetBalance || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    <span className={op.status === 'success' ? 'text-emerald-400' : op.status === 'pending' ? 'text-slate-500' : 'text-red-400'}>
                      ${(op.actualBalance || 0).toFixed(2)}
                    </span>
                    {getBalanceDifference(op) && (
                      <div className="text-xs text-slate-400 mt-1">
                        Diff: {getBalanceDifference(op)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-left text-slate-300 text-sm">
                    {formatRequestDetails(op)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {op.status === 'success' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓</span>}
                    {op.status === 'failed' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">✗</span>}
                    {op.status === 'pending' && <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs border border-slate-700">⌛</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">
                    <span className={op.score > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                      +{op.score || 0}
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

function StatCard({ title, value, suffix = '' }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-between backdrop-blur-sm relative overflow-hidden group hover:border-slate-600 transition-colors">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-colors" />
      <span className="text-sm text-slate-400 mb-2 font-medium z-10">{title}</span>
      <div className="z-10">
        <span className="text-3xl font-bold text-white">{value}</span>
        {suffix && <span className="text-slate-500 ml-1 font-medium">{suffix}</span>}
      </div>
    </div>
  );
}