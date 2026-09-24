/**
 * Network contracts shared between the server and client.
 *
 * Phase 1 covers only the lobby / "hello room" surface: creating and joining
 * rooms and syncing the seat list. Gameplay events (deal, schieben, knock, …)
 * are layered on in later phases.
 */

/** A seat occupant in a room lobby. */
export interface RoomPlayer {
  /** Stable per-connection id (socket id for now). */
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
}

/** Public, sanitized view of a room shared with every member. */
export interface RoomState {
  code: string;
  hostId: string;
  maxPlayers: number;
  players: RoomPlayer[];
  /** Lobby for now; extended with gameplay phases later. */
  phase: "lobby";
}

/** Result of a create/join request, returned via a socket acknowledgement. */
export type RoomActionResult =
  | { ok: true; code: string; youId: string }
  | { ok: false; error: string };

/** Constraints validated on the server (and mirrored in client UI). */
export const ROOM_LIMITS = {
  minPlayers: 2,
  maxPlayers: 9,
  codeLength: 5,
  nameMaxLength: 20,
} as const;

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
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  "room:state": (room: RoomState) => void;
  "room:closed": (payload: { reason: string }) => void;
  "room:error": (payload: { message: string }) => void;
}
