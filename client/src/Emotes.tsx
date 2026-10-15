import { useEffect, useRef, useState } from "react"
import { EMOTE_IDS, EMOTE_DURATION_MS, EMOTE_COOLDOWN_MS, type EmoteId, type EmoteEvent } from "@hosn-obe/shared"
import type { RoomCommands } from "./commands.js"
import { CardEmoteArtwork } from "./CardEmoteArtwork.js"
import "./emotes.css"

const labels: Record<EmoteId, string> = { laughing: "Laughing", angry: "Angry", crying: "Crying", gg: "Good game" }
type Reaction = EmoteEvent & { key: number }

export function CardEmote({ emote, animated = false, replayKey }: { emote: EmoteId; animated?: boolean; replayKey?: number }) {
  return <CardEmoteArtwork key={replayKey} emote={emote} animated={animated} />
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
  return event ? <div key={event.key} className="emote-bubble" role="status" aria-label={labels[event.emote]}><CardEmote emote={event.emote} animated replayKey={event.key} /></div> : null
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
