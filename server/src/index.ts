/**
 * Hosn Obe game server.
 *
 * Exposes a health endpoint and a Socket.IO gateway for rooms: create/join by
 * code, seats, host controls, bots, ready/start. All state lives here
 * (authoritative); clients only send intents.
 */

import { createServer } from "node:http";

import cors from "cors";
import express from "express";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  RoomActionResult,
  RoomState,
  ServerToClientEvents,
} from "@hosn-obe/shared";

import { RoomError, RoomManager } from "./rooms.js";

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
  function leaveCurrent(): void {
    const room = rooms.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      broadcastRoom(room.code);
    }
  }

  /** Enter a room via create/join, replying through the (untrusted) ack. */
  function enter(ack: unknown, op: () => RoomActionResult): void {
    leaveCurrent();
    const result = op();
    if (result.ok) {
      socket.join(result.code);
      broadcastRoom(result.code);
    }
    if (typeof ack === "function") ack(result);
  }

  /** Apply a room mutation; broadcast on success, report rejections to the caller. */
  function mutate(op: () => RoomState): void {
    try {
      broadcastRoom(op().code);
    } catch (err) {
      if (!(err instanceof RoomError)) console.error(err);
      const message = err instanceof RoomError ? err.message : "Something went wrong.";
      socket.emit("room:error", { message });
    }
  }

  socket.on("room:create", (payload, ack) =>
    enter(ack, () => rooms.createRoom(socket.id, payload?.name, payload?.maxPlayers)),
  );
  socket.on("room:join", (payload, ack) =>
    enter(ack, () => rooms.joinRoom(socket.id, payload?.code, payload?.name)),
  );
  socket.on("room:leave", leaveCurrent);

  socket.on("room:setReady", (p) => mutate(() => rooms.setReady(socket.id, p?.ready)));
  socket.on("room:setMaxPlayers", (p) =>
    mutate(() => rooms.setMaxPlayers(socket.id, p?.maxPlayers)),
  );
  socket.on("room:addBot", (p) => mutate(() => rooms.addBot(socket.id, p?.seatIdx, p?.level)));
  socket.on("room:removeBot", (p) => mutate(() => rooms.removeBot(socket.id, p?.seatIdx)));
  socket.on("room:setBotLevel", (p) =>
    mutate(() => rooms.setBotLevel(socket.id, p?.seatIdx, p?.level)),
  );
  socket.on("room:kick", (p) =>
    mutate(() => {
      const { room, kickedId } = rooms.kick(socket.id, p?.seatIdx);
      const target = io.sockets.sockets.get(kickedId);
      target?.leave(room.code);
      target?.emit("room:closed", { reason: "You were removed by the host." });
      return room;
    }),
  );
  socket.on("room:start", () => mutate(() => rooms.start(socket.id)));
  socket.on("room:returnToLobby", () => mutate(() => rooms.returnToLobby(socket.id)));

  socket.on("disconnect", () => {
    const room = rooms.leaveRoom(socket.id);
    if (room) broadcastRoom(room.code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Hosn Obe server listening on http://localhost:${PORT}`);
});
