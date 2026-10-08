import {
  BOT_LEVELS,
  ROOM_LIMITS,
  seatedPlayers,
  startBlocker,
  type BotLevel,
  type RoomPlayer,
  type RoomState,
} from "@hosn-obe/shared"

import type { RoomCommands } from "./commands.js"
import { useServerError } from "./useServerError.js"

const SEAT_COUNTS = Array.from(
  { length: ROOM_LIMITS.maxPlayers - ROOM_LIMITS.minPlayers + 1 },
  (_, i) => ROOM_LIMITS.minPlayers + i,
)

/** Seated view: seats, ready state and (for the host) table controls. */
export function Room({
  room,
  youId,
  commands,
  practice = false,
  onLeave,
}: {
  room: RoomState
  youId: string | null
  commands: RoomCommands
  practice?: boolean
  onLeave: () => void
}) {
  const error = useServerError()

  const isHost = room.hostId === youId
  const inLobby = room.phase === "lobby"
  const me = room.seats.find((p) => p?.id === youId) ?? null
  const blocker = startBlocker(room)
  const nextFree = room.seats.indexOf(null)

  return (
    <div className="panel">
      <div className="room-header">
        {practice ? (
          <div>
            <span className="label">Practice</span>
            <span className="room-title">You vs. bots</span>
          </div>
        ) : (
          <div>
            <span className="label">Room code</span>
            <span className="code">{room.code}</span>
          </div>
        )}
        {isHost && inLobby ? (
          <label className="inline-field">
            <span>Seats</span>
            <select
              value={room.maxPlayers}
              onChange={(e) => commands.setMaxPlayers(Number(e.target.value))}>
              {SEAT_COUNTS.map((n) => (
                <option
                  key={n}
                  value={n}
                  disabled={n < seatedPlayers(room).length}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="seats">
            {seatedPlayers(room).length}/{room.maxPlayers}
          </span>
        )}
      </div>

      {!inLobby && <p className="notice">Loading the table…</p>}

      {inLobby && !me && room.spectators.some((p) => p.id === youId) && (
        <p className="notice">
          The table is full — you'll get a seat when one frees up.
        </p>
      )}

      <ul className="players">
        {room.seats.map((p, seatIdx) =>
          p ? (
            <SeatRow
              key={p.id}
              player={p}
              isYou={p.id === youId}
              canEdit={isHost && inLobby && !p.isHost}
              onRemove={() =>
                p.isBot ? commands.removeBot(seatIdx) : commands.kick(seatIdx)
              }
              onLevel={(level) => commands.setBotLevel(seatIdx, level)}
            />
          ) : (
            <li key={`empty-${seatIdx}`} className="player player--empty">
              <span className="player-name">Empty seat</span>
              {isHost && inLobby && seatIdx === nextFree && (
                <button
                  className="btn-small"
                  onClick={() => commands.addBot(seatIdx, "normal")}>
                  + Bot
                </button>
              )}
            </li>
          ),
        )}
      </ul>

      {room.spectators.length > 0 && (
        <p className="hint hint--left">
          Watching:{" "}
          {room.spectators
            .map((p) => (p.id === youId ? "you" : p.name))
            .join(", ")}
        </p>
      )}

      {inLobby && isHost && (
        <>
          <div className="row">
            <button
              disabled={blocker !== null}
              onClick={() => commands.start()}>
              Start game
            </button>
          </div>
          {blocker && <p className="hint">{blocker}</p>}
        </>
      )}

      {inLobby && !isHost && me && (
        <div className="row">
          <button
            className={me.ready ? "secondary" : undefined}
            onClick={() => commands.setReady(!me.ready)}>
            {me.ready ? "Not ready" : "Ready"}
          </button>
        </div>
      )}

      {!inLobby && isHost && (
        <div className="row">
          <button onClick={() => commands.returnToLobby()}>
            Back to lobby
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="row row--spaced">
        <button className="secondary" onClick={onLeave}>
          {practice ? "Quit practice" : "Leave room"}
        </button>
      </div>
    </div>
  )
}

function SeatRow({
  player,
  isYou,
  canEdit,
  onRemove,
  onLevel,
}: {
  player: RoomPlayer
  isYou: boolean
  canEdit: boolean
  onRemove: () => void
  onLevel: (level: BotLevel) => void
}) {
  return (
    <li className="player">
      <span className="player-name">{player.name}</span>
      <span className="badges">
        {isYou && <span className="badge badge--you">you</span>}
        {!player.connected && (
          <span className="badge badge--offline">offline</span>
        )}
        {player.isHost && <span className="badge badge--host">host</span>}
        {player.isBot &&
          (canEdit ? (
            <select
              className="bot-level"
              aria-label={`${player.name} difficulty`}
              value={player.botLevel}
              onChange={(e) => onLevel(e.target.value as BotLevel)}>
              {BOT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <span className="badge badge--bot">bot · {player.botLevel}</span>
          ))}
        {!player.isHost && !player.isBot && (
          <span
            className={`badge ${player.ready ? "badge--ready" : "badge--waiting"}`}>
            {player.ready ? "ready" : "not ready"}
          </span>
        )}
        {canEdit && (
          <button
            className="btn-icon"
            aria-label={`Remove ${player.name}`}
            onClick={onRemove}>
            ✕
          </button>
        )}
      </span>
    </li>
  )
}
