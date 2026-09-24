import { useEffect, useState } from "react";

import type { RoomState } from "@hosn-obe/shared";

import { Lobby } from "./Lobby.js";
import { Room } from "./Room.js";
import { socket } from "./socket.js";

export function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setYouId(socket.id ?? null);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onRoomState(next: RoomState) {
      setRoom(next);
    }
    function onRoomClosed() {
      setRoom(null);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoomState);
    socket.on("room:closed", onRoomClosed);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoomState);
      socket.off("room:closed", onRoomClosed);
    };
  }, []);

  function handleLeave() {
    socket.emit("room:leave");
    setRoom(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Hosn Obe</h1>
        <span className={`status ${connected ? "status--on" : "status--off"}`}>
          {connected ? "connected" : "offline"}
        </span>
      </header>

      {room ? (
        <Room room={room} youId={youId} onLeave={handleLeave} />
      ) : (
        <Lobby onJoined={setYouId} />
      )}
    </div>
  );
}
