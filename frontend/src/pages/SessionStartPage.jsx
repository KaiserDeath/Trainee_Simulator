import { useState, useEffect } from "react";
import client, { getSimulatorSettings } from "../api/client";

export default function SessionStartPage({ onSessionCreated }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);

  useEffect(() => {
    const fetchDuration = async () => {
      try {
        const response = await getSimulatorSettings();
        if (response.data && response.data.sessionTimeoutMinutes !== undefined) {
          setSessionDurationMinutes(response.data.sessionTimeoutMinutes);
        }
      } catch (err) {
        console.error("Failed to load global session duration from backend", err);
      }
    };
    fetchDuration();
  }, []);

  // Step 1 — fill name
  const handleConfirmName = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    setError("");
    setConfirmed(true);
  };

  // Step 2 — start simulation
  const handleStartSimulation = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await client.post("/sessions/start", {
        traineeName: `${firstName.trim()} ${lastName.trim()}`,
        durationMinutes: sessionDurationMinutes,
      });
      onSessionCreated(response.data.session);
    } catch (err) {
      console.error(err);
      setError("Failed to start session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-700">
          {/* 🧼 Cleaned Header: Click bypass mechanics completely removed */}
          <h1 className="text-2xl font-bold text-white select-none">
            Simulador DOS
          </h1>
          <p className="text-slate-400 text-sm mt-1">Backoffice Operator Training</p>
        </div>

        <div className="px-8 py-8 space-y-5">

          {!confirmed ? (
            /* ── Step 1: Enter name ── */
            <>
              <p className="text-slate-300 text-sm font-medium">Enter your name to continue:</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmName()}
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmName()}
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition placeholder:text-slate-500"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                onClick={handleConfirmName}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition text-sm"
              >
                Continue →
              </button>
            </>
          ) : (
            /* ── Step 2: Confirm and start ── */
            <>
              <div className="bg-slate-700/50 rounded-xl px-5 py-4 border border-slate-600">
                <p className="text-xs text-slate-400 mb-1">Operator</p>
                <p className="text-white font-semibold text-lg">
                  {firstName} {lastName}
                </p>
              </div>

              <div className="bg-slate-700/30 rounded-xl px-5 py-4 border border-slate-600 space-y-1.5 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">⏱</span>
                  <span>Session duration: <span className="font-semibold text-white">{sessionDurationMinutes} minutes</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">⚡</span>
                  <span>Operations will be generated automatically</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400">🎯</span>
                  <span>Target accuracy: <span className="font-semibold text-white">85%</span> to pass</span>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setConfirmed(false); setError(""); }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-2.5 rounded-lg transition text-sm"
                >
                  ← Back
                </button>
                <button
                  onClick={handleStartSimulation}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm"
                >
                  {loading ? "Starting..." : "▶ Start Simulation"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}