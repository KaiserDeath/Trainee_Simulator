import { useState } from "react";

import SessionStartPage from "./pages/SessionStartPage";
import TrainerPage from "./pages/TrainerPage";
import DashboardPage from "./pages/DashboardPage";
import OrionStarsPanel from "./components/games/OrionStarsPanel";
import GoldenDragonPanel from "./components/games/GoldenDragonPanel";
import VblinkPanel from "./components/games/VblinkPanel";

export default function App() {
  const [session, setSession] =
    useState(null);

  const gameMatch =
    window.location.pathname.match(
      /^\/games\/orion-stars\/([^/]+)$/
    );

  const goldenDragonMatch =
    window.location.pathname.match(
      /^\/games\/golden-dragon\/([^/]+)$/
    );

  const vblinkMatch =
    window.location.pathname.match(
      /^\/games\/vblink\/([^/]+)$/
    );

  const isTrainer =
    window.location.pathname === "/trainer";

  if (gameMatch) {
    return (
      <OrionStarsPanel
        sessionId={gameMatch[1]}
      />
    );
  }

  if (goldenDragonMatch) {
    return (
      <GoldenDragonPanel
        sessionId={goldenDragonMatch[1]}
      />
    );
  }

  if (vblinkMatch) {
    return (
      <VblinkPanel
        sessionId={vblinkMatch[1]}
      />
    );
  }

  if (isTrainer) {
    return <DashboardPage />;
  }

  if (!session) {
    return (
      <SessionStartPage
        onSessionCreated={setSession}
      />
    );
  }

  return (
    <TrainerPage session={session} />
  );
}
