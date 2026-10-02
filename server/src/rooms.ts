/**
 * In-memory room registry for Hosn Obe: lobby seats, reconnection sessions,
 * and the authoritative game for each room.
 *
 * v1 keeps everything in a single-process `Map`. A Redis-backed adapter can
 * replace this later without changing the socket contract (see the plan).
 */

import { randomInt, randomUUID } from "node:crypto";

import {
  applyAction,
  BOT_LEVELS,
  chooseBotAction,
  convertToBot,
  createGame,
  ROOM_LIMITS,
  seatedPlayers,
  startBlocker,
  startRound,
  viewFor,
  type BotLevel,
  type GameAction,
  type GameState,
  type GameView,
  type RoomActionResult,
  type RoomPlayer,
  type RoomState,
} from "@hosn-obe/shared";

/** A rejected room operation; the message is safe to show to the user. */
export class RoomError extends Error {}

export const BOT_THINK_MS = 1200;
export const NEXT_ROUND_MS = 5000;

interface Member {
  /** Secret that lets a new connection reclaim this seat. */
  token: string;
  socketId: string | null;
}

interface ServerRoom extends RoomState {
  members: Map<string, Member>;
  game: GameState | null;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Session {
  code: string;
  playerId: string;
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

function parseBotLevel(raw: unknown): BotLevel {
  return BOT_LEVELS.find((l) => l === raw) ?? "normal";
}

function seatIndex(room: ServerRoom, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw >= room.seats.length) {
    throw new RoomError("Invalid seat.");
  }
  return raw;
}

function humans(room: ServerRoom): RoomPlayer[] {
  return seatedPlayers(room).filter((p) => !p.isBot);
}

export class RoomManager {
  private readonly rooms = new Map<string, ServerRoom>();
  private readonly sockets = new Map<string, Session>();
  private readonly tokens = new Map<string, Session>();

  createRoom(socketId: string, name: unknown, maxPlayers: unknown): RoomActionResult {
    this.leaveRoom(socketId);

    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();
    const size = clampMaxPlayers(maxPlayers);
    const room: ServerRoom = {
      code,
      hostId: "",
      maxPlayers: size,
      seats: Array(size).fill(null),
      phase: "lobby",
      members: new Map(),
      game: null,
      timer: null,
    };
    this.rooms.set(code, room);
    const result = this.seatHuman(room, 0, socketId, name);
    room.hostId = result.youId;
    room.seats[0]!.isHost = true;
    room.seats[0]!.ready = true;
    return result;
  }

  joinRoom(socketId: string, rawCode: unknown, name: unknown): RoomActionResult {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "Room not found." };
    if (room.phase !== "lobby") return { ok: false, error: "Game already in progress." };
    const seatIdx = room.seats.indexOf(null);
    if (seatIdx === -1) return { ok: false, error: "Room is full." };

    this.leaveRoom(socketId);
    return this.seatHuman(room, seatIdx, socketId, name);
  }

  /** Rebind a new connection to an existing seat. `staleSocketId` held it before. */
  resume(
    socketId: string,
    rawToken: unknown,
  ): { result: RoomActionResult; staleSocketId: string | null } {
    const session = typeof rawToken === "string" ? this.tokens.get(rawToken) : undefined;
    const room = session && this.rooms.get(session.code);
    const member = room?.members.get(session!.playerId);
    const player = room?.seats.find((p) => p?.id === session!.playerId);
    if (!session || !room || !member || !player) {
      return { result: { ok: false, error: "Your seat is no longer available." }, staleSocketId: null };
    }
    const current = this.sockets.get(socketId);
    if (current && current.playerId !== session.playerId) {
      return { result: { ok: false, error: "Leave your current room first." }, staleSocketId: null };
    }

    const stale = member.socketId !== socketId ? member.socketId : null;
    if (stale) this.sockets.delete(stale);
    member.socketId = socketId;
    player.connected = true;
    this.sockets.set(socketId, session);
    return {
      result: { ok: true, code: room.code, youId: player.id, token: member.token },
      staleSocketId: stale,
    };
  }

  /** Explicitly give up your seat. Returns the affected room, if any. */
  leaveRoom(socketId: string): ServerRoom | null {
    const session = this.sockets.get(socketId);
    if (!session) return null;
    const room = this.rooms.get(session.code);
    if (!room) return null;
    this.removePlayer(room, session.playerId);
    return room;
  }

  /** Connection dropped: keep the seat so the player can resume. */
  disconnect(socketId: string): { room: ServerRoom; playerId: string } | null {
    const session = this.sockets.get(socketId);
    if (!session) return null;
    this.sockets.delete(socketId);
    const room = this.rooms.get(session.code);
    const member = room?.members.get(session.playerId);
    if (!room || !member) return null;
    member.socketId = null;
    const player = room.seats.find((p) => p?.id === session.playerId);
    if (player) player.connected = false;
    return { room, playerId: session.playerId };
  }

  /** Grace period over: free a still-disconnected lobby seat; drop rooms nobody is connected to. */
  expire(code: string, playerId: string): ServerRoom | null {
    const room = this.rooms.get(code);
    const member = room?.members.get(playerId);
    if (!room || !member || member.socketId !== null) return null;
    if (room.phase === "lobby") this.removePlayer(room, playerId);
    if (this.rooms.has(code) && !humans(room).some((p) => p.connected)) this.deleteRoom(room);
    return room;
  }

  setReady(socketId: string, ready: unknown): ServerRoom {
    const { room, playerId } = this.memberRoom(socketId);
    if (room.phase !== "lobby") throw new RoomError("The game has already started.");
    const player = room.seats.find((p) => p?.id === playerId);
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

  /** Remove a human from the host's room; returns their socket (if connected). */
  kick(socketId: string, rawSeat: unknown): { room: ServerRoom; kickedSocketId: string | null } {
    const room = this.lobbyHostRoom(socketId);
    const target = room.seats[seatIndex(room, rawSeat)];
    if (!target || target.isBot || target.id === room.hostId) {
      throw new RoomError("You can't remove that seat.");
    }
    const kickedSocketId = room.members.get(target.id)?.socketId ?? null;
    this.removePlayer(room, target.id);
    return { room, kickedSocketId };
  }

  start(socketId: string): ServerRoom {
    const room = this.lobbyHostRoom(socketId);
    const blocker = startBlocker(room);
    if (blocker) throw new RoomError(blocker);
    room.game = createGame(
      seatedPlayers(room).map(({ id, name, isBot, botLevel }) =>
        botLevel ? { id, name, isBot, botLevel } : { id, name, isBot },
      ),
    );
    room.phase = "playing";
    return room;
  }

  returnToLobby(socketId: string): ServerRoom {
    const room = this.hostRoom(socketId).room;
    if (room.phase === "lobby") return room;
    this.clearTimer(room);
    room.game = null;
    room.phase = "lobby";
    for (const p of seatedPlayers(room)) p.ready = p.isHost || p.isBot;
    return room;
  }

  gameAction(socketId: string, action: GameAction): ServerRoom {
    const { room, playerId } = this.memberRoom(socketId);
    const seat = room.game?.players.findIndex((p) => p.id === playerId) ?? -1;
    if (!room.game || seat === -1) throw new RoomError("You're not in a game.");
    applyAction(room.game, seat, action);
    return room;
  }

  /**
   * Arm the room's single timer for whatever happens next without a human:
   * a bot's move or the next round. `onStep` runs after each automatic step.
   */
  schedule(code: string, onStep: (code: string) => void): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.clearTimer(room);
    const game = room.game;
    if (!game) return;

    let delay: number;
    let step: () => void;
    if (game.phase === "roundEnd") {
      delay = NEXT_ROUND_MS;
      step = () => startRound(game);
    } else if (
      (game.phase === "schieben" || game.phase === "play") &&
      game.players[game.turnIdx]!.isBot
    ) {
      delay = BOT_THINK_MS;
      step = () => {
        const seat = game.turnIdx;
        try {
          applyAction(game, seat, chooseBotAction(viewFor(game, seat)));
        } catch (err) {
          console.error("Bot move failed; falling back.", err);
          applyAction(game, seat, { type: game.phase === "schieben" ? "KEEP" : "KNOCK" });
        }
      };
    } else {
      return;
    }

    room.timer = setTimeout(() => {
      room.timer = null;
      if (this.rooms.get(code) !== room || room.game !== game) return;
      step();
      onStep(code);
    }, delay);
  }

  /** Each connected player's socket paired with their personalized view. */
  gameViews(code: string): [socketId: string, view: GameView][] {
    const room = this.rooms.get(code);
    const game = room?.game;
    if (!room || !game) return [];
    return game.players.flatMap((p, seat) => {
      const socketId = room.members.get(p.id)?.socketId;
      return socketId ? [[socketId, viewFor(game, seat)] as [string, GameView]] : [];
    });
  }

  getRoom(code: string): RoomState | null {
    return this.rooms.get(code) ?? null;
  }

  getGame(code: string): GameState | null {
    return this.rooms.get(code)?.game ?? null;
  }

  toState(room: RoomState): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      seats: room.seats.map((p) => (p ? { ...p } : null)),
      phase: room.phase,
    };
  }

  private seatHuman(
    room: ServerRoom,
    seatIdx: number,
    socketId: string,
    name: unknown,
  ): RoomActionResult & { ok: true } {
    const id = randomUUID();
    const token = randomUUID();
    room.seats[seatIdx] = {
      id,
      name: sanitizeName(name),
      isHost: false,
      isBot: false,
      ready: false,
      connected: true,
    };
    room.members.set(id, { token, socketId });
    const session = { code: room.code, playerId: id };
    this.sockets.set(socketId, session);
    this.tokens.set(token, session);
    return { ok: true, code: room.code, youId: id, token };
  }

  /** Free a human's seat (or hand it to a bot mid-game), promoting a new host if needed. */
  private removePlayer(room: ServerRoom, playerId: string): void {
    const member = room.members.get(playerId);
    if (member) {
      this.tokens.delete(member.token);
      if (member.socketId) this.sockets.delete(member.socketId);
      room.members.delete(playerId);
    }

    const idx = room.seats.findIndex((p) => p?.id === playerId);
    const player = room.seats[idx];
    if (player && room.game) {
      const level: BotLevel = "normal";
      Object.assign(player, { isBot: true, botLevel: level, isHost: false, ready: true, connected: true });
      convertToBot(room.game, playerId, level);
    } else if (idx !== -1) {
      room.seats[idx] = null;
    }

    const remaining = humans(room);
    if (remaining.length === 0) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === playerId) {
      const next = remaining.find((p) => p.connected) ?? remaining[0]!;
      room.hostId = next.id;
      next.isHost = true;
      next.ready = true;
    }
  }

  private deleteRoom(room: ServerRoom): void {
    this.clearTimer(room);
    for (const member of room.members.values()) {
      this.tokens.delete(member.token);
      if (member.socketId) this.sockets.delete(member.socketId);
    }
    this.rooms.delete(room.code);
  }

  private clearTimer(room: ServerRoom): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  private memberRoom(socketId: string): { room: ServerRoom; playerId: string } {
    const session = this.sockets.get(socketId);
    const room = session && this.rooms.get(session.code);
    if (!session || !room) throw new RoomError("You are not in a room.");
    return { room, playerId: session.playerId };
  }

  private hostRoom(socketId: string): { room: ServerRoom; playerId: string } {
    const member = this.memberRoom(socketId);
    if (member.room.hostId !== member.playerId) throw new RoomError("Only the host can do that.");
    return member;
  }

  private lobbyHostRoom(socketId: string): ServerRoom {
    const { room } = this.hostRoom(socketId);
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
