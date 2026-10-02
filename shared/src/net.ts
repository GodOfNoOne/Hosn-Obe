/**
 * Network contracts shared between the server and client: rooms (create/join
 * by code, seats, host controls, bots, ready/start, resume) and gameplay
 * (`game:action` in, personalized `game:state` out).
 */

import type { GameAction, GameView } from "./game.js";

export type BotLevel = "easy" | "normal" | "hard";
export const BOT_LEVELS: readonly BotLevel[] = ["easy", "normal", "hard"];

/** A seat occupant in a room lobby. */
export interface RoomPlayer {
  /** Stable per-connection id (socket id for now; `bot:*` for bots). */
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  botLevel?: BotLevel;
  /** Humans toggle this; the host and bots are always ready. */
  ready: boolean;
  connected: boolean;
}

export type RoomPhase = "lobby" | "playing";

/** Public, sanitized view of a room shared with every member. */
export interface RoomState {
  code: string;
  hostId: string;
  maxPlayers: number;
  /** Length is always `maxPlayers`; `null` marks an empty seat. */
  seats: (RoomPlayer | null)[];
  phase: RoomPhase;
}

/** Result of a create/join/resume request, returned via a socket acknowledgement. */
export type RoomActionResult =
  /** `token` is a secret for `room:resume`; keep it out of logs and other players' view. */
  | { ok: true; code: string; youId: string; token: string }
  | { ok: false; error: string };

/** Constraints validated on the server (and mirrored in client UI). */
export const ROOM_LIMITS = {
  minPlayers: 2,
  // 32 cards: 3 per player plus the two 3-card table pools.
  maxPlayers: 8,
  codeLength: 5,
  nameMaxLength: 20,
} as const;

export function seatedPlayers(room: Pick<RoomState, "seats">): RoomPlayer[] {
  return room.seats.filter((p): p is RoomPlayer => p !== null);
}

/** Why the host can't start yet, or `null` if the room is ready to start. */
export function startBlocker(room: RoomState): string | null {
  if (room.phase !== "lobby") return "The game has already started.";
  const seated = seatedPlayers(room);
  if (seated.length < ROOM_LIMITS.minPlayers) {
    return `Need at least ${ROOM_LIMITS.minPlayers} players.`;
  }
  if (seated.some((p) => !p.ready)) return "Waiting for everyone to be ready.";
  return null;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  "room:create": (
    payload: { name: string; maxPlayers?: number },
    ack: (result: RoomActionResult) => void,
  ) => void;
  "room:join": (
    payload: { code: string; name: string },
    ack: (result: RoomActionResult) => void,
  ) => void;
  "room:leave": () => void;
  /** Rebind this connection to the seat a previous connection held. */
  "room:resume": (
    payload: { token: string },
    ack: (result: RoomActionResult) => void,
  ) => void;
  "room:setReady": (payload: { ready: boolean }) => void;
  // Host-only below; the server rejects them from anyone else.
  "room:setMaxPlayers": (payload: { maxPlayers: number }) => void;
  "room:addBot": (payload: { seatIdx: number; level: BotLevel }) => void;
  "room:removeBot": (payload: { seatIdx: number }) => void;
  "room:setBotLevel": (payload: { seatIdx: number; level: BotLevel }) => void;
  "room:kick": (payload: { seatIdx: number }) => void;
  "room:start": () => void;
  "room:returnToLobby": () => void;
  "game:action": (action: GameAction) => void;
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:closed": (payload: { reason: string }) => void;
  "room:error": (payload: { message: string }) => void;
  /** Personalized per seat: never contains cards that seat may not see. */
  "game:state": (view: GameView) => void;
}
