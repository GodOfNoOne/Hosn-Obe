// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CHAT_LIMITS, type ChatEvent, type ChatHistoryResult, type ChatMessage, type ChatSendResult, type RoomState } from "@hosn-obe/shared"
import { RoomChat } from "../src/RoomChat.js"

type Ack<T> = (error: Error | null, result?: T) => void
const wire = vi.hoisted(() => {
  const listeners = new Set<(event: ChatEvent) => void>()
  const histories: Ack<ChatHistoryResult>[] = []
  const sends: { text: string; ack: Ack<ChatSendResult> }[] = []
  const socket = {
    connected: true,
    on: (_event: string, listener: (event: ChatEvent) => void) => listeners.add(listener),
    off: (_event: string, listener: (event: ChatEvent) => void) => listeners.delete(listener),
    timeout: () => ({
      emit(event: string, first: unknown, second?: unknown) {
        if (event === "chat:history") histories.push(first as Ack<ChatHistoryResult>)
        if (event === "chat:send") sends.push({ ...(first as { text: string }), ack: second as Ack<ChatSendResult> })
      },
    }),
  }
  return { socket, listeners, histories, sends }
})
vi.mock("../src/socket.js", () => ({ socket: wire.socket }))

const room: RoomState = { code: "ABCDE", hostId: "alice", maxPlayers: 2, seats: [], spectators: [], phase: "lobby" }
function message(id: number, text = `Message ${id}`, playerId = "bob"): ChatMessage {
  return { id: String(id), text, playerId, name: playerId === "bob" ? "Bob" : "Alice", sentAt: 1_700_000_000_000 + id }
}
function history(messages: ChatMessage[] = [], index = wire.histories.length - 1) {
  act(() => wire.histories[index]!(null, { ok: true, code: room.code, messages }))
}
function incoming(msg: ChatMessage, code = room.code) {
  act(() => { for (const listener of wire.listeners) listener({ code, message: msg }) })
}
beforeEach(() => { wire.socket.connected = true; wire.histories.length = 0; wire.sends.length = 0; wire.listeners.clear() })
afterEach(cleanup)

describe("room chat interface", () => {
  it("labels automated messages as bots", () => {
    render(<RoomChat room={room} youId="alice" connected />)
    history([{ ...message(1, "Calm face, questionable luck.", "bot:one"), name: "Bot 1", isBot: true }])
    expect(screen.getByText("Bot 1")).toBeTruthy()
    expect(screen.getByText("Bot", { selector: ".chat-bot-label" })).toBeTruthy()
  })
  it("sends with Enter, renders text safely and deduplicates the sender's echo", () => {
    const { container } = render(<RoomChat room={room} youId="alice" connected />)
    history()
    const text = "<img src=x onerror=alert(1)>"
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } })
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" })
    expect(wire.sends).toHaveLength(1)
    expect(wire.sends[0]?.text).toBe(text)
    incoming(message(1, text, "alice"))
    act(() => wire.sends[0]!.ack(null, { ok: true, message: message(1, text, "alice") }))
    expect(screen.getAllByText(text)).toHaveLength(1)
    expect(container.querySelector("img")).toBeNull()
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("")
  })

  it("keeps the conversation and draft when the lobby becomes a game", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    history([message(1, "Good luck")])
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Ready for round one" } })
    view.rerender(<RoomChat room={{ ...room, phase: "playing" }} youId="alice" connected />)
    expect(screen.getByText("Good luck")).toBeTruthy()
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Ready for round one")
    expect(wire.histories).toHaveLength(1)
  })

  it("counts new messages while collapsed, ignores other rooms and clears the badge on opening", () => {
    render(<RoomChat room={room} youId="alice" connected />)
    history()
    fireEvent.click(screen.getByRole("button", { name: "Room chat", expanded: true }))
    incoming(message(1, "Wrong room"), "OTHER")
    incoming(message(2, "Hello"))
    incoming(message(2, "Hello"))
    incoming(message(3, "My own message", "alice"))
    expect(screen.queryByText("Wrong room")).toBeNull()
    expect(screen.getByLabelText("1 unread messages")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.queryByLabelText("1 unread messages")).toBeNull()
  })

  it("replaces stale history on reconnect while retaining messages arriving during sync", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    history(Array.from({ length: CHAT_LIMITS.history }, (_, n) => message(n + 1)))
    wire.socket.connected = false
    view.rerender(<RoomChat room={room} youId="alice" connected={false} />)
    wire.socket.connected = true
    view.rerender(<RoomChat room={room} youId="alice" connected />)
    incoming(message(101))
    history(Array.from({ length: CHAT_LIMITS.history }, (_, n) => message(n + 51)))
    expect(screen.queryByText("Message 1")).toBeNull()
    expect(screen.getByText("Message 100")).toBeTruthy()
    expect(screen.getByText("Message 101")).toBeTruthy()
    expect(screen.getAllByRole("article")).toHaveLength(CHAT_LIMITS.history)
    expect(screen.getAllByRole("article").at(-1)?.textContent).toContain("Message 101")
  })

  it("doesn't queue messages offline or send Shift+Enter, and retains rejected drafts", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    history()
    const input = screen.getByLabelText("Message")
    fireEvent.change(input, { target: { value: "Keep this draft" } })
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
    expect(wire.sends).toHaveLength(0)
    wire.socket.connected = false
    fireEvent.keyDown(input, { key: "Enter" })
    expect(wire.sends).toHaveLength(0)
    wire.socket.connected = true
    fireEvent.keyDown(input, { key: "Enter" })
    act(() => wire.sends[0]!.ack(null, { ok: false, error: "Wait a moment" }))
    expect(screen.getByRole("alert").textContent).toBe("Wait a moment")
    expect((input as HTMLTextAreaElement).value).toBe("Keep this draft")
    view.rerender(<RoomChat room={room} youId="alice" connected={false} />)
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("can retry history and ignores pending callbacks after leaving a room", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    act(() => wire.histories[0]!(new Error("timeout")))
    fireEvent.click(screen.getByRole("button", { name: "Retry chat" }))
    expect(wire.histories).toHaveLength(2)
    view.unmount()
    expect(wire.listeners.size).toBe(0)
    // A late response must not restore old room data into the new conversation.
    render(<RoomChat room={{ ...room, code: "OTHER" }} youId="alice" connected />)
    act(() => wire.histories[1]!(null, { ok: true, code: room.code, messages: [message(1, "Old room")] }))
    expect(screen.queryByText("Old room")).toBeNull()
  })
})
