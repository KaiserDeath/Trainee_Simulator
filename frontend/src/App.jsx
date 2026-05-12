import { useState } from "react";

import SessionStartPage from "./pages/SessionStartPage";
import TrainerPage from "./pages/TrainerPage";

export default function App() {
  const [session, setSession] =
    useState(null);

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