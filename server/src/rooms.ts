/**
 * In-memory room registry for the Hosn Obe lobby.
 *
 * v1 keeps everything in a single-process `Map`. A Redis-backed adapter can
 * replace this later without changing the socket contract (see the plan).
 */

import { randomInt } from "node:crypto";

import {
  ROOM_LIMITS,
  type RoomActionResult,
  type RoomPlayer,
  type RoomState,
} from "@hosn-obe/shared";

interface ServerRoom {
  code: string;
  hostId: string;
  maxPlayers: number;
  /** Keyed by socket id, insertion order = seat order. */
  players: Map<string, RoomPlayer>;
}

/** Unambiguous code alphabet (no 0/O/1/I) to avoid misreads. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_LIMITS.codeLength; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function sanitizeName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return "Player";
  return name.slice(0, ROOM_LIMITS.nameMaxLength);
}

function clampMaxPlayers(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 4;
  return Math.min(ROOM_LIMITS.maxPlayers, Math.max(ROOM_LIMITS.minPlayers, n));
}

export class RoomManager {
  private readonly rooms = new Map<string, ServerRoom>();
  /** socket id -> room code, so we can find a player's room on leave/disconnect. */
  private readonly socketRoom = new Map<string, string>();

  private uniqueCode(): string {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    return code;
  }

  createRoom(socketId: string, name: unknown, maxPlayers: unknown): RoomActionResult {
    // A socket can only be in one room; drop any prior membership first.
    this.leaveRoom(socketId);

    const code = this.uniqueCode();
    const player: RoomPlayer = {
      id: socketId,
      name: sanitizeName(name),
      isHost: true,
      isBot: false,
      connected: true,
    };
    const room: ServerRoom = {
      code,
      hostId: socketId,
      maxPlayers: clampMaxPlayers(maxPlayers),
      players: new Map([[socketId, player]]),
    };
    this.rooms.set(code, room);
    this.socketRoom.set(socketId, code);
    return { ok: true, code, youId: socketId };
  }

  joinRoom(socketId: string, rawCode: unknown, name: unknown): RoomActionResult {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "Room not found." };
    if (room.players.has(socketId)) return { ok: true, code, youId: socketId };
    if (room.players.size >= room.maxPlayers) {
      return { ok: false, error: "Room is full." };
    }

    this.leaveRoom(socketId);
    room.players.set(socketId, {
      id: socketId,
      name: sanitizeName(name),
      isHost: false,
      isBot: false,
      connected: true,
    });
    this.socketRoom.set(socketId, code);
    return { ok: true, code, youId: socketId };
  }

  /** Remove a socket from its room. Returns the affected room, if any. */
  leaveRoom(socketId: string): ServerRoom | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return null;
    this.socketRoom.delete(socketId);

    const room = this.rooms.get(code);
    if (!room) return null;

    const wasHost = room.hostId === socketId;
    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return room;
    }
    // Promote the next-seated player to host if the host left.
    if (wasHost) {
      const next = room.players.keys().next().value as string;
      room.hostId = next;
      const promoted = room.players.get(next);
      if (promoted) promoted.isHost = true;
    }
    return room;
  }

  getRoomBySocket(socketId: string): ServerRoom | null {
    const code = this.socketRoom.get(socketId);
    return code ? this.rooms.get(code) ?? null : null;
  }

  getRoom(code: string): ServerRoom | null {
    return this.rooms.get(code) ?? null;
  }

  toState(room: ServerRoom): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      players: [...room.players.values()],
      phase: "lobby",
    };
  }
}
