import { io } from "socket.io-client";

const BACKEND_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

export const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket"],
  withCredentials: true,
  path: import.meta.env.PROD || import.meta.env.VITE_TREZ_AUTH_REQUIRED === 'true' ? '/api/realtime' : '/socket.io',
});

export default socket;
