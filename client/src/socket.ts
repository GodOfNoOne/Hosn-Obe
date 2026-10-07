import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@hosn-obe/shared";

import { loadServerUrl } from "./session.js";

export const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  loadServerUrl() ?? DEFAULT_SERVER_URL,
  { autoConnect: true },
);
