import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@hosn-obe/shared";

const url = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  url,
  { autoConnect: true },
);
