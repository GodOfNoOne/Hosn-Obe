import type { RoomState } from "@hosn-obe/shared";

/** Lobby view once seated: room code and the live list of players. */
export function Room({
  room,
  youId,
  onLeave,
}: {
  room: RoomState;
  youId: string | null;
  onLeave: () => void;
}) {
  return (
    <div className="panel">
      <div className="room-header">
        <div>
          <span className="label">Room code</span>
          <span className="code">{room.code}</span>
        </div>
        <span className="seats">
          {room.players.length}/{room.maxPlayers}
        </span>
      </div>

      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id} className="player">
            <span className="player-name">{p.name}</span>
            <span className="badges">
              {p.id === youId && <span className="badge badge--you">you</span>}
              {p.isHost && <span className="badge badge--host">host</span>}
              {p.isBot && <span className="badge badge--bot">bot</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="row">
        <button className="secondary" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
