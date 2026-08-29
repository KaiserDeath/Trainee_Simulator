import { useState, useEffect } from "react";
import socket from './sockets/socket';

import SessionStartPage from "./pages/SessionStartPage";
import TraineeDashboard from "./pages/TraineeDashboard";   // renamed from TrainerPage
import TrainerDashboard from "./pages/DashboardPage";     // renamed alias for clarity
import OrionStarsPanel from "./components/games/OrionStarsPanel";
import GoldenDragonPanel from "./components/games/GoldenDragonPanel";
import VblinkPanel from "./components/games/VblinkPanel";
import HubPage from "./pages/HubPage";

const SESSION_KEY = "casino_trainer_session";

// 🔑 Set your custom developer password here:
const DEV_TRAINER_PASSWORD = "superctrl2023";

function getDocumentTitle(path) {
  if (/^\/games\/orion-stars\/[^/]+$/.test(path)) {
    return 'Orion Stars';
  }

  if (/^\/games\/vblink\/[^/]+$/.test(path)) {
    return 'Vblink';
  }

  if (/^\/games\/golden-dragon\/[^/]+$/.test(path)) {
    return 'Golden Dragon';
  }

  if (path === '/hub' || path.startsWith('/hub/')) {
    return 'Trez Training Hub';
  }

  if (path === '/trainer') {
    return 'Trez Trainer Dashboard';
  }

  return 'Trez Operator Simulator';
}

export default function App() {
  // ⚡ Keep track of the path in a state variable so React re-renders when it shifts
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const hubEnabled = import.meta.env.VITE_TREZ_HUB_ENABLED === 'true';
  const isHubRoute = hubEnabled && (currentPath === '/hub' || currentPath.startsWith('/hub/'));

  // Restore session from localStorage on first load
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (isHubRoute) return undefined;

    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
    };

    socket.connect();
    socket.on('connect', handleConnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.disconnect();
    };
  }, [isHubRoute]);

  useEffect(() => {
    document.title = getDocumentTitle(currentPath);
  }, [currentPath]);

  // Listen to popstate events (when browser back/forward buttons or pushState triggers occur)
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('locationchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('locationchange', handleLocationChange);
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
  const gameMatch = currentPath.match(/^\/games\/orion-stars\/([^/]+)$/);
  const goldenDragonMatch = currentPath.match(/^\/games\/golden-dragon\/([^/]+)$/);
  const vblinkMatch = currentPath.match(/^\/games\/vblink\/([^/]+)$/);
  const isTrainer = currentPath === "/trainer";

  if (isHubRoute) return <HubPage />;

  if (gameMatch) return <OrionStarsPanel session={session} sessionId={gameMatch[1]} />;
  if (goldenDragonMatch) return <GoldenDragonPanel session={session} sessionId={goldenDragonMatch[1]} />;
  if (vblinkMatch) return <VblinkPanel session={session} sessionId={vblinkMatch[1]} />;
  
  // 🔒 Secure the trainer view utilizing your protection layer
  if (isTrainer) {
    // Read the current storage state directly
    const hasToken = localStorage.getItem('token');
    
    // 🔐 INTERACTIVE PROMPT CHALLENGE WHEN VISITING THE /trainer LINK
    if (!hasToken) {
      const userInput = window.prompt("🔐 Enter Trainer Access Password:");
      
      if (userInput === DEV_TRAINER_PASSWORD) {
        // Correct Password! Plant token badge to log them in for future visits
        localStorage.setItem('token', 'allow_trainer_access');
      } else {
        // Wrong password or canceled! Boot them back to the landing screen safely
        alert("❌ Unauthorized Access Denied.");
        window.history.replaceState({}, '', '/');
        setTimeout(() => setCurrentPath('/'), 0);
        return <SessionStartPage onSessionCreated={handleSessionCreated} />;
      }
    }
    
    return <TrainerDashboard />;
  }

  if (!session) {
    return <SessionStartPage onSessionCreated={handleSessionCreated} />;
  }

  return <TraineeDashboard session={session} onSessionEnded={handleSessionEnded} />;
}
