import { useCallback, useEffect, useState } from 'react';

import api, { submitSession } from '../api/client';
import MainLayout from '../components/layout/MainLayout';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import OperationsQueue from '../components/operations/OperationsQueue';
import PerformancePanel from '../components/performance/PerformancePanel';
import CustomerPanel from '../components/customers/CustomerPanel';
import GamesLauncher from '../components/games/GamesLauncher';


export default function TraineeDashboard({ session, onSessionEnded }) {
  const [activeView, setActiveView] = useState('operations');
  const [sessionState, setSessionState] = useState(session);
  const [sessionReport, setSessionReport] = useState(null);

  // ── OPTIMIZED: MEMOIZED SELECTION CLEANUP UPON NAV VIEW NAVIGATION ──
  const handleViewChange = useCallback((newView) => {
    setActiveView(newView);
    try {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    } catch (err) {
      console.error('Failed to clear DOM text ranges safely:', err);
    }
  }, []);

  const handleMissingSession = useCallback(() => {
    onSessionEnded();
  }, [onSessionEnded]);

  const fetchSessionState = useCallback(async () => {
    try {
      const response = await api.get(
        `/sessions/${session.id}`
      );
      setSessionState(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        handleMissingSession();
        return;
      }

      console.error('Failed to refresh session state', err);
    }
  }, [handleMissingSession, session.id]);

  const fetchSessionReport = useCallback(async () => {
    try {
      const response = await api.get(
        `/trainer/sessions/${session.id}/report`
      );
      setSessionReport(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        handleMissingSession();
        return;
      }

      console.error('Failed to load session report', err);
    }
  }, [handleMissingSession, session.id]);

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      if (!mounted) return;
      await fetchSessionState();
    }

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchSessionState]);

  useEffect(() => {
    let mounted = true;

    async function loadReport() {
      if (!mounted) return;
      await fetchSessionReport();
    }

    if (
      sessionState?.status &&
      sessionState.status !== 'active'
    ) {
      loadReport();
    }

    return () => {
      mounted = false;
    };
  }, [sessionState?.status, fetchSessionReport]);

  const isSessionClosed =
    sessionState?.status !== 'active';

  const handleSubmitSession = async () => {
    try {
      await submitSession(sessionState.id);
    } catch (err) {
      console.error('Failed to submit session for evaluation', err);
      alert('Unable to submit session for evaluation. Please try again.');
      return;
    }

    onSessionEnded();
  };

  return (
    <>
      <MainLayout
        sidebar={
          <Sidebar
            activeView={activeView}
            onViewChange={handleViewChange} // Safe, stable reference
          />
        }
        header={
          <Header
            session={sessionState}
            traineeName={sessionState?.trainee_name}
            onSessionEnded={onSessionEnded}
            onRefreshSession={fetchSessionState}
          />
        }
      >
        {activeView === 'operations' && (
          <div className="grid grid-cols-6 gap-6">
            <div className="col-span-5 bg-white rounded-2xl shadow p-5">
              <h3 className="text-lg font-semibold mb-4">Live Operations Queue</h3>
              <OperationsQueue
                session={sessionState}
                isSessionClosed={isSessionClosed}
                onSessionMissing={handleMissingSession}
              />
            </div>
            <div className="bg-white rounded-2xl shadow p-5">
              <PerformancePanel
                session={sessionState}
                onSessionMissing={handleMissingSession}
              />
            </div>
          </div>
        )}

        {activeView === 'customers' && (
          <CustomerPanel session={sessionState} />
        )}

        {activeView === 'games' && (
          <GamesLauncher session={sessionState} />
        )}

        {activeView === 'reports' && (
          <div className="bg-white rounded-2xl shadow p-5">
            <PerformancePanel
              session={sessionState}
              onSessionMissing={handleMissingSession}
            />
          </div>
        )}
      </MainLayout>

      {isSessionClosed && (
        <SessionCompleteOverlay
          session={sessionState}
          report={sessionReport}
          onSubmit={handleSubmitSession}
          onRetry={onSessionEnded}
        />
      )}
    </>
  );
}

function SessionCompleteOverlay({
  session,
  report,
  onSubmit,
  onRetry
}) {
  const minutes =
    session?.started_at && session?.ended_at
      ? Math.max(
          1,
          Math.round(
            (new Date(session.ended_at).getTime() -
              new Date(session.started_at).getTime()) /
              60000
          )
        )
      : 0;

  const accuracy =
    report?.performance?.accuracy ?? 0;
  const completed =
    report?.performance?.completedOperations ?? 0;
  const pending =
    report?.performance?.pendingOperations ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4 py-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-4xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-3xl text-white ring-1 ring-white/10 transition-transform duration-500">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300 text-3xl">
            ✓
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">
              Session Complete
            </p>
            <h2 className="text-3xl font-semibold text-white">
              Great work! You finished the module.
            </h2>
          </div>
        </div>

        <p className="mb-8 max-w-2xl text-slate-200">
          Your session is now complete. Review the summary below, then submit your results or retry the simulator.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-sm text-slate-300">Accuracy</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {accuracy}%
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-sm text-slate-300">Time Logged</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {minutes} min
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-sm text-slate-300">Resolved</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {completed}
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-slate-900/70 p-4 text-slate-300">
          <p className="text-sm">
            Pending operations have been frozen. You may now submit your final results or try the simulation again.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {pending > 0 && `Note: ${pending} pending items were locked when the session closed.`}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <button
              type="button"
              onClick={onSubmit}
              className="w-full rounded-2xl bg-cyan-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 sm:w-auto"
            >
              Submit for evaluation
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="w-full rounded-2xl border border-slate-600 bg-slate-900/80 px-6 py-3 text-base font-semibold text-white transition hover:border-slate-400 sm:w-auto"
            >
              Retry Session
            </button>
          </div>
          <div className="text-sm text-slate-300">
            Review detailed metrics in the reports tab anytime.
          </div>
        </div>
      </div>
    </div>
  );
}