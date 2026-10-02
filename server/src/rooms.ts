/**
 * In-memory room registry for the Hosn Obe lobby.
 *
 * v1 keeps everything in a single-process `Map`. A Redis-backed adapter can
 * replace this later without changing the socket contract (see the plan).
 */

import { randomInt, randomUUID } from "node:crypto";

import {
  BOT_LEVELS,
  ROOM_LIMITS,
  seatedPlayers,
  startBlocker,
  type BotLevel,
  type RoomActionResult,
  type RoomPlayer,
  type RoomState,
} from "@hosn-obe/shared";

/** A rejected room operation; the message is safe to show to the user. */
export class RoomError extends Error {}

type ServerRoom = RoomState;

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

function parseBotLevel(raw: unknown): BotLevel {
  return BOT_LEVELS.find((l) => l === raw) ?? "normal";
}

function seatIndex(room: ServerRoom, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw >= room.seats.length) {
    throw new RoomError("Invalid seat.");
  }
  return raw;
}

function human(id: string, name: unknown, isHost: boolean): RoomPlayer {
  return { id, name: sanitizeName(name), isHost, isBot: false, ready: isHost, connected: true };
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
    this.leaveRoom(socketId);

    const code = this.uniqueCode();
    const size = clampMaxPlayers(maxPlayers);
    const seats: (RoomPlayer | null)[] = Array(size).fill(null);
    seats[0] = human(socketId, name, true);
    this.rooms.set(code, { code, hostId: socketId, maxPlayers: size, seats, phase: "lobby" });
    this.socketRoom.set(socketId, code);
    return { ok: true, code, youId: socketId };
  }

  joinRoom(socketId: string, rawCode: unknown, name: unknown): RoomActionResult {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "Room not found." };
    if (room.seats.some((p) => p?.id === socketId)) return { ok: true, code, youId: socketId };
    if (room.phase !== "lobby") return { ok: false, error: "Game already in progress." };
    const seatIdx = room.seats.indexOf(null);
    if (seatIdx === -1) return { ok: false, error: "Room is full." };

    this.leaveRoom(socketId);
    room.seats[seatIdx] = human(socketId, name, false);
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

    const idx = room.seats.findIndex((p) => p?.id === socketId);
    if (idx !== -1) room.seats[idx] = null;

    const humans = seatedPlayers(room).filter((p) => !p.isBot);
    if (humans.length === 0) {
      this.rooms.delete(code);
      return room;
    }
    if (room.hostId === socketId) {
      const next = humans[0]!;
      room.hostId = next.id;
      next.isHost = true;
      next.ready = true;
    }
    return room;
  }

  setReady(socketId: string, ready: unknown): ServerRoom {
    const room = this.memberRoom(socketId);
    if (room.phase !== "lobby") throw new RoomError("The game has already started.");
    const player = room.seats.find((p) => p?.id === socketId);
    if (player && !player.isHost) player.ready = ready === true;
    return room;
  }

  setMaxPlayers(socketId: string, raw: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const size = clampMaxPlayers(raw);
    if (seatedPlayers(room).length > size) {
      throw new RoomError("Remove players before shrinking the table.");
    }
    // Players in cut-off seats move into the first free seats that remain.
    const overflow = seatedPlayers({ seats: room.seats.slice(size) });
    const seats = room.seats.slice(0, size);
    while (seats.length < size) seats.push(null);
    for (const p of overflow) seats[seats.indexOf(null)] = p;
    room.seats = seats;
    room.maxPlayers = size;
    return room;
  }

  addBot(socketId: string, rawSeat: unknown, level: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const idx = seatIndex(room, rawSeat);
    if (room.seats[idx]) throw new RoomError("That seat is taken.");
    room.seats[idx] = {
      id: `bot:${randomUUID()}`,
      name: this.botName(room),
      isHost: false,
      isBot: true,
      botLevel: parseBotLevel(level),
      ready: true,
      connected: true,
    };
    return room;
  }

  removeBot(socketId: string, rawSeat: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const idx = seatIndex(room, rawSeat);
    if (!room.seats[idx]?.isBot) throw new RoomError("That seat has no bot.");
    room.seats[idx] = null;
    return room;
  }

  setBotLevel(socketId: string, rawSeat: unknown, level: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const bot = room.seats[seatIndex(room, rawSeat)];
    if (!bot?.isBot) throw new RoomError("That seat has no bot.");
    if (!BOT_LEVELS.some((l) => l === level)) throw new RoomError("Invalid bot level.");
    bot.botLevel = level as BotLevel;
    return room;
  }

  /** Remove a human from the host's room; returns the kicked socket id. */
  kick(socketId: string, rawSeat: unknown): { room: ServerRoom; kickedId: string } {
    const room = this.lobbyHostRoom(socketId);
    const target = room.seats[seatIndex(room, rawSeat)];
    if (!target || target.isBot || target.id === socketId) {
      throw new RoomError("You can't remove that seat.");
    }
    this.leaveRoom(target.id);
    return { room, kickedId: target.id };
  }

  start(socketId: string): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const blocker = startBlocker(room);
    if (blocker) throw new RoomError(blocker);
    room.phase = "playing";
    return room;
  }

  returnToLobby(socketId: string): ServerRoom {
    const room = this.hostRoom(socketId);
    if (room.phase === "lobby") return room;
    room.phase = "lobby";
    for (const p of seatedPlayers(room)) p.ready = p.isHost || p.isBot;
    return room;
  }

  getRoom(code: string): ServerRoom | null {
    return this.rooms.get(code) ?? null;
  }

  toState(room: ServerRoom): RoomState {
    return { ...room, seats: room.seats.map((p) => (p ? { ...p } : null)) };
  }

  private memberRoom(socketId: string): ServerRoom {
    const code = this.socketRoom.get(socketId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) throw new RoomError("You are not in a room.");
    return room;
  }

  private hostRoom(socketId: string): ServerRoom {
    const room = this.memberRoom(socketId);
    if (room.hostId !== socketId) throw new RoomError("Only the host can do that.");
    return room;
  }

  private lobbyHostRoom(socketId: string): ServerRoom {
    const room = this.hostRoom(socketId);
    if (room.phase !== "lobby") throw new RoomError("The game has already started.");
    return room;
  }

  private botName(room: ServerRoom): string {
    const taken = new Set(seatedPlayers(room).map((p) => p.name));
    let n = 1;
    while (taken.has(`Bot ${n}`)) n++;
    return `Bot ${n}`;
  }
}
