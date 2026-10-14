import { useEffect, useRef, useState } from "react"
import { EMOTE_IDS, EMOTE_DURATION_MS, EMOTE_COOLDOWN_MS, type EmoteId, type EmoteEvent } from "@hosn-obe/shared"
import type { RoomCommands } from "./commands.js"
import laughingGif from "./assets/emotes/laughing.gif"
import laughingStill from "./assets/emotes/laughing.png"
import angryGif from "./assets/emotes/angry.gif"
import angryStill from "./assets/emotes/angry.png"
import cryingGif from "./assets/emotes/crying.gif"
import cryingStill from "./assets/emotes/crying.png"
import ggGif from "./assets/emotes/gg.gif"
import ggStill from "./assets/emotes/gg.png"
import "./emotes.css"

const labels: Record<EmoteId, string> = { laughing: "Laughing", angry: "Angry", crying: "Crying", gg: "Good game" }
type Reaction = EmoteEvent & { key: number }

/** File-backed emotes: still previews in the picker, GIF playback for reactions. */
const assets = {
  laughing: { gif: laughingGif, still: laughingStill },
  angry: { gif: angryGif, still: angryStill },
  crying: { gif: cryingGif, still: cryingStill },
  gg: { gif: ggGif, still: ggStill },
} satisfies Record<EmoteId, { gif: string; still: string }>

export function CardEmote({ emote, animated = false, replayKey }: { emote: EmoteId; animated?: boolean; replayKey?: number }) {
  const asset = assets[emote]
  // A fresh URL restarts the GIF when the same reaction is sent again.
  const src = animated ? `${asset.gif}?play=${replayKey ?? 0}` : asset.still
  return <picture>
    <source media="(prefers-reduced-motion: reduce)" srcSet={asset.still} />
    <img className="card-emote" src={src} alt={labels[emote]} width={256} height={256} draggable={false} />
  </picture>
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
