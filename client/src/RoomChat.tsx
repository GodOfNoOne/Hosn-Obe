import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CHAT_LIMITS, type ChatEvent, type ChatMessage, type RoomState } from "@hosn-obe/shared"
import { socket } from "./socket.js"
import "./chat.css"

/** Mounted once per online room so the conversation survives lobby/game changes. */
export function RoomChat({ room, youId, connected }: { room: RoomState; youId: string | null; connected: boolean }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [unread, setUnread] = useState(0)
  const [ready, setReady] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const openRef = useRef(open)
  openRef.current = open
  const seen = useRef(new Set<string>())
  const sendVersion = useRef(0)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>()
  const log = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const popup = useRef<HTMLDialogElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const loadedHistory = useRef(false)

  function remember(message: ChatMessage, countUnread = false) {
    if (seen.current.has(message.id)) return
    seen.current.add(message.id)
    if (seen.current.size > CHAT_LIMITS.history * 2) {
      const oldest = seen.current.values().next().value
      if (oldest) seen.current.delete(oldest)
    }
    setMessages(previous => [...previous, message].slice(-CHAT_LIMITS.history))
    if (countUnread && !openRef.current && message.playerId !== youId) setUnread(count => count + 1)
  }

  useEffect(() => {
    let active = true
    let syncing = true
    const liveDuringSync: ChatMessage[] = []
    setSending(false)
    setReady(false)
    setHistoryError(null)
    function onMessage(event: ChatEvent) {
      if (event.code !== room.code) return
      if (syncing) {
        liveDuringSync.push(event.message)
        if (liveDuringSync.length > CHAT_LIMITS.history) liveDuringSync.shift()
      }
      remember(event.message, true)
    }
    socket.on("chat:message", onMessage)
    if (connected && socket.connected) {
      socket.timeout(8000).emit("chat:history", (err, result) => {
        if (!active) return
        syncing = false
        if (err || !result) { setHistoryError("Couldn't load chat. Try again."); return }
        if (!result.ok) { setHistoryError(result.error); return }
        if (result.code !== room.code) return
        if (loadedHistory.current && !openRef.current) {
          const missed = result.messages.filter(message => message.playerId !== youId && !seen.current.has(message.id)).length
          if (missed) setUnread(count => count + missed)
        }
        loadedHistory.current = true
        seen.current = new Set([...result.messages.map(message => message.id), ...seen.current].slice(-CHAT_LIMITS.history * 2))
        const ids = new Set(result.messages.map(message => message.id))
        setMessages([...result.messages, ...liveDuringSync.filter(message => !ids.has(message.id))].slice(-CHAT_LIMITS.history))
        setReady(true)
      })
    }
    return () => {
      active = false
      sendVersion.current++
      socket.off("chat:message", onMessage)
    }
  }, [room.code, connected, youId, reload])

  useEffect(() => () => clearTimeout(cooldownTimer.current), [])
  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = overflow }
  }, [open])
  useLayoutEffect(() => {
    const dialog = popup.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      closeButton.current?.focus()
    } else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const viewport = window.visualViewport
    const dialog = popup.current
    if (!open || !viewport || !dialog) return
    const resize = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      dialog.style.setProperty("--chat-viewport-height", `${viewport.height}px`)
      dialog.style.setProperty("--chat-keyboard-inset", `${keyboard}px`)
      dialog.style.setProperty("--chat-bottom-gap", keyboard > 80 || viewport.height < 500 ? "12px" : "84px")
    }
    resize()
    viewport.addEventListener("resize", resize)
    viewport.addEventListener("scroll", resize)
    return () => { viewport.removeEventListener("resize", resize); viewport.removeEventListener("scroll", resize) }
  }, [open])
  useLayoutEffect(() => {
    if (open && follow.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, open])

  function show() {
    setUnread(0)
    follow.current = true
    setOpen(true)
  }

  function send() {
    if (!draft.trim() || !ready || sending || cooldown || !connected || !socket.connected) return
    const version = ++sendVersion.current
    setError(null)
    setSending(true)
    socket.timeout(8000).emit("chat:send", { text: draft }, (err, result) => {
      if (version !== sendVersion.current) return
      setSending(false)
      if (err || !result) { setError("Couldn't confirm delivery. Check chat before trying again."); return }
      if (!result.ok) { setError(result.error); return }
      remember(result.message)
      setDraft("")
      follow.current = true
      if (log.current) log.current.scrollTop = log.current.scrollHeight
      setCooldown(true)
      clearTimeout(cooldownTimer.current)
      cooldownTimer.current = setTimeout(() => setCooldown(false), CHAT_LIMITS.cooldownMs)
    })
  }

  return <section className="room-chat" aria-label="Room chat">
    <button ref={launcher} className="chat-launcher" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="room-chat-popup"
      aria-label={`Open room chat${unread ? `, ${unread} unread ${unread === 1 ? "message" : "messages"}` : ""}`} title="Room chat" onClick={show}>
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" /><path d="M7 9h10M7 13h6" /></svg>
      {unread > 0 && <span className="chat-unread" aria-hidden="true" />}
    </button>
    <dialog ref={popup} className="chat-popup" id="room-chat-popup" aria-labelledby="room-chat-title" aria-describedby="room-chat-caption"
      onClose={() => { setOpen(false); launcher.current?.focus() }}
      onCancel={event => { event.preventDefault(); setOpen(false) }}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false) } }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="chat-popup-content">
      <header className="chat-header">
        <div><h2 id="room-chat-title">Room chat</h2><span className="chat-room-code">Room {room.code}</span></div>
        <button ref={closeButton} className="chat-close" type="button" aria-label="Close room chat" onClick={() => setOpen(false)}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <p className="chat-caption" id="room-chat-caption">Everyone in this room can read and send messages.</p>
      <div className="chat-log" ref={log} role="log" aria-label="Messages" aria-live={open ? "polite" : "off"} aria-relevant="additions" tabIndex={0}
        onScroll={() => { if (log.current) follow.current = log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 32 }}>
        {messages.length === 0 && <p className="chat-empty">{connected && !ready && !historyError ? "Loading chat…" : "Say hello to the table."}</p>}
        {messages.map(message => <article className={`chat-message${message.playerId === youId ? " chat-message--you" : ""}`} key={message.id}>
          <div className="chat-meta"><bdi className="chat-author">{message.playerId === youId ? "You" : message.name}</bdi>
            {message.isBot && <span className="chat-bot-label">Bot</span>}
            <time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
          <p dir="auto">{message.text}</p>
        </article>)}
      </div>
      {historyError && <div className="chat-feedback"><p role="alert">{historyError}</p><button type="button" className="secondary" disabled={!connected} onClick={() => setReload(value => value + 1)}>Retry chat</button></div>}
      <form className="chat-compose" onSubmit={event => { event.preventDefault(); send() }}>
        <label className="chat-input-label" htmlFor="chat-message">Message</label>
        <div className="chat-compose-row">
          <textarea id="chat-message" rows={2} dir="auto" value={draft} maxLength={CHAT_LIMITS.maxLength}
            disabled={!connected || sending} placeholder={connected ? "Message the room…" : "Reconnecting…"}
            onChange={event => { setDraft(event.target.value); setError(null) }}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
            }} />
          <button type="submit" disabled={!connected || !ready || sending || cooldown || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
        </div>
        <div className="chat-compose-meta"><span>{!connected ? "Messages will be available after reconnecting." : cooldown ? "Wait a moment before sending again." : "Enter to send · Shift+Enter for a new line"}</span><span>{draft.length}/{CHAT_LIMITS.maxLength}</span></div>
        {error && <p className="chat-error" role="alert">{error}</p>}
      </form>
      </div>
    </dialog>
  </section>
}
