import { useState } from "react"

import { ROOM_LIMITS, type RoomActionResult } from "@hosn-obe/shared"

import { loadName, saveName } from "./session.js"
import { socket } from "./socket.js"

/** Create or join a room. On success the parent receives your player id; the
 * room contents arrive via the broadcast `room:state` event. */
export function Lobby({
  onJoined,
  onBack,
  notice,
  returnCode,
  onReturn,
}: {
  onJoined: (youId: string, token: string, code: string) => void
  onBack: () => void
  notice: string | null
  returnCode: string | null
  onReturn: () => void
}) {
  const [name, setName] = useState(loadName)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handleResult(result: RoomActionResult) {
    setBusy(false)
    if (result.ok) {
      setError(null)
      onJoined(result.youId, result.token, result.code)
    } else {
      setError(result.error)
    }
  }

  function createRoom() {
    setBusy(true)
    setError(null)
    saveName(name)
    socket.emit("room:create", { name }, handleResult)
  }

  function joinRoom() {
    // Rejoining the room you left mid-game takes your seat back instead of spectating.
    if (code === returnCode) return onReturn()
    setBusy(true)
    setError(null)
    saveName(name)
    socket.emit("room:join", { code, name }, handleResult)
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Play online</h2>
      {notice && <p className="notice">{notice}</p>}
      {returnCode && (
        <div className="row">
          <button disabled={busy} onClick={onReturn}>
            Return to game ({returnCode})
          </button>
        </div>
      )}
      <label className="field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={ROOM_LIMITS.nameMaxLength}
          placeholder="Player"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="row">
        <button disabled={busy} onClick={createRoom}>
          Create room
        </button>
      </div>

      <div className="divider">or</div>

      <label className="field">
        <span>Room code</span>
        <input
          value={code}
          maxLength={ROOM_LIMITS.codeLength}
          placeholder="ABCDE"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <div className="row">
        <button
          disabled={busy || code.length < ROOM_LIMITS.codeLength}
          onClick={joinRoom}>
          Join room
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="row row--spaced">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
