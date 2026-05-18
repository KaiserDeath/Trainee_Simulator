import { useState } from "react";
import client from "../../api/client";

export default function Header({ session, traineeName, onSessionEnded }) {
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);

  const handleEndClick = () => setConfirming(true);
  const handleCancel = () => setConfirming(false);

  const handleConfirmEnd = async () => {
    try {
      setEnding(true);
      await client.post(`/sessions/${session.id}/stop`);
    } catch (err) {
      console.error("Failed to stop session:", err);
      // Even if API fails, clear session locally
    } finally {
      setEnding(false);
      setConfirming(false);
      onSessionEnded();
    }
  };

  return (
    <>
      <div className="w-full flex items-center justify-between">
        {/* Left: title */}
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Operations Dashboard</h2>
          <p className="text-sm text-slate-500">Live Training Session</p>
        </div>

        {/* Right: trainee info + end button */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow text-sm font-medium">
            Operator: {traineeName || session?.trainee_name || "—"}
          </div>

          <button
            onClick={handleEndClick}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition"
          >
            <span>⏹</span> End Simulation
          </button>
        </div>
      </div>

      {/* Confirmation overlay */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-3">⏹</div>
              <h3 className="text-lg font-bold text-slate-800">End Simulation?</h3>
              <p className="text-sm text-slate-500 mt-1">
                This will end your session early and submit your results. This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={ending}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 rounded-lg transition text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEnd}
                disabled={ending}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm"
              >
                {ending ? "Ending..." : "Yes, End Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
