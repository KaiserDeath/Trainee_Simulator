import { useState } from "react";
import client from "../api/client";

export default function SessionStartPage({
  onSessionCreated,
}) {
  const [traineeName, setTraineeName] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const handleStart = async () => {
    if (!traineeName) return;

    try {
      setLoading(true);

      const response = await client.post(
        "/sessions/start",
        {
          traineeName,
        }
      );

      onSessionCreated(
        response.data.session
      );

    } catch (err) {
      console.error(err);
      alert("Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 p-8 rounded-xl w-[400px]">
        <h1 className="text-3xl font-bold text-white mb-6">
          Simulador DOS
        </h1>

        <p className="text-slate-400 mb-4">
          Start Training Session
        </p>

        <input
          type="text"
          placeholder="Trainee Name"
          value={traineeName}
          onChange={e =>
            setTraineeName(e.target.value)
          }
          className="w-full p-3 rounded bg-slate-700 text-white mb-4 outline-none"
        />

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 transition p-3 rounded font-semibold"
        >
          {loading
            ? "Starting..."
            : "Start Session"}
        </button>
      </div>
    </div>
  );
}