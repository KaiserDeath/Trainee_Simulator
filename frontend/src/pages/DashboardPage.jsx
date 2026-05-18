import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

export default function DashboardPage() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await api.get('/trainer/sessions');
      setSessions(response.data);
      if (response.data.length > 0 && !selectedSession) {
        setSelectedSession(response.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // refresh list every 5s
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col h-full">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm">
            Instructor Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
            Casino Simulator Platform
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading && sessions.length === 0 ? (
            <div className="text-center text-slate-500 py-8 animate-pulse">Loading sessions...</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSession(s)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                  selectedSession?.id === s.id
                    ? 'bg-slate-800 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)] transform scale-[1.02]'
                    : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-slate-100 truncate pr-2">
                    {s.trainee_name || 'Unknown Trainee'}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      s.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'
                        : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {s.completed_at && ` - ${new Date(s.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full bg-[#0a0f18] relative overflow-hidden">
        {/* Background glow effects */}
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
              </div>
              
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
            </header>

            {selectedSession.status === 'active' ? (
              <LiveSessionView sessionId={selectedSession.id} />
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

  if (loading) {
    return <div className="text-slate-500 animate-pulse mt-8">Generating performance report...</div>;
  }

  if (!report) {
    return <div className="text-red-400 mt-8 bg-red-500/10 p-4 rounded-xl border border-red-500/20">Failed to load report data.</div>;
  }

  const { overallScore, accuracy, completedOperations, initialOperationsCount } = report;
  
  // Calculate a grade
  let grade = 'F';
  let gradeColor = 'text-red-500';
  if (accuracy >= 95) { grade = 'S'; gradeColor = 'text-purple-400'; }
  else if (accuracy >= 90) { grade = 'A'; gradeColor = 'text-emerald-400'; }
  else if (accuracy >= 80) { grade = 'B'; gradeColor = 'text-blue-400'; }
  else if (accuracy >= 70) { grade = 'C'; gradeColor = 'text-amber-400'; }

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Top Level Stats */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Overall Score" value={overallScore} suffix="/ 100" />
        <StatCard title="Accuracy" value={`${accuracy.toFixed(1)}%`} />
        <StatCard title="Processed" value={`${completedOperations} / ${initialOperationsCount}`} />
        <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex flex-col justify-center items-center backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="text-sm text-slate-400 mb-2 font-medium">Final Grade</span>
          <span className={`text-6xl font-black drop-shadow-lg ${gradeColor}`}>{grade}</span>
        </div>
      </div>
      
      {/* Detailed Operations Report */}
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
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium text-right">Target</th>
                <th className="px-6 py-4 font-medium text-right">Actual</th>
                <th className="px-6 py-4 font-medium text-center">Result</th>
                <th className="px-6 py-4 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50 bg-slate-900/20">
              {report.operations?.map((op, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {new Date(op.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-300 font-medium">{op.type}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{op.customerName}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-300">
                    ${op.targetBalance?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    <span className={op.status === 'success' ? 'text-emerald-400' : op.status === 'pending' ? 'text-slate-500' : 'text-red-400'}>
                      ${op.actualBalance?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {op.status === 'success' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓</span>}
                    {op.status === 'failed' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">✗</span>}
                    {op.status === 'pending' && <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs border border-slate-700">⌛</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">
                    <span className={op.score > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                      +{op.score}
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