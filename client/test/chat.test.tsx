// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
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

// jsdom doesn't implement native dialog methods; emulate the DOM lifecycle.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event("close"))
  }
})
function openChat() { fireEvent.click(screen.getByRole("button", { name: /^Open room chat/ })) }

describe("room chat interface", () => {
  it("labels automated messages as bots", () => {
    render(<RoomChat room={room} youId="alice" connected />)
    openChat()
    history([{ ...message(1, "Calm face, questionable luck.", "bot:one"), name: "Bot 1", isBot: true }])
    expect(screen.getByText("Bot 1")).toBeTruthy()
    expect(screen.getByText("Bot", { selector: ".chat-bot-label" })).toBeTruthy()
  })
  it("sends with Enter, renders text safely and deduplicates the sender's echo", () => {
    const { container } = render(<RoomChat room={room} youId="alice" connected />)
    openChat()
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
    openChat()
    history([message(1, "Good luck")])
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Ready for round one" } })
    view.rerender(<RoomChat room={{ ...room, phase: "playing" }} youId="alice" connected />)
    expect(screen.getByText("Good luck")).toBeTruthy()
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Ready for round one")
    expect(wire.histories).toHaveLength(1)
  })

  it("shows a notification dot for new messages, ignores other rooms and clears it on opening", () => {
    render(<RoomChat room={room} youId="alice" connected />)
    history()
    expect(screen.queryByRole("dialog")).toBeNull()
    incoming(message(1, "Wrong room"), "OTHER")
    incoming(message(2, "Hello"))
    incoming(message(2, "Hello"))
    incoming(message(3, "My own message", "alice"))
    expect(screen.queryByText("Wrong room")).toBeNull()
    const button = screen.getByRole("button", { name: "Open room chat, 1 unread message" })
    expect(button.querySelector(".chat-unread")).toBeTruthy()
    openChat()
    expect(screen.getByRole("dialog", { name: "Room chat" })).toBeTruthy()
    expect(button.querySelector(".chat-unread")).toBeNull()
  })

  it("replaces stale history on reconnect while retaining messages arriving during sync", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    openChat()
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
    openChat()
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
    openChat()
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

  it("closes with Escape, outside click or native back, restores focus, and keeps drafts", () => {
    render(<RoomChat room={room} youId="alice" connected />)
    history()
    const overflow = document.body.style.overflow
    openChat()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close room chat" }))
    expect(document.body.style.overflow).toBe("hidden")
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Keep my draft" } })
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open room chat" }))
    expect(document.body.style.overflow).toBe(overflow)
    openChat()
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Keep my draft")
    fireEvent.click(screen.getByRole("dialog"))
    expect(screen.queryByRole("dialog")).toBeNull()
    openChat()
    act(() => (screen.getByRole("dialog") as HTMLDialogElement).close())
    expect(screen.queryByRole("dialog")).toBeNull()
    openChat()
    fireEvent.click(screen.getByRole("button", { name: "Close room chat" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("marks missed reconnect messages as unread without double-counting live arrivals", () => {
    const view = render(<RoomChat room={room} youId="alice" connected />)
    history([message(1)])
    expect(screen.getByRole("button", { name: "Open room chat" })).toBeTruthy()
    wire.socket.connected = false
    view.rerender(<RoomChat room={room} youId="alice" connected={false} />)
    wire.socket.connected = true
    view.rerender(<RoomChat room={room} youId="alice" connected />)
    incoming(message(3))
    history([message(1), message(2), message(3)])
    expect(screen.getByRole("button", { name: "Open room chat, 2 unread messages" })).toBeTruthy()
    openChat()
    incoming(message(4))
    fireEvent.click(screen.getByRole("button", { name: "Close room chat" }))
    expect(screen.getByRole("button", { name: "Open room chat" })).toBeTruthy()
  })

  it("adapts the popup to keyboard viewport changes and removes resize listeners on close", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport")
    const viewport = Object.assign(new EventTarget(), { height: 320, offsetTop: 0 })
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport })
    try {
      render(<RoomChat room={room} youId="alice" connected />)
      history()
      openChat()
      const dialog = screen.getByRole("dialog")
      expect(dialog.style.getPropertyValue("--chat-viewport-height")).toBe("320px")
      expect(dialog.style.getPropertyValue("--chat-bottom-gap")).toBe("12px")
      viewport.height = window.innerHeight
      act(() => viewport.dispatchEvent(new Event("resize")))
      expect(dialog.style.getPropertyValue("--chat-bottom-gap")).toBe("84px")
      fireEvent.click(screen.getByRole("button", { name: "Close room chat" }))
      viewport.height = 250
      act(() => viewport.dispatchEvent(new Event("resize")))
      expect(dialog.style.getPropertyValue("--chat-bottom-gap")).toBe("84px")
    } finally {
      if (descriptor) Object.defineProperty(window, "visualViewport", descriptor)
      else Reflect.deleteProperty(window, "visualViewport")
    }
  })
})
