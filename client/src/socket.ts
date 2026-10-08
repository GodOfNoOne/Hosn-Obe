import { io, type Socket } from "socket.io-client"

import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@hosn-obe/shared"

const url = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000"

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  url,
  {
    autoConnect: true,
    auth: { protocol: PROTOCOL_VERSION },
    // Skips ngrok's free-tier browser warning page; ignored by other hosts.
    extraHeaders: { "ngrok-skip-browser-warning": "1" },
  },
)
