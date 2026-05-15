import { useState } from "react";

import SessionStartPage from "./pages/SessionStartPage";
import TrainerPage from "./pages/TrainerPage";
import OrionStarsPanel from "./components/games/OrionStarsPanel";
import GoldenDragonPanel from "./components/games/GoldenDragonPanel";

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
