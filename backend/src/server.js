import http from 'http';

import { Server } from 'socket.io';

import './config/loadEnv.js';
import app from './app.js';

const PORT = process.env.PORT || 8080;

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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
