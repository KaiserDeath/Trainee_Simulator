import { useState } from "react";

import SessionStartPage from "./pages/SessionStartPage";
import TrainerPage from "./pages/TrainerPage";
import OrionStarsPanel from "./components/games/OrionStarsPanel";

export default function App() {
  const [session, setSession] =
    useState(null);

  const gameMatch =
    window.location.pathname.match(
      /^\/games\/orion-stars\/([^/]+)$/
    );

  if (gameMatch) {
    return (
      <OrionStarsPanel
        sessionId={gameMatch[1]}
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
