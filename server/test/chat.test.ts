import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Server, type Socket as ServerSocket } from "socket.io"
import { io as connect, type Socket } from "socket.io-client"
import { CHAT_LIMITS, type ChatEvent, type ClientToServerEvents, type RoomActionResult, type ServerToClientEvents } from "@hosn-obe/shared"
import { registerChat } from "../src/chat.js"
import { RoomManager } from "../src/rooms.js"

function ok(result: RoomActionResult) {
  if (!result.ok) throw new Error(result.error)
  return result
}

afterEach(() => vi.useRealTimers())

describe("room conversations", () => {
  it("uses the authenticated player's identity and normalizes text without interpreting HTML", () => {
    const rooms = new RoomManager()
    const host = ok(rooms.createRoom("host", "Alice", 4))
    const { code, message } = rooms.sendChat("host", "  hello\r\n<script>alert(1)</script>\u0000  ")
    expect(code).toBe(host.code)
    expect(message).toMatchObject({ playerId: host.youId, name: "Alice", text: "hello\n<script>alert(1)</script>" })
    expect(message.id).toBeTruthy()
    expect(message.sentAt).toBeGreaterThan(0)
    expect(JSON.stringify(message)).not.toContain(host.token)
  })

  it("rejects invalid, empty, and oversized text without using the send cooldown", () => {
    const rooms = new RoomManager()
    ok(rooms.createRoom("host", "Alice", 4))
    for (const value of [undefined, null, {}, 12, "", "  \n\t", "\u0000", "a".repeat(CHAT_LIMITS.maxLength + 1)])
      expect(() => rooms.sendChat("host", value)).toThrow()
    expect(rooms.sendChat("host", "a".repeat(CHAT_LIMITS.maxLength)).message.text).toHaveLength(CHAT_LIMITS.maxLength)
  })

  it("keeps conversations separate and rejects nonmembers", () => {
    const rooms = new RoomManager()
    ok(rooms.createRoom("alice", "Alice", 4))
    ok(rooms.createRoom("bob", "Bob", 4))
    rooms.sendChat("alice", "Private to this room")
    expect(rooms.chatHistory("bob").messages).toEqual([])
    expect(() => rooms.sendChat("outsider", "hello")).toThrow("not in a room")
    expect(() => rooms.chatHistory("outsider")).toThrow("not in a room")
    rooms.leaveRoom("alice")
    expect(() => rooms.chatHistory("alice")).toThrow("not in a room")
  })

  it("shares history with joiners, spectators and players across lobby/game transitions", () => {
    const rooms = new RoomManager()
    const host = ok(rooms.createRoom("host", "Alice", 4))
    rooms.sendChat("host", "Hello from the lobby")
    ok(rooms.joinRoom("bob", host.code, "Bob"))
    expect(rooms.chatHistory("bob").messages[0]?.text).toBe("Hello from the lobby")
    rooms.setReady("bob", true)
    rooms.start("host")
    rooms.sendChat("bob", "Good luck")
    ok(rooms.joinRoom("viewer", host.code, "Carol"))
    rooms.sendChat("viewer", "Watching this hand")
    rooms.returnToLobby("host")
    expect(rooms.chatHistory("host").messages.map(m => m.text)).toEqual(["Hello from the lobby", "Good luck", "Watching this hand"])
    expect(JSON.stringify(rooms.toState(rooms.getRoom(host.code)!))).not.toContain("Hello from the lobby")
  })

  it("preserves history and the per-player cooldown across reconnects, and rejects stale sockets", () => {
    vi.useFakeTimers()
    const rooms = new RoomManager()
    const host = ok(rooms.createRoom("old", "Alice", 4))
    rooms.sendChat("old", "One")
    rooms.disconnect("old")
    expect(() => rooms.sendChat("old", "Two")).toThrow("not in a room")
    expect(rooms.resume("new", host.token).result.ok).toBe(true)
    expect(rooms.chatHistory("new").messages[0]?.text).toBe("One")
    expect(() => rooms.sendChat("new", "Two")).toThrow("Wait a moment")
    vi.advanceTimersByTime(CHAT_LIMITS.cooldownMs)
    expect(rooms.sendChat("new", "Two").message.playerId).toBe(host.youId)
    expect(rooms.resume("newer", host.token).staleSocketId).toBe("new")
    expect(() => rooms.sendChat("new", "Three")).toThrow("not in a room")
  })

  it("rejects kicked members and clears their history access", () => {
    const rooms = new RoomManager()
    const host = ok(rooms.createRoom("host", "Alice", 4))
    ok(rooms.joinRoom("bob", host.code, "Bob"))
    rooms.kick("host", 1)
    expect(() => rooms.sendChat("bob", "Still here?")).toThrow("not in a room")
    expect(() => rooms.chatHistory("bob")).toThrow("not in a room")
  })

  it("bounds history, copies returned data and doesn't carry messages into another room", () => {
    vi.useFakeTimers()
    const rooms = new RoomManager()
    ok(rooms.createRoom("host", "Alice", 4))
    for (let n = 0; n < CHAT_LIMITS.history + 3; n++) {
      rooms.sendChat("host", String(n))
      vi.advanceTimersByTime(CHAT_LIMITS.cooldownMs)
    }
    const history = rooms.chatHistory("host").messages
    expect(history).toHaveLength(CHAT_LIMITS.history)
    expect(history[0]?.text).toBe("3")
    history[0]!.text = "Changed externally"
    history.length = 0
    expect(rooms.chatHistory("host").messages[0]?.text).toBe("3")
    ok(rooms.createRoom("host", "Alice", 4))
    expect(rooms.chatHistory("host").messages).toEqual([])
  })
})

describe("chat socket delivery", () => {
  const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let io: Server<ClientToServerEvents, ServerToClientEvents> | undefined
  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect()
    if (io) await new Promise<void>(resolve => io!.close(() => resolve()))
    io = undefined
  })

  it("delivers once to the sender and their room, never to another room or a departed socket", async () => {
    const http = createServer()
    io = new Server<ClientToServerEvents, ServerToClientEvents>(http)
    const rooms = new RoomManager()
    const sockets = new Map<string, ServerSocket<ClientToServerEvents, ServerToClientEvents>>()
    io.on("connection", socket => { sockets.set(socket.id, socket); registerChat(io!, socket, rooms) })
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
    async function client() {
      const socket = connect(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { forceNew: true, transports: ["websocket"], reconnection: false }) as Socket<ServerToClientEvents, ClientToServerEvents>
      clients.push(socket)
      await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject) })
      return socket
    }
    const [alice, bob, outsider, departed] = await Promise.all([client(), client(), client(), client()])
    const host = ok(rooms.createRoom(alice.id!, "Alice", 4))
    ok(rooms.joinRoom(bob.id!, host.code, "Bob"))
    ok(rooms.joinRoom(departed.id!, host.code, "Gone"))
    const other = ok(rooms.createRoom(outsider.id!, "Other", 4))
    for (const socket of [alice, bob, departed]) await sockets.get(socket.id!)!.join(host.code)
    await sockets.get(outsider.id!)!.join(other.code)
    rooms.leaveRoom(departed.id!)
    await sockets.get(departed.id!)!.leave(host.code)
    const received = [[], [], [], []] as ChatEvent[][]
    for (const [index, socket] of [alice, bob, outsider, departed].entries()) socket.on("chat:message", event => received[index]!.push(event))
    const result = await alice.timeout(1000).emitWithAck("chat:send", { text: "Hello table" })
    expect(result.ok).toBe(true)
    // A history acknowledgement on each socket acts as a barrier after delivery.
    await Promise.all([alice, bob, outsider, departed].map(socket => socket.timeout(1000).emitWithAck("chat:history")))
    expect(received.map(events => events.length)).toEqual([1, 1, 0, 0])
    expect(received[1]![0]).toMatchObject({ code: host.code, message: { name: "Alice", playerId: host.youId, text: "Hello table" } })
    expect(await bob.timeout(1000).emitWithAck("chat:history")).toMatchObject({ ok: true, code: host.code, messages: [{ text: "Hello table" }] })
    expect(await outsider.timeout(1000).emitWithAck("chat:history")).toMatchObject({ ok: true, code: other.code, messages: [] })
    expect(await departed.timeout(1000).emitWithAck("chat:send", { text: "No membership" })).toMatchObject({ ok: false })
    expect(await alice.timeout(1000).emitWithAck("chat:send", { text: "Too fast" })).toMatchObject({ ok: false })
    expect(await alice.timeout(1000).emitWithAck("chat:send", { text: "x".repeat(301) })).toMatchObject({ ok: false })
  })
})
