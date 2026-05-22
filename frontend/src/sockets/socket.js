import { io } from "socket.io-client";

const BACKEND_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

export const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket"],
  withCredentials: true,
});

export default socket;