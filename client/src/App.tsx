import { useEffect, useRef, useState } from "react";

import type { GameView, RoomActionResult, RoomState } from "@hosn-obe/shared";

import { Game } from "./Game.js";
import { Lobby } from "./Lobby.js";
import { Room } from "./Room.js";
import { clearToken, loadToken, saveToken } from "./session.js";
import { socket } from "./socket.js";

export function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    function exitRoom(message: string | null) {
      clearToken();
      setRoom(null);
      setGame(null);
      setNotice(message);
    }
    function onConnect() {
      setConnected(true);
      const token = loadToken();
      if (!token) return;
      socket.emit("room:resume", { token }, (result: RoomActionResult) => {
        if (result.ok) setYouId(result.youId);
        else exitRoom(roomRef.current ? result.error : null);
      });
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onRoomState(next: RoomState) {
      setNotice(null);
      setRoom(next);
      if (next.phase === "lobby") setGame(null);
    }
    function onRoomClosed({ reason }: { reason: string }) {
      exitRoom(reason);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("room:closed", onRoomClosed);
    socket.on("game:state", setGame);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("room:closed", onRoomClosed);
      socket.off("game:state", setGame);
    };
  }, []);

  function handleJoined(id: string, token: string) {
    saveToken(token);
    setYouId(id);
  }

  function handleLeave() {
    socket.emit("room:leave");
    clearToken();
    setRoom(null);
    setGame(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Hosn Obe</h1>
        <span className={`status ${connected ? "status--on" : "status--off"}`}>
          {connected ? "connected" : room ? "reconnecting…" : "offline"}
        </span>
      </header>

      {room && room.phase === "playing" && game ? (
        <Game view={game} room={room} isHost={room.hostId === youId} onLeave={handleLeave} />
      ) : room ? (
        <Room room={room} youId={youId} onLeave={handleLeave} />
      ) : (
        <Lobby onJoined={handleJoined} notice={notice} />
      )}
    </div>
  );
}
