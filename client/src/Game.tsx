import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import {
  ROOM_LIMITS,
  isInstantWin,
  THREE_ACES_SCORE,
  type Card,
  type GameAction,
  type GameEvent,
  type GameView,
  type PlayerView,
  type PoolName,
  type RoomState,
} from "@hosn-obe/shared"

import { CardView, Lives } from "./Card.js"
import type { RoomCommands } from "./commands.js"
import { turnFeedback } from "./native.js"
import { playSound, type Sound } from "./sound.js"
import { useServerError } from "./useServerError.js"

const POOL_LABEL: Record<PoolName, string> = {
  up: "face-up",
  down: "face-down",
}

function fmt(score: number): string {
  return score === 30.5 ? "30½" : String(score)
}

function nameOf(view: GameView, seat: number): string {
  return seat === view.you ? "You" : (view.players[seat]?.name ?? "?")
}

function describeEvent(view: GameView, ev: GameEvent): string {
  if (ev.type === "deal") {
    const opener =
      view.startingIdx === view.you
        ? "You open"
        : `${nameOf(view, view.startingIdx)} opens`
    return `Round ${view.round} — ${opener}.`
  }
  const who = nameOf(view, ev.seat)
  switch (ev.type) {
    case "keep":
      return `${who} kept the dealt cards.`
    case "push":
      return `${who} pushed — traded all three for the table set.`
    case "swap":
      return `${who} swapped a card with the ${POOL_LABEL[ev.pool]} pool.`
    case "swapAll":
      return `${who} swapped all three with the ${POOL_LABEL[ev.pool]} pool.`
    case "knock":
      return `${who} knocked — everyone else gets one last turn.`
    case "stand":
      return `${who} stand${ev.seat === view.you ? "" : "s"}.`
    case "layDown":
      return `${who} laid down!`
    case "missFire":
      return `${who} didn't lay down in time!`
  }
}

function prompt(
  view: GameView,
  yourTurn: boolean,
  turnOffline: boolean,
): string {
  const turnName = nameOf(view, view.turnIdx)
  const live = view.phase === "schieben" || view.phase === "play"
  if (view.players[view.you]?.out && view.phase !== "gameEnd") {
    return "You're out — watching the rest of the game."
  }
  if (turnOffline && live) {
    return `${turnName} is offline — a bot will move for them shortly…`
  }
  if (view.you < 0 && live) return `Watching — ${turnName}'s turn…`
  if (view.phase === "schieben") {
    return yourTurn
      ? "Opening: keep your three cards, or push them for the hidden table set."
      : `${turnName} is deciding to keep or push…`
  }
  if (view.phase === "play") {
    if (view.pendingShowdown) return "Showdown coming up…"
    if (!yourTurn) return `${turnName}'s turn…`
    if (view.knockerIdx !== null) {
      return `${nameOf(view, view.knockerIdx)} knocked — last move: swap or stand.`
    }
    return "Your turn: swap a card, or knock to close."
  }
  if (view.phase === "gameEnd") {
    if (view.winnerIdx === null) return "Nobody survived — it's a draw."
    return view.winnerIdx === view.you
      ? "🎉 You win the game!"
      : `${nameOf(view, view.winnerIdx)} wins the game.`
  }
  return "Next round starting soon…"
}

function resultText(view: GameView): string {
  const r = view.result
  if (!r) return ""
  const lost = r.losers.map((i) => nameOf(view, i))
  const loses = (names: string[]) =>
    `${names.join(", ")} lose${names.length === 1 && names[0] !== "You" ? "s" : ""} a life.`
  const ev = view.lastEvent
  const aces =
    r.reason === "layDown" &&
    ev.type === "layDown" &&
    r.scores[ev.seat] === THREE_ACES_SCORE
  const parts = [
    r.reason === "missedFire"
      ? `${lost[0]} didn't lay down in time — ${loses(lost)}`
      : aces
        ? `Three aces! Everyone else loses a life.`
        : lost.length
          ? loses(lost)
          : "Tie — nobody loses a life.",
  ]
  for (const i of r.eliminated)
    if (!r.revived.includes(i))
      parts.push(`${nameOf(view, i)} ${i === view.you ? "are" : "is"} out!`)
  if (r.revived.length) {
    const back = r.revived.map((i) => nameOf(view, i))
    const are = back.length > 1 || r.revived[0] === view.you ? "are" : "is"
    parts.push(
      `Everyone's swimming — ${back.join(", ")} ${are} back in, swimming too!`,
    )
  }
  return parts.join(" ")
}

/** Every other seat with its rim slot, in turn order from yours (spectators: from seat 0 at the bottom). */
function opponentsInOrder(view: GameView): { seat: number; k: number }[] {
  const n = view.players.length
  const first = Math.max(view.you, 0)
  return Array.from({ length: n }, (_, k) => ({
    seat: (first + k) % n,
    k,
  })).filter(({ seat }) => seat !== view.you)
}

/** Rim position (-1..1 per axis) for the k-th seat after yours; k=0 is you at the bottom, clockwise. */
function rimStyle(k: number, n: number): CSSProperties {
  const angle = Math.PI / 2 + (2 * Math.PI * k) / n
  // An exponent < 1 pushes diagonal seats out toward the table's corners.
  const squash = (v: number) => Math.sign(v) * Math.abs(v) ** 0.6
  const x = squash(Math.cos(angle)).toFixed(3)
  const y = squash(Math.sin(angle)).toFixed(3)
  return {
    left: `calc(50% + (50% - var(--seat-hw)) * ${x})`,
    top: `calc(50% + (50% - var(--seat-hh)) * ${y})`,
  }
}

/** Sound for the latest event, or for how the round ended for you. */
function eventSound(view: GameView): Sound | null {
  const r = view.result
  if (view.phase === "gameEnd" && view.winnerIdx === view.you) return "win"
  if (r && r.losers.includes(view.you)) return "lose"
  switch (view.lastEvent.type) {
    case "knock":
      return "knock"
    case "layDown":
      return "layDown"
    case "stand":
    case "missFire":
      return null
    default:
      return "card"
  }
}

/** Milliseconds left until `deadline` (epoch ms), updated a few times a second. */
function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (deadline === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])
  return deadline === null ? null : Math.max(0, deadline - now)
}

export function Game({
  view,
  room,
  isHost,
  connected = true,
  commands,
  onLeave,
  training,
}: {
  view: GameView
  room: RoomState
  isHost: boolean
  connected?: boolean
  commands: RoomCommands
  onLeave: () => void
  training?: TrainingGuide
}) {
  const error = useServerError()
  const [handSel, setHandSel] = useState<number | null>(null)
  const [poolSel, setPoolSel] = useState<{
    pool: PoolName
    idx: number
  } | null>(null)
  const [allSel, setAllSel] = useState<PoolName | null>(null)

  // Any new event invalidates a half-made selection.
  useEffect(() => {
    setHandSel(null)
    setPoolSel(null)
    setAllSel(null)
  }, [view.seq])

  const me: PlayerView | undefined = view.players[view.you]
  const yourTurn =
    view.turnIdx === view.you &&
    (view.phase === "schieben" || view.phase === "play") &&
    !view.pendingShowdown
  const canPlay = yourTurn && view.phase === "play"
  // Holding 31/33 during play always means an open lay-down window.
  const canLayDown =
    view.phase === "play" &&
    !!me &&
    !me.out &&
    me.hand.every(Boolean) &&
    isInstantWin(me.hand as Card[])
  const showdown = view.phase === "roundEnd" || view.phase === "gameEnd"
  const offline = new Set(seatsOffline(room))
  const ev = view.lastEvent

  useEffect(() => {
    if (yourTurn) {
      turnFeedback()
      playSound("turn")
    }
  }, [yourTurn])

  const seenSeq = useRef(view.seq)
  useEffect(() => {
    if (view.seq === seenSeq.current) return
    seenSeq.current = view.seq
    const sound = eventSound(view)
    if (sound) playSound(sound)
  }, [view])

  // The server sends time left, not a timestamp, so device clock skew doesn't matter.
  const deadline = useMemo(
    () => (view.turnMsLeft === undefined ? null : Date.now() + view.turnMsLeft),
    [view],
  )
  const msLeft = useCountdown(connected ? deadline : null)
  const secsLeft = msLeft === null ? null : Math.ceil(msLeft / 1000)
  useEffect(() => {
    if (yourTurn && secsLeft !== null && secsLeft > 0 && secsLeft <= 5)
      playSound("tick")
  }, [yourTurn, secsLeft])

  function act(action: GameAction) {
    commands.act(action)
  }

  function swap() {
    if (allSel) act({ type: "SWAP_ALL", pool: allSel })
    else if (handSel !== null && poolSel) {
      act({
        type: "SWAP",
        pool: poolSel.pool,
        handIdx: handSel,
        poolIdx: poolSel.idx,
      })
    }
  }

  function flashHand(seat: number, idx: number): boolean {
    if (!("seat" in ev) || ev.seat !== seat) return false
    return (
      ev.type === "swapAll" ||
      ev.type === "push" ||
      (ev.type === "swap" && ev.handIdx === idx)
    )
  }

  function flashPool(pool: PoolName, idx: number): boolean {
    if (ev.type === "swap") return ev.pool === pool && ev.poolIdx === idx
    return (
      (ev.type === "swapAll" && ev.pool === pool) ||
      (ev.type === "push" && pool === "up")
    )
  }

  function renderPool(pool: PoolName, cards: (Card | null)[]) {
    return (
      <div className="pool">
        <div className="pool-head">
          <span className="pool-title">
            {pool === "up" ? "Face-up" : "Face-down"}
          </span>
          {canPlay && (
            <button
              type="button"
              className={`select-all ${allSel === pool ? "active" : ""} ${training?.all && training.pool === pool ? "training-target" : ""}`}
              aria-pressed={allSel === pool}
              onClick={() => {
                setAllSel(allSel === pool ? null : pool)
                setHandSel(null)
                setPoolSel(null)
              }}>
              All 3
            </button>
          )}
        </div>
        <div className="card-row">
          {cards.map((c, i) => (
            <CardView
              key={`${view.seq}-${pool}-${i}`}
              card={c}
              flash={flashPool(pool, i)}
              hint={training?.pool === pool && (training.all || training.poolIdx === i)}
              selected={
                allSel === pool || (poolSel?.pool === pool && poolSel.idx === i)
              }
              label={`${POOL_LABEL[pool]} pool card ${i + 1}`}
              onClick={
                canPlay
                  ? () => {
                      setAllSel(null)
                      setPoolSel(
                        poolSel?.pool === pool && poolSel.idx === i
                          ? null
                          : { pool, idx: i },
                      )
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="game">
      <div
        className={`table ${view.players.length >= 6 ? "table--large" : ""}`}>
        <div className="felt">
          {renderPool("up", view.poolUp)}
          {renderPool("down", view.poolDown)}
        </div>

        {opponentsInOrder(view).map(({ seat, k }) => {
          const p = view.players[seat]!
          return (
            <div
              key={p.id}
              className={`seat ${view.turnIdx === seat && !showdown ? "seat--turn" : ""} ${p.out ? "seat--out" : ""}`}
              style={rimStyle(k, view.players.length)}>
              <span className="seat-name">{p.name}</span>
              <div className="card-row card-row--sm">
                {p.hand.map((c, i) => (
                  <CardView
                    key={`${view.seq}-${i}`}
                    card={c}
                    size="sm"
                    flash={flashHand(seat, i)}
                  />
                ))}
              </div>
              <div className="seat-foot">
                <Lives lives={p.lives} />
                {showdown && view.result?.scores[seat] != null && (
                  <span className="score">
                    {fmt(view.result.scores[seat]!)}
                  </span>
                )}
              </div>
              <SeatBadges
                bot={p.isBot}
                offline={offline.has(p.id)}
                knocked={view.knockerIdx === seat}
              />
            </div>
          )
        })}

        {me && (
          <div
            className={`seat seat--you ${yourTurn ? "seat--turn" : ""} ${me.out ? "seat--out" : ""}`}
            style={rimStyle(0, view.players.length)}>
            <span className="seat-name">You</span>
            <div className="seat-foot">
              <Lives lives={me.lives} />
              {showdown && view.result?.scores[view.you] != null && (
                <span className="score">
                  {fmt(view.result.scores[view.you]!)}
                </span>
              )}
            </div>
            <SeatBadges
              bot={false}
              offline={false}
              knocked={view.knockerIdx === view.you}
            />
          </div>
        )}
      </div>

      <div className="game-side">
        <p className="game-status" aria-live="polite">
          {training?.status ?? prompt(
            view,
            yourTurn,
            offline.has(view.players[view.turnIdx]?.id ?? ""),
          )}
          {yourTurn && secsLeft !== null && ` (${secsLeft}s)`}
        </p>
        {msLeft !== null && (
          <div
            className={`turn-timer ${secsLeft! <= 5 ? "turn-timer--low" : ""}`}
            aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, (msLeft / ROOM_LIMITS.turnMs) * 100)}%`,
              }}
            />
          </div>
        )}

        <p className="game-log">
          {showdown ? resultText(view) : describeEvent(view, ev)}
        </p>

        {me && (
          <div className={`you ${yourTurn ? "you--turn" : ""}`}>
            <div className="card-row">
              {me.hand.map((c, i) => (
                <CardView
                  key={`${view.seq}-${i}`}
                  card={c}
                  flash={flashHand(view.you, i)}
                  hint={training?.handIdx === i}
                  selected={allSel !== null || handSel === i}
                  label={`Your card ${i + 1}`}
                  onClick={
                    canPlay
                      ? () => {
                          setAllSel(null)
                          setHandSel(handSel === i ? null : i)
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}

        {yourTurn && view.phase === "schieben" && (
          <div className="row">
            <button className={`secondary ${training?.action === "KEEP" ? "training-target" : ""}`} onClick={() => act({ type: "KEEP" })}>
              Keep
            </button>
            <button onClick={() => act({ type: "PUSH" })}>Push</button>
          </div>
        )}

        {(canPlay || canLayDown) && (
          <div className="row">
            {canPlay && (
              <>
                <button
                  className={training?.action === "SWAP" || training?.action === "SWAP_ALL" ? "training-target" : ""}
                  disabled={!allSel && (handSel === null || !poolSel)}
                  onClick={swap}>
                  Swap
                </button>
                <button
                  className={`danger ${training?.action === "KNOCK" ? "training-target" : ""}`}
                  onClick={() => act({ type: "KNOCK" })}>
                  {view.knockerIdx === null ? "Knock" : "Stand"}
                </button>
              </>
            )}
            {canLayDown && (
              <button
                className="laydown"
                onClick={() => act({ type: "LAY_DOWN" })}>
                Lay down!
              </button>
            )}
          </div>
        )}

        {!training && error && <p className="error">{error}</p>}

        {!training && <div className="row row--spaced">
          {isHost && (
            <button
              className="secondary"
              onClick={() => {
                if (
                  view.phase === "gameEnd" ||
                  window.confirm("End the game and go back to the lobby?")
                )
                  commands.returnToLobby()
              }}>
              {view.phase === "gameEnd" ? "Back to lobby" : "End game"}
            </button>
          )}
          <button className="secondary" onClick={onLeave}>
            Leave
          </button>
        </div>}
      </div>
    </div>
  )
}

export interface TrainingGuide {
  status?: string
  handIdx?: number
  pool?: PoolName
  poolIdx?: number
  all?: boolean
  action?: GameAction["type"]
}

function seatsOffline(room: RoomState): string[] {
  return room.seats.flatMap((p) => (p && !p.connected ? [p.id] : []))
}

function SeatBadges({
  bot,
  offline,
  knocked,
}: {
  bot: boolean
  offline: boolean
  knocked: boolean
}) {
  if (!bot && !offline && !knocked) return null
  return (
    <div className="seat-badges">
      {bot && <span className="badge badge--bot">bot</span>}
      {offline && <span className="badge badge--offline">offline</span>}
      {knocked && <span className="badge badge--knock">knocked</span>}
    </div>
  )
}
