import { useEffect, useRef, useState } from "react"
import { EMOTE_IDS, EMOTE_DURATION_MS, EMOTE_COOLDOWN_MS, type EmoteId, type EmoteEvent } from "@hosn-obe/shared"
import type { RoomCommands } from "./commands.js"
import "./emotes.css"

const labels: Record<EmoteId, string> = { laughing: "Laughing", angry: "Angry", crying: "Crying", gg: "Good game" }
type Reaction = EmoteEvent & { key: number }

/** Original vector card characters, animated with CSS so they stay sharp at any size. */
export function CardEmote({ emote, animated = false }: { emote: EmoteId; animated?: boolean }) {
  const suit = { laughing: "♣", angry: "♦", crying: "♠", gg: "♥" }[emote]
  return <svg viewBox="0 0 160 180" className={`card-emote card-emote--${emote} ${animated ? "card-emote--animated" : ""}`} role="img" aria-label={labels[emote]}>
    <ellipse cx="80" cy="164" rx="48" ry="8" fill="#000" opacity=".18" />
    <g className="emote-character" stroke="#22233c" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <rect x="31" y="18" width="104" height="139" rx="18" fill="#c6af81" transform="rotate(7 80 90)" />
      <rect x="24" y="13" width="104" height="139" rx="18" fill={emote === "angry" ? "#ffe4cc" : "#fff7e3"} />
      <rect x="31" y="20" width="90" height="125" rx="12" fill="none" stroke="#e8cf9a" strokeWidth="2" />
      <g stroke="none" fill={emote === "angry" || emote === "gg" ? "#ed5265" : "#33354e"} fontSize="23" fontWeight="900" fontFamily="Georgia, serif">
        <text x="34" y="43">{suit}</text><text x="99" y="137">{suit}</text>
      </g>
      <g className="emote-face">
      {emote === "laughing" && <>
        <path d="M44 62l15 8-15 8M108 62l-15 8 15 8" fill="none" />
        <g className="emote-mouth"><path d="M46 91Q76 83 106 91Q104 126 76 128Q48 126 46 91" fill="#452338" />
        <path d="M50 93Q76 88 102 93l-4 10H54z" fill="white" strokeWidth="2" />
        <path d="M61 122Q76 106 91 122" fill="#ff7386" stroke="none" /></g>
        <ellipse cx="38" cy="88" rx="9" ry="5" fill="#ff9b99" stroke="none" /><ellipse cx="114" cy="88" rx="9" ry="5" fill="#ff9b99" stroke="none" />
      </>}
      {emote === "angry" && <>
        <path d="M42 59l23 10M111 59L88 69" fill="none" strokeWidth="7" />
        <ellipse cx="56" cy="80" rx="5" ry="9" fill="#22233c" /><ellipse cx="98" cy="80" rx="5" ry="9" fill="#22233c" />
        <path d="M49 112Q77 89 105 112v12H49z" fill="white" /><path d="M65 108v15m16-18v18m15-15v15" strokeWidth="2" />
        <path d="M108 32v12m-7-6h14" stroke="#e84850" strokeWidth="4" />
      </>}
      {emote === "crying" && <>
        <path d="M44 64q12 8 21-4m23 0q11 12 21 4M43 79q10-11 21 0m24 0q10-11 21 0" fill="none" />
        <path d="M59 119Q76 93 94 119Q76 112 59 119" fill="#452338" />
        <g className="emote-tears" fill="#58caff" stroke="#278ecc" strokeWidth="2"><path d="M49 81q-15 26 0 27q15-1 0-27M103 81q-15 26 0 27q15-1 0-27" /></g>
      </>}
      {emote === "gg" && <>
        <path d="M43 71q10-18 21 0m24 0q11-18 21 0" fill="none" />
        <path d="M54 88q22 27 44 0" fill="none" />
        <g className="emote-gg"><rect x="36" y="106" width="81" height="35" rx="11" fill="#7be0ae" strokeWidth="3" />
        <text x="76" y="131" fill="#173c36" stroke="none" textAnchor="middle" fontSize="27" fontFamily="system-ui" fontWeight="1000">GG</text></g>
      </>}
      </g>
    </g>
    {emote === "angry" && <g className="emote-steam" fill="#f5fbff"><path d="M22 50Q2 40 12 27q-3 15 10 14zM133 50q25-10 15-23q3 15-15 14z" /></g>}
    {emote === "gg" && <g className="emote-sparkles" fill="#ffe183"><path d="M139 56l4 10 10 4-10 4-4 10-4-10-10-4 10-4zM16 95l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" /></g>}
  </svg>
}

export function useEmotes(commands: RoomCommands) {
  const [events, setEvents] = useState<Record<string, Reaction>>({})
  const serial = useRef(0)
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    setEvents({})
    const unsubscribe = commands.subscribeEmotes(event => {
      const reaction = { ...event, key: ++serial.current }
      clearTimeout(timers.get(event.playerId))
      setEvents(previous => ({ ...previous, [event.playerId]: reaction }))
      timers.set(event.playerId, setTimeout(() => {
        setEvents(previous => {
          const next = { ...previous }; delete next[event.playerId]; return next
        })
        timers.delete(event.playerId)
      }, EMOTE_DURATION_MS))
    })
    return () => { unsubscribe(); for (const timer of timers.values()) clearTimeout(timer) }
  }, [commands])
  return events
}

export function EmoteBubble({ event }: { event?: Reaction }) {
  return event ? <div key={event.key} className="emote-bubble" role="status" aria-label={labels[event.emote]}><CardEmote emote={event.emote} animated /></div> : null
}

export function EmotePicker({ commands, connected }: { commands: RoomCommands; connected: boolean }) {
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  // Muting is scoped to the current game; hide incoming bubbles without affecting others.
  return <div className={`emote-controls ${muted ? "emote-controls--muted" : ""}`}>
    <div className="emote-toolbar">
      <button type="button" className="secondary" aria-expanded={open} aria-controls="emote-picker" onClick={() => setOpen(!open)}>♬ Emotes</button>
      <button type="button" className="secondary emote-mute" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? "Unmute emotes" : "Mute emotes"}</button>
    </div>
    {open && <div id="emote-picker" className="emote-picker" role="group" aria-label="Card emotes">
      {EMOTE_IDS.map(emote => <button type="button" key={emote} disabled={!connected || cooldown} aria-label={`Send ${labels[emote]} emote`} onClick={() => {
        commands.sendEmote(emote); setCooldown(true); setOpen(false)
        timer.current = setTimeout(() => setCooldown(false), EMOTE_COOLDOWN_MS)
      }}><CardEmote emote={emote} /><span>{labels[emote]}</span></button>)}
    </div>}
    {cooldown && <small className="emote-hint" role="status">Emotes ready again in a moment…</small>}
  </div>
}
