import { useEffect, useRef, useState } from "react"

import {
  OUTDATED_CLIENT_ERROR,
  type GameView,
  type RoomActionResult,
  type RoomState,
} from "@hosn-obe/shared"

import { socketCommands } from "./commands.js"
import { Game } from "./Game.js"
import { Home } from "./Home.js"
import { Lobby } from "./Lobby.js"
import { exitApp, keepAwake, onBackButton, onResume } from "./native.js"
import {
  PRACTICE_YOU_ID,
  PracticeTable,
  type PracticeSnapshot,
} from "./practice.js"
import { Room } from "./Room.js"
import {
  clearToken,
  forgetSeat,
  loadName,
  loadSeat,
  loadToken,
  saveToken,
} from "./session.js"
import { Settings } from "./Settings.js"
import { socket } from "./socket.js"
import { isMuted, setMuted } from "./sound.js"

type Screen = "home" | "online" | "settings"

/** After this long without a connection, hint that a sleeping server may be waking up. */
const SLOW_CONNECT_MS = 5000

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  return online
}

export function App() {
  const [connected, setConnected] = useState(socket.connected)
  const [slow, setSlow] = useState(false)
  const [outdated, setOutdated] = useState(false)
  const online = useOnline()
  const [muted, setMutedState] = useState(isMuted)
  const [screen, setScreen] = useState<Screen>("home")
  const [room, setRoom] = useState<RoomState | null>(null)
  const [game, setGame] = useState<GameView | null>(null)
  const [youId, setYouId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [practice, setPractice] = useState<PracticeTable | null>(null)
  const [practiceSnap, setPracticeSnap] = useState<PracticeSnapshot | null>(
    null,
  )
  const roomRef = useRef(room)
  roomRef.current = room

  useEffect(() => {
    function exitRoom(message: string | null) {
      clearToken()
      forgetSeat()
      if (roomRef.current) setScreen("online")
      setRoom(null)
      setGame(null)
      setNotice(message)
    }
    function onConnect() {
      setConnected(true)
      const token = loadToken()
      if (!token) return
      socket.emit("room:resume", { token }, (result: RoomActionResult) => {
        if (result.ok) setYouId(result.youId)
        else exitRoom(roomRef.current ? result.error : null)
      })
    }
    function onDisconnect() {
      setConnected(false)
    }
    function onConnectError(err: Error) {
      if (err.message === OUTDATED_CLIENT_ERROR) setOutdated(true)
    }
    function onRoomState(next: RoomState) {
      setNotice(null)
      setRoom(next)
      if (next.phase === "lobby") setGame(null)
    }
    function onRoomClosed({ reason }: { reason: string }) {
      exitRoom(reason)
    }

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onConnectError)
    socket.on("room:state", onRoomState)
    socket.on("room:closed", onRoomClosed)
    socket.on("game:state", setGame)
    if (socket.connected) onConnect()
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onConnectError)
      socket.off("room:state", onRoomState)
      socket.off("room:closed", onRoomClosed)
      socket.off("game:state", setGame)
    }
  }, [])

  const atTable = practice !== null || room !== null
  useEffect(() => keepAwake(atTable), [atTable])

  useEffect(() => {
    setSlow(false)
    if (connected) return
    const id = setTimeout(() => setSlow(true), SLOW_CONNECT_MS)
    return () => clearTimeout(id)
  }, [connected])

  useEffect(
    () =>
      onResume(() => {
        // A backgrounded WebView throttles reconnect timers; retry right away.
        if (!socket.connected) socket.connect()
      }),
    [],
  )

  const backRef = useRef(() => {})
  backRef.current = () => {
    if (practice || room) confirmLeave()
    else if (screen !== "home") setScreen("home")
    else exitApp()
  }
  useEffect(() => onBackButton(() => backRef.current()), [])

  const seatedInGame =
    !!room &&
    room.phase === "playing" &&
    game?.phase !== "gameEnd" &&
    room.seats.some((p) => p?.id === youId)

  useEffect(() => {
    if (!seatedInGame) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [seatedInGame])

  function confirmLeave() {
    if (practice) {
      if (
        practiceSnap?.room.phase !== "playing" ||
        window.confirm("Quit practice?")
      )
        leavePractice()
    } else if (room) {
      const question = seatedInGame
        ? "Leave the game? A bot will take over your seat until you return."
        : "Leave the room?"
      if (window.confirm(question)) handleLeave()
    }
  }

  function handleJoined(id: string, token: string, code: string) {
    saveToken(token, code)
    setYouId(id)
  }

  function handleLeave() {
    socket.emit("room:leave")
    clearToken()
    if (!seatedInGame) forgetSeat()
    setScreen("online")
    setRoom(null)
    setGame(null)
  }

  function returnToGame() {
    const seat = loadSeat()
    if (!seat) return
    socket.emit(
      "room:resume",
      { token: seat.token },
      (result: RoomActionResult) => {
        if (result.ok) {
          handleJoined(result.youId, result.token, result.code)
        } else {
          forgetSeat()
          setNotice(result.error)
        }
      },
    )
  }

  function startPractice() {
    const table = new PracticeTable(loadName() || "Player", setPracticeSnap)
    setPractice(table)
    setPracticeSnap(table.snapshot())
  }

  function leavePractice() {
    practice?.dispose()
    setPractice(null)
    setPracticeSnap(null)
    setScreen("home")
  }

  const home = !practice && !room && screen === "home"
  const returnCode =
    !practice && !room && connected ? (loadSeat()?.code ?? null) : null
  const banner =
    practice || connected
      ? null
      : outdated
        ? OUTDATED_CLIENT_ERROR
        : !online
          ? "No internet connection."
          : `${room ? "Connection lost — reconnecting…" : "Can't reach the server — retrying…"}${
              slow
                ? " The server may be waking up; this can take up to a minute."
                : ""
            }`

  function toggleMute() {
    setMuted(!muted)
    setMutedState(!muted)
  }

  return (
    <div className="app">
      <header className="topbar">
        {!home && <h1>Hosn Obe</h1>}
        <button
          type="button"
          className="btn-icon mute"
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={muted}
          onClick={toggleMute}>
          {muted ? "🔇" : "🔊"}
        </button>
        {practice ? (
          <span className="status status--practice">practice</span>
        ) : (
          <span
            className={`status ${connected ? "status--on" : "status--off"}`}>
            {connected ? "connected" : room ? "reconnecting…" : "offline"}
          </span>
        )}
      </header>

      {banner && (
        <p className="offline-banner" role="status">
          {banner}
        </p>
      )}

      {practice && practiceSnap ? (
        practiceSnap.room.phase === "playing" && practiceSnap.view ? (
          <Game
            view={practiceSnap.view}
            room={practiceSnap.room}
            isHost
            commands={practice}
            onLeave={confirmLeave}
          />
        ) : (
          <Room
            room={practiceSnap.room}
            youId={PRACTICE_YOU_ID}
            commands={practice}
            practice
            onLeave={leavePractice}
          />
        )
      ) : room && room.phase === "playing" && game ? (
        <Game
          view={game}
          room={room}
          isHost={room.hostId === youId}
          connected={connected}
          commands={socketCommands}
          onLeave={confirmLeave}
        />
      ) : room ? (
        <Room
          room={room}
          youId={youId}
          commands={socketCommands}
          onLeave={handleLeave}
        />
      ) : screen === "online" ? (
        <Lobby
          onJoined={handleJoined}
          onBack={() => setScreen("home")}
          notice={notice}
          returnCode={returnCode}
          onReturn={returnToGame}
        />
      ) : screen === "settings" ? (
        <Settings onBack={() => setScreen("home")} />
      ) : (
        <Home
          onOnline={() => setScreen("online")}
          onPractice={startPractice}
          onSettings={() => setScreen("settings")}
          notice={notice}
          returnCode={returnCode}
          onReturn={returnToGame}
        />
      )}
    </div>
  )
}
