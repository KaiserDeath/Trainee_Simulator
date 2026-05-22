import { useState, useEffect } from "react";
import socket from './sockets/socket';

import SessionStartPage from "./pages/SessionStartPage";
import TrainerPage from "./pages/TrainerPage";
import DashboardPage from "./pages/DashboardPage";
import OrionStarsPanel from "./components/games/OrionStarsPanel";
import GoldenDragonPanel from "./components/games/GoldenDragonPanel";
import VblinkPanel from "./components/games/VblinkPanel";

const SESSION_KEY = "casino_trainer_session";

export default function App() {
  // Try to restore session from localStorage on first load
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Persist session to localStorage whenever it changes
  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }

    window.dispatchEvent(
      new CustomEvent('casino_trainer_session_update', {
        detail: session || null
      })
    );
  }, [session]);

  const handleSessionCreated = (newSession) => {
    setSession(newSession);
  };

  const handleSessionEnded = () => {
    setSession(null);
  };

  // ── Route matching ──────────────────────────────────────────────────────────
  const path = window.location.pathname;

  const gameMatch = path.match(/^\/games\/orion-stars\/([^/]+)$/);
  const goldenDragonMatch = path.match(/^\/games\/golden-dragon\/([^/]+)$/);
  const vblinkMatch = path.match(/^\/games\/vblink\/([^/]+)$/);
  const isTrainer = path === "/trainer";

  if (gameMatch) return <OrionStarsPanel session={session} sessionId={gameMatch[1]} />;
  if (goldenDragonMatch) return <GoldenDragonPanel session={session} sessionId={goldenDragonMatch[1]} />;
  if (vblinkMatch) return <VblinkPanel session={session} sessionId={vblinkMatch[1]} />;
  if (isTrainer) return <DashboardPage />;

  if (!session) {
    return (
      <SessionStartPage onSessionCreated={handleSessionCreated} />
    );
  }

  return (
    <TrainerPage
      session={session}
      onSessionEnded={handleSessionEnded}
    />
  );
}
