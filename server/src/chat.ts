import type { ClientToServerEvents, ServerToClientEvents } from "@hosn-obe/shared"
import type { Server, Socket } from "socket.io"
import { RoomError, type RoomManager } from "./rooms.js"

/** Chat shares room membership with gameplay, but doesn't trigger game state syncs. */
export function registerChat(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  rooms: RoomManager,
) {
  function errorMessage(error: unknown) {
    if (error instanceof RoomError) return error.message
    console.error(error)
    return "Chat is temporarily unavailable."
  }
  socket.on("chat:history", ack => {
    if (typeof ack !== "function") return
    try { ack({ ok: true, ...rooms.chatHistory(socket.id) }) }
    catch (error) { ack({ ok: false, error: errorMessage(error) }) }
  })
  socket.on("chat:send", (payload, ack) => {
    if (typeof ack !== "function") return
    try {
      const event = rooms.sendChat(socket.id, payload?.text)
      io.to(event.code).emit("chat:message", event)
      ack({ ok: true, message: event.message })
    } catch (error) { ack({ ok: false, error: errorMessage(error) }) }
  })
}
