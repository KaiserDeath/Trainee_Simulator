import http from 'http';

import { Server } from 'socket.io';

import './config/loadEnv.js';
import app from './app.js';
import { supabase } from './config/supabase.js';
import GameMaster from './engine/GameMaster.js';
import { completeSession } from './engine/SessionEngine.js';
import { recoverActiveSessions } from './engine/sessionRecovery.js';
import {
  assertLocalE2EBackendEnvironment
} from './config/localE2EGuard.js';

if (
  process.env.TREZ_LOCAL_E2E !==
    undefined ||
  process.env
    .TREZ_E2E_DISABLE_RANDOM_OPERATIONS !==
    undefined
) {
  assertLocalE2EBackendEnvironment(
    process.env
  );
}

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || undefined;

/*
  Create HTTP server
*/
const server = http.createServer(app);

/*
  Initialize Socket.IO
*/
export const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      process.env.CLIENT_URL,
    ],
    credentials: true,
  },
});

/*
  Socket connection events
*/
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('disconnect', () => {
    console.log(
      'Socket disconnected:',
      socket.id
    );
  });
});

/*
  Start server
*/
server.listen(PORT, HOST, () => {
  console.log(
    `Server running on ${HOST || 'all interfaces'}:${PORT}`
  );

  let recovering = false;
  const recover = async () => {
    if (recovering) return;
    recovering = true;
    try {
      await recoverActiveSessions({ db: supabase, gameMaster: GameMaster, completeSession });
    } catch (error) {
      console.error('Session generation recovery failed; retrying in 30 seconds:', error);
    } finally {
      recovering = false;
    }
  };
  void recover();
  const recoveryTimer = setInterval(recover, 30000);
  recoveryTimer.unref();
  server.on('close', () => clearInterval(recoveryTimer));
});
