/**
 * Hosn Obe game server.
 *
 * Exposes a health endpoint and a Socket.IO gateway for rooms (create/join by
 * code, seats, host controls, bots, ready/start, resume) and gameplay. All
 * state lives here (authoritative); clients only send intents and receive a
 * view personalized to their seat.
 */

import { createServer } from "node:http"

import cors from "cors"
import express from "express"
import { Server } from "socket.io"

import {
  GameError,
  type ClientToServerEvents,
  type RoomActionResult,
  type RoomState,
  type ServerToClientEvents,
} from "@hosn-obe/shared"

import { log } from "./log.js"
import { RoomError, RoomManager } from "./rooms.js"

const PORT = Number(process.env.PORT) || 3000
// Comma-separated allowlist; "*" (default) is fine for local dev only.
const ORIGIN = process.env.CLIENT_ORIGIN ?? "*"
const corsOrigin = ORIGIN === "*" ? "*" : ORIGIN.split(",").map((o) => o.trim())
/** How long a dropped connection keeps its lobby seat (and the room stays alive). */
const RESUME_GRACE_MS = 60_000

const app = express()
app.use(cors({ origin: corsOrigin }))
app.get("/health", (_req, res) => res.json({ ok: true }))

const httpServer = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin },
})

const rooms = new RoomManager()

/** Arm bot/turn/round timers, then push room + per-seat game state (with the turn countdown) to everyone. */
function sync(code: string): void {
  const room = rooms.getRoom(code)
  if (!room) return
  rooms.schedule(code, sync)
  io.to(code).emit("room:state", rooms.toState(room))
  for (const [socketId, view] of rooms.gameViews(code)) {
    io.to(socketId).emit("game:state", view)
  }
}

io.on("connection", (socket) => {
  log(null, `client connected (${socket.id})`)

  function leaveCurrent(): void {
    const room = rooms.leaveRoom(socket.id)
    if (room) {
      socket.leave(room.code)
      sync(room.code)
    }
  }

  function reply(ack: unknown, result: RoomActionResult): void {
    if (typeof ack === "function") ack(result)
  }

  /** Enter a room via create/join. */
  function enter(ack: unknown, op: () => RoomActionResult): void {
    leaveCurrent()
    const result = op()
    if (result.ok) {
      socket.join(result.code)
      sync(result.code)
    }
    reply(ack, result)
  }

  /** Apply a mutation; sync on success, report rejections to the caller. */
  function mutate(op: () => RoomState): void {
    try {
      sync(op().code)
    } catch (err) {
      const known = err instanceof RoomError || err instanceof GameError
      if (!known) console.error(err)
      socket.emit("room:error", {
        message: known ? err.message : "Something went wrong.",
      })
    }
  }

  socket.on("room:create", (payload, ack) =>
    enter(ack, () =>
      rooms.createRoom(socket.id, payload?.name, payload?.maxPlayers),
    ),
  )
  socket.on("room:join", (payload, ack) =>
    enter(ack, () => rooms.joinRoom(socket.id, payload?.code, payload?.name)),
  )
  socket.on("room:resume", (payload, ack) => {
    const { result, staleSocketId } = rooms.resume(socket.id, payload?.token)
    if (result.ok) {
      const stale = staleSocketId
        ? io.sockets.sockets.get(staleSocketId)
        : undefined
      stale?.leave(result.code)
      stale?.emit("room:closed", { reason: "You joined from another window." })
      socket.join(result.code)
      sync(result.code)
    }
    reply(ack, result)
  })
  socket.on("room:leave", leaveCurrent)

  socket.on("room:setReady", (p) =>
    mutate(() => rooms.setReady(socket.id, p?.ready)),
  )
  socket.on("room:setMaxPlayers", (p) =>
    mutate(() => rooms.setMaxPlayers(socket.id, p?.maxPlayers)),
  )
  socket.on("room:addBot", (p) =>
    mutate(() => rooms.addBot(socket.id, p?.seatIdx, p?.level)),
  )
  socket.on("room:removeBot", (p) =>
    mutate(() => rooms.removeBot(socket.id, p?.seatIdx)),
  )
  socket.on("room:setBotLevel", (p) =>
    mutate(() => rooms.setBotLevel(socket.id, p?.seatIdx, p?.level)),
  )
  socket.on("room:kick", (p) =>
    mutate(() => {
      const { room, kickedSocketId } = rooms.kick(socket.id, p?.seatIdx)
      const target = kickedSocketId
        ? io.sockets.sockets.get(kickedSocketId)
        : undefined
      target?.leave(room.code)
      target?.emit("room:closed", { reason: "You were removed by the host." })
      return room
    }),
  )
  socket.on("room:start", () => mutate(() => rooms.start(socket.id)))
  socket.on("room:returnToLobby", () =>
    mutate(() => rooms.returnToLobby(socket.id)),
  )
  socket.on("game:action", (action) =>
    mutate(() => rooms.gameAction(socket.id, action)),
  )

  socket.on("disconnect", (reason) => {
    log(null, `client disconnected (${socket.id}, ${reason})`)
    const dropped = rooms.disconnect(socket.id)
    if (!dropped) return
    const { room, playerId } = dropped
    sync(room.code)
    setTimeout(() => {
      if (rooms.expire(room.code, playerId)) sync(room.code)
    }, RESUME_GRACE_MS)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Hosn Obe server listening on http://localhost:${PORT}`)
})
