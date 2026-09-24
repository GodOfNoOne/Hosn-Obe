/**
 * Hosn Obe game server — Phase 1 "hello room".
 *
 * Exposes a health endpoint and a Socket.IO gateway for creating/joining
 * rooms and syncing the seat list. All game state lives here (authoritative);
 * clients only send intents.
 */

import { createServer } from "node:http";

import cors from "cors";
import express from "express";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@hosn-obe/shared";

import { RoomManager } from "./rooms.js";

const PORT = Number(process.env.PORT) || 3000;
// Comma-separated allowlist; "*" (default) is fine for local dev only.
const ORIGIN = process.env.CLIENT_ORIGIN ?? "*";
const corsOrigin = ORIGIN === "*" ? "*" : ORIGIN.split(",").map((o) => o.trim());

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin },
});

const rooms = new RoomManager();

/** Push the current room state to everyone seated in it. */
function broadcastRoom(code: string): void {
  const room = rooms.getRoom(code);
  if (room) io.to(code).emit("room:state", rooms.toState(room));
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack) => {
    const result = rooms.createRoom(socket.id, payload?.name, payload?.maxPlayers);
    if (result.ok) {
      socket.join(result.code);
      broadcastRoom(result.code);
    }
    ack?.(result);
  });

  socket.on("room:join", (payload, ack) => {
    const result = rooms.joinRoom(socket.id, payload?.code, payload?.name);
    if (result.ok) {
      socket.join(result.code);
      broadcastRoom(result.code);
    }
    ack?.(result);
  });

  socket.on("room:leave", () => {
    const room = rooms.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      broadcastRoom(room.code);
    }
  });

  socket.on("disconnect", () => {
    const room = rooms.leaveRoom(socket.id);
    if (room) broadcastRoom(room.code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Hosn Obe server listening on http://localhost:${PORT}`);
});
