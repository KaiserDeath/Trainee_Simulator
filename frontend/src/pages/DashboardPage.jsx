import { useState, useEffect, useCallback, useMemo } from 'react';
import api, {
  deleteSession as deleteSessionApi,
  getOperationTimeStats,
  getSimulatorSettings,
  updateSimulatorSettings
} from '../api/client';
import AuditLogPanel from '../components/audit/AuditLogPanel';
import CompletedSessionReport from '../components/dashboard/CompletedSessionReport';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import GlobalOperationStatistics from '../components/dashboard/GlobalOperationStatistics';
import LiveSessionView from '../components/dashboard/LiveSessionView';
import SessionStatisticsView from '../components/dashboard/SessionStatisticsView';
import TraineesDirectory from '../components/dashboard/TraineesDirectory';
import socket from '../sockets/socket';

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

      if (
        selectedSession &&
        !sessionList.some((s) => s.id === selectedSession.id)
      ) {
        setSelectedSession(null);
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
      <DashboardSidebar
        activeSessionCount={activeSessionCount}
        allSelected={allSelected}
        dashboardSection={dashboardSection}
        deleteSelectedSessions={deleteSelectedSessions}
        filteredSessions={filteredSessions}
        handleMaxOpmChange={handleMaxOpmChange}
        handleMinOpmChange={handleMinOpmChange}
        handleTimeoutChange={handleTimeoutChange}
        loading={loading}
        maxOpm={maxOpm}
        minOpm={minOpm}
        operationTimeStats={operationTimeStats}
        saveStatus={saveStatus}
        selectedSession={selectedSession}
        selectedSessionIds={selectedSessionIds}
        sessionTimeoutMinutes={sessionTimeoutMinutes}
        sessions={sessions}
        setDashboardSection={setDashboardSection}
        setSelectedSession={setSelectedSession}
        setTraineeSearch={setTraineeSearch}
        sidebarMaxAverage={sidebarMaxAverage}
        sidebarOperationRows={sidebarOperationRows}
        sidebarTopOperation={sidebarTopOperation}
        toggleSelectAll={toggleSelectAll}
        toggleSessionSelection={toggleSessionSelection}
        traineeSearch={traineeSearch}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full bg-[#0a0f18] relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        {dashboardSection === 'statistics' ? (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <GlobalOperationStatistics />
          </div>
        ) : selectedSession ? (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <header className="mb-8 flex justify-between items-end border-b border-slate-800/50 pb-6">
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="mb-4 inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-800"
                >
                  All Trainees
                </button>
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
              <LiveSessionView key={selectedSession.id} sessionId={selectedSession.id} />
            ) : effectiveViewMode === 'audit' ? (
              <AuditLogPanel key={selectedSession.id} sessionId={selectedSession.id} />
            ) : effectiveViewMode === 'session-statistics' ? (
              <SessionStatisticsView key={selectedSession.id} sessionId={selectedSession.id} />
            ) : (
              <CompletedSessionReport key={selectedSession.id} sessionId={selectedSession.id} />
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <TraineesDirectory
              allSelected={allSelected}
              deleteSelectedSessions={deleteSelectedSessions}
              filteredSessions={filteredSessions}
              loading={loading}
              selectedSessionIds={selectedSessionIds}
              setSelectedSession={setSelectedSession}
              toggleSelectAll={toggleSelectAll}
              toggleSessionSelection={toggleSessionSelection}
              traineeSearch={traineeSearch}
            />
          </div>
        )}
      </main>
    </div>
  );
}

