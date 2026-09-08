import { lazy, Suspense, useState, useEffect } from "react";

import SessionStartPage from "./pages/SessionStartPage";
import { SIM_BASE, isHubPath, syncLocation, toSimulatorPath } from "./routes";

const TraineeDashboard = lazy(() => import('./pages/TraineeDashboard'));
const TrainerDashboard = lazy(() => import('./pages/DashboardPage'));
const OrionStarsPanel = lazy(() => import('./components/games/OrionStarsPanel'));
const GoldenDragonPanel = lazy(() => import('./components/games/GoldenDragonPanel'));
const VblinkPanel = lazy(() => import('./components/games/VblinkPanel'));
const HubPage = lazy(() => import('./pages/HubPage'));

const SESSION_KEY = "casino_trainer_session";

// 🔑 Set your custom developer password here:
const DEV_TRAINER_PASSWORD = "superctrl2023";

function getDocumentTitle(path) {
  if (isHubPath(path)) {
    return 'Trez Training Hub';
  }

  const simPath = toSimulatorPath(path) ?? path;

  if (/^\/games\/orion-stars\/[^/]+$/.test(simPath)) {
    return 'Orion Stars';
  }

  if (/^\/games\/vblink\/[^/]+$/.test(simPath)) {
    return 'Vblink';
  }

  if (/^\/games\/golden-dragon\/[^/]+$/.test(simPath)) {
    return 'Golden Dragon';
  }

  if (simPath === '/trainer') {
    return 'Trez Trainer Dashboard';
  }

  return 'Trez Operator Simulator';
}

export default function App() {
  // ⚡ Keep track of the path in a state variable so React re-renders when it shifts
  const [currentPath, setCurrentPath] = useState(syncLocation);
  const hubEnabled = import.meta.env.VITE_TREZ_HUB_ENABLED === 'true';
  const onHubPath = isHubPath(currentPath);
  const isHubRoute = hubEnabled && onHubPath;
  const simPath = toSimulatorPath(currentPath);

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

    let active = true;
    let connectedSocket;
    const handleConnect = () => {
      console.log('Socket connected:', connectedSocket?.id);
    };

    const connectSocket = async () => {
      const { default: socket } = await import('./sockets/socket');
      if (!active) return;

      connectedSocket = socket;
      connectedSocket.connect();
      connectedSocket.on('connect', handleConnect);
    };

    connectSocket();

    return () => {
      active = false;
      if (connectedSocket) {
        connectedSocket.off('connect', handleConnect);
        connectedSocket.disconnect();
      }
    };
  }, [isHubRoute]);

  useEffect(() => {
    document.title = getDocumentTitle(currentPath);
  }, [currentPath]);

  // Listen to popstate events (when browser back/forward buttons or pushState triggers occur)
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(syncLocation());
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
  const routePath = simPath ?? '/';
  const gameMatch = routePath.match(/^\/games\/orion-stars\/([^/]+)$/);
  const goldenDragonMatch = routePath.match(/^\/games\/golden-dragon\/([^/]+)$/);
  const vblinkMatch = routePath.match(/^\/games\/vblink\/([^/]+)$/);
  const isTrainer = routePath === "/trainer";

  if (isHubRoute) return <Suspense fallback={<p>Loading Trez Training Hub...</p>}><HubPage /></Suspense>;

  if (gameMatch) return <Suspense fallback={<p>Loading Orion Stars...</p>}><OrionStarsPanel session={session} sessionId={gameMatch[1]} /></Suspense>;
  if (goldenDragonMatch) return <Suspense fallback={<p>Loading Golden Dragon...</p>}><GoldenDragonPanel session={session} sessionId={goldenDragonMatch[1]} /></Suspense>;
  if (vblinkMatch) return <Suspense fallback={<p>Loading Vblink...</p>}><VblinkPanel session={session} sessionId={vblinkMatch[1]} /></Suspense>;
  
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
        window.history.replaceState({}, '', SIM_BASE);
        setTimeout(() => setCurrentPath(SIM_BASE), 0);
        return <SessionStartPage onSessionCreated={handleSessionCreated} />;
      }
    }
    
    return <Suspense fallback={<p>Loading trainer dashboard...</p>}><TrainerDashboard /></Suspense>;
  }

  if (!session) {
    return <SessionStartPage onSessionCreated={handleSessionCreated} />;
  }

  return <Suspense fallback={<p>Loading simulator...</p>}><TraineeDashboard session={session} onSessionEnded={handleSessionEnded} /></Suspense>;
}
