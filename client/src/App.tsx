import { useEffect, useRef, useState } from "react";

import type { RoomState } from "@hosn-obe/shared";

import { Lobby } from "./Lobby.js";
import { Room } from "./Room.js";
import { socket } from "./socket.js";

export function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setYouId(socket.id ?? null);
    }
    function onDisconnect() {
      setConnected(false);
      // The server drops your seat on disconnect (until reconnection tokens land).
      if (roomRef.current) setNotice("Connection lost — you left the room.");
      setRoom(null);
    }
    function onRoomState(next: RoomState) {
      setNotice(null);
      setRoom(next);
    }
    function onRoomClosed({ reason }: { reason: string }) {
      setNotice(reason);
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
        <Lobby onJoined={setYouId} notice={notice} />
      )}
    </div>
  );
}
