/**
 * In-memory room registry for Hosn Obe: lobby seats, reconnection sessions,
 * and the authoritative game for each room.
 *
 * v1 keeps everything in a single-process `Map`. A Redis-backed adapter can
 * replace this later without changing the socket contract (see the plan).
 */

import { randomBytes, randomInt, randomUUID } from "node:crypto"

import {
  EMOTE_COOLDOWN_MS,
  isEmoteId,
  type EmoteEvent,
  applyAction,
  BOT_LEVELS,
  chooseBotAction,
  convertToBot,
  convertToHuman,
  createGame,
  missFire,
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
} from "@hosn-obe/shared"

import { log, q } from "./log.js"

/** A rejected room operation; the message is safe to show to the user. */
export class RoomError extends Error {}

export const BOT_THINK_MS = { min: 600, max: 1400 }
export const NEXT_ROUND_MS = 5000
export const TURN_MS = ROOM_LIMITS.turnMs
/** A disconnected human's turn is played by a stand-in bot after this long. */
export const AWAY_TURN_MS = 15_000
export const FIRE_MS = ROOM_LIMITS.fireMs
/** Skill of the stand-in for disconnected or departed humans. */
const STAND_IN_LEVEL: BotLevel = "normal"

interface Member {
  /** Secret that lets a new connection reclaim this seat. */
  token: string
  socketId: string | null
  lastEmoteAt?: number
}

interface ServerRoom extends RoomState {
  members: Map<string, Member>
  game: GameState | null
  timer: ReturnType<typeof setTimeout> | null
  /** What the armed timer is for, so a re-sync doesn't restart it. */
  timerKey: string | null
  /** When the human turn at game `seq` auto-plays (epoch ms). */
  deadline: { seq: number; at: number } | null
  /** Lay-down windows, keyed `round:seat`. */
  fireTimers: Map<string, ReturnType<typeof setTimeout>>
}

interface Session {
  code: string
  playerId: string
}

/** Unambiguous code alphabet (no 0/O/1/I) to avoid misreads. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generateCode(): string {
  let code = ""
  for (let i = 0; i < ROOM_LIMITS.codeLength; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

/** CSPRNG in [0, 1) so deals can't be predicted from earlier ones. */
function secureRandom(): number {
  return randomBytes(4).readUInt32BE() / 2 ** 32
}

function sanitizeName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : ""
  if (!name) return "Player"
  return name.slice(0, ROOM_LIMITS.nameMaxLength)
}

function clampMaxPlayers(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 4
  return Math.min(ROOM_LIMITS.maxPlayers, Math.max(ROOM_LIMITS.minPlayers, n))
}

function parseBotLevel(raw: unknown): BotLevel {
  return BOT_LEVELS.find((l) => l === raw) ?? "normal"
}

function seatIndex(room: ServerRoom, raw: unknown): number {
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw >= room.seats.length
  ) {
    throw new RoomError("Invalid seat.")
  }
  return raw
}

function humans(room: ServerRoom): RoomPlayer[] {
  return [...seatedPlayers(room).filter((p) => !p.isBot), ...room.spectators]
}

function findPlayer(room: ServerRoom, id: string): RoomPlayer | undefined {
  return (
    room.seats.find((p) => p?.id === id) ??
    room.spectators.find((p) => p.id === id)
  )
}

/** Lobby seats behave like a stack: occupied seats first (in order), empty seats last; spectators fill free seats. */
function compactSeats(room: ServerRoom): void {
  const seated = seatedPlayers(room)
  while (
    room.phase === "lobby" &&
    seated.length < room.maxPlayers &&
    room.spectators.length
  ) {
    seated.push(room.spectators.shift()!)
  }
  room.seats = [
    ...seated,
    ...Array<null>(room.maxPlayers - seated.length).fill(null),
  ]
}

function playerNames(game: GameState, seats: number[]): string {
  return seats.map((i) => q(game.players[i]!.name)).join(", ") || "nobody"
}

/** Apply a move and log the round/game outcome it may have caused. */
function play(
  code: string,
  game: GameState,
  seat: number,
  action: GameAction,
): void {
  applyAction(game, seat, action)
  logRoundEnd(code, game)
}

function logRoundEnd(code: string, game: GameState): void {
  const r = game.result
  if (!r || (game.phase !== "roundEnd" && game.phase !== "gameEnd")) return
  const ev = game.lastEvent
  const how =
    ev.type === "layDown"
      ? `${q(game.players[ev.seat]!.name)} laid down`
      : ev.type === "missFire"
        ? `${q(game.players[ev.seat]!.name)} missed the lay-down`
        : "showdown"
  const out =
    (r.eliminated.length
      ? `; eliminated: ${playerNames(game, r.eliminated)}`
      : "") +
    (r.revived.length ? `; back in: ${playerNames(game, r.revived)}` : "")
  log(
    code,
    `round ${game.round} ended (${how}) - lost a life: ${playerNames(game, r.losers)}${out}`,
  )
  if (game.phase === "gameEnd") {
    const w = game.winnerIdx
    log(
      code,
      `game finished - winner: ${w === null ? "none" : q(game.players[w]!.name)}`,
    )
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, ServerRoom>()
  private readonly sockets = new Map<string, Session>()
  private readonly tokens = new Map<string, Session>()

  createRoom(
    socketId: string,
    name: unknown,
    maxPlayers: unknown,
  ): RoomActionResult {
    this.leaveRoom(socketId)

    let code = generateCode()
    while (this.rooms.has(code)) code = generateCode()
    const size = clampMaxPlayers(maxPlayers)
    const room: ServerRoom = {
      code,
      hostId: "",
      maxPlayers: size,
      seats: Array(size).fill(null),
      spectators: [],
      phase: "lobby",
      members: new Map(),
      game: null,
      timer: null,
      timerKey: null,
      deadline: null,
      fireTimers: new Map(),
    }
    this.rooms.set(code, room)
    const { player, result } = this.admit(room, socketId, name)
    room.seats[0] = player
    room.hostId = result.youId
    player.isHost = true
    player.ready = true
    log(code, `room created by ${q(player.name)} (${size} seats)`)
    return result
  }

  joinRoom(
    socketId: string,
    rawCode: unknown,
    name: unknown,
  ): RoomActionResult {
    const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : ""
    const room = this.rooms.get(code)
    if (!room) return { ok: false, error: "Room not found." }
    const seatIdx = room.phase === "lobby" ? room.seats.indexOf(null) : -1
    if (room.phase === "lobby" && seatIdx === -1)
      return { ok: false, error: "Room is full." }
    if (
      room.phase !== "lobby" &&
      room.spectators.length >= ROOM_LIMITS.maxSpectators
    )
      return { ok: false, error: "Too many spectators already." }

    this.leaveRoom(socketId)
    const { player, result } = this.admit(room, socketId, name)
    if (seatIdx === -1) {
      room.spectators.push(player)
      log(code, `${q(player.name)} joined as a spectator`)
    } else {
      room.seats[seatIdx] = player
      log(code, `${q(player.name)} joined`)
    }
    // The host left mid-game and a bot holds their seat.
    if (findPlayer(room, room.hostId)?.isBot) {
      room.hostId = player.id
      player.isHost = true
      player.ready = true
      log(code, `${q(player.name)} is now the host`)
    }
    return result
  }

  /** Rebind a new connection to an existing seat. `staleSocketId` held it before. */
  resume(
    socketId: string,
    rawToken: unknown,
  ): { result: RoomActionResult; staleSocketId: string | null } {
    const session =
      typeof rawToken === "string" ? this.tokens.get(rawToken) : undefined
    const room = session && this.rooms.get(session.code)
    const member = room?.members.get(session!.playerId)
    const player = room && findPlayer(room, session!.playerId)
    if (!session || !room || !member || !player) {
      return {
        result: { ok: false, error: "Your seat is no longer available." },
        staleSocketId: null,
      }
    }
    const current = this.sockets.get(socketId)
    if (current && current.playerId !== session.playerId) {
      return {
        result: { ok: false, error: "Leave your current room first." },
        staleSocketId: null,
      }
    }
    // A bot holds the seat of a player who left mid-game.
    if (player.isBot) {
      if (!room.game || room.game.phase === "gameEnd") {
        this.tokens.delete(member.token)
        room.members.delete(session.playerId)
        return {
          result: { ok: false, error: "That game has ended." },
          staleSocketId: null,
        }
      }
      const isHost = room.hostId === player.id
      Object.assign(player, { isBot: false, isHost, ready: isHost })
      delete player.botLevel
      convertToHuman(room.game, player.id)
      log(room.code, `${q(player.name)} returned to the game`)
    }

    const stale = member.socketId !== socketId ? member.socketId : null
    if (stale) this.sockets.delete(stale)
    member.socketId = socketId
    player.connected = true
    this.sockets.set(socketId, session)
    log(room.code, `${q(player.name)} reconnected`)
    return {
      result: {
        ok: true,
        code: room.code,
        youId: player.id,
        token: member.token,
      },
      staleSocketId: stale,
    }
  }

  /** Explicitly give up your seat. Returns the affected room, if any. */
  leaveRoom(socketId: string): { room: ServerRoom; playerId: string } | null {
    const session = this.sockets.get(socketId)
    if (!session) return null
    const room = this.rooms.get(session.code)
    if (!room) return null
    log(room.code, `${q(this.playerName(room, session.playerId))} left`)
    this.removePlayer(room, session.playerId)
    return { room, playerId: session.playerId }
  }

  /** Connection dropped: keep the seat so the player can resume. */
  disconnect(socketId: string): { room: ServerRoom; playerId: string } | null {
    const session = this.sockets.get(socketId)
    if (!session) return null
    this.sockets.delete(socketId)
    const room = this.rooms.get(session.code)
    const member = room?.members.get(session.playerId)
    if (!room || !member) return null
    member.socketId = null
    const player = findPlayer(room, session.playerId)
    if (player) {
      player.connected = false
      log(room.code, `${q(player.name)} disconnected`)
    }
    return { room, playerId: session.playerId }
  }

  /** Grace period over: free a still-disconnected lobby seat; drop rooms nobody is connected to. */
  expire(code: string, playerId: string): ServerRoom | null {
    const room = this.rooms.get(code)
    const member = room?.members.get(playerId)
    if (!room || !member || member.socketId !== null) return null
    if (room.phase === "lobby") {
      log(
        code,
        `${q(this.playerName(room, playerId))} did not come back; seat freed`,
      )
      this.removePlayer(room, playerId)
    }
    if (this.rooms.has(code) && !humans(room).some((p) => p.connected))
      this.deleteRoom(room)
    return room
  }

  setReady(socketId: string, ready: unknown): ServerRoom {
    const { room, playerId } = this.memberRoom(socketId)
    if (room.phase !== "lobby")
      throw new RoomError("The game has already started.")
    const player = room.seats.find((p) => p?.id === playerId)
    if (player && !player.isHost && player.ready !== (ready === true)) {
      player.ready = ready === true
      log(
        room.code,
        `${q(player.name)} is ${player.ready ? "ready" : "not ready"}`,
      )
    }
    return room
  }

  setMaxPlayers(socketId: string, raw: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId)
    const size = clampMaxPlayers(raw)
    if (seatedPlayers(room).length > size) {
      throw new RoomError("Remove players before shrinking the table.")
    }
    room.maxPlayers = size
    compactSeats(room)
    log(room.code, `table size set to ${size}`)
    return room
  }

  addBot(socketId: string, rawSeat: unknown, level: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId)
    const idx = seatIndex(room, rawSeat)
    if (room.seats[idx]) throw new RoomError("That seat is taken.")
    const bot: RoomPlayer = {
      id: `bot:${randomUUID()}`,
      name: this.botName(room),
      isHost: false,
      isBot: true,
      botLevel: parseBotLevel(level),
      ready: true,
      connected: true,
    }
    room.seats[idx] = bot
    compactSeats(room)
    log(room.code, `bot ${q(bot.name)} added (${bot.botLevel})`)
    return room
  }

  removeBot(socketId: string, rawSeat: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId)
    const idx = seatIndex(room, rawSeat)
    const bot = room.seats[idx]
    if (!bot?.isBot) throw new RoomError("That seat has no bot.")
    room.seats[idx] = null
    compactSeats(room)
    log(room.code, `bot ${q(bot.name)} removed`)
    return room
  }

  setBotLevel(socketId: string, rawSeat: unknown, level: unknown): ServerRoom {
    const room = this.lobbyHostRoom(socketId)
    const bot = room.seats[seatIndex(room, rawSeat)]
    if (!bot?.isBot) throw new RoomError("That seat has no bot.")
    if (!BOT_LEVELS.some((l) => l === level))
      throw new RoomError("Invalid bot level.")
    log(
      room.code,
      `bot ${q(bot.name)} level ${bot.botLevel} -> ${level as BotLevel}`,
    )
    bot.botLevel = level as BotLevel
    return room
  }

  /** Remove a human from the host's room; returns their socket (if connected). */
  kick(
    socketId: string,
    rawSeat: unknown,
  ): { room: ServerRoom; kickedSocketId: string | null } {
    const room = this.lobbyHostRoom(socketId)
    const target = room.seats[seatIndex(room, rawSeat)]
    if (!target || target.isBot || target.id === room.hostId) {
      throw new RoomError("You can't remove that seat.")
    }
    const kickedSocketId = room.members.get(target.id)?.socketId ?? null
    log(room.code, `${q(target.name)} was kicked by the host`)
    this.removePlayer(room, target.id)
    return { room, kickedSocketId }
  }

  start(socketId: string): ServerRoom {
    const room = this.lobbyHostRoom(socketId)
    const blocker = startBlocker(room)
    if (blocker) throw new RoomError(blocker)
    room.game = createGame(
      seatedPlayers(room).map(({ id, name, isBot, botLevel }) =>
        botLevel ? { id, name, isBot, botLevel } : { id, name, isBot },
      ),
      secureRandom,
    )
    room.phase = "playing"
    room.deadline = null
    const players = room.game.players.map((p) =>
      p.isBot ? `${q(p.name)} (${p.botLevel})` : q(p.name),
    )
    log(room.code, `game started: ${players.join(", ")}`)
    return room
  }

  returnToLobby(socketId: string): ServerRoom {
    const room = this.hostRoom(socketId).room
    if (room.phase === "lobby") return room
    this.clearTimer(room)
    this.clearFireTimers(room)
    // Players who left mid-game can't come back to the lobby seat their bot holds.
    for (const [id, member] of room.members) {
      if (!findPlayer(room, id)?.isBot) continue
      this.tokens.delete(member.token)
      room.members.delete(id)
    }
    room.game = null
    room.phase = "lobby"
    for (const p of seatedPlayers(room)) p.ready = p.isHost || p.isBot
    compactSeats(room)
    log(room.code, "back to lobby")
    return room
  }

  sendEmote(socketId: string, raw: unknown): { code: string; event: EmoteEvent } {
    const { room, playerId } = this.memberRoom(socketId)
    if (!room.game || !room.game.players.some(p => p.id === playerId && !p.isBot))
      throw new RoomError("Only seated players can send emotes during a game.")
    if (!isEmoteId(raw)) throw new RoomError("Unknown emote.")
    const member = room.members.get(playerId)!
    const now = Date.now()
    if (member.lastEmoteAt !== undefined && now - member.lastEmoteAt < EMOTE_COOLDOWN_MS)
      throw new RoomError("Wait a moment before sending another emote.")
    member.lastEmoteAt = now
    return { code: room.code, event: { playerId, emote: raw } }
  }

  gameAction(socketId: string, action: GameAction): ServerRoom {
    const { room, playerId } = this.memberRoom(socketId)
    const seat = room.game?.players.findIndex((p) => p.id === playerId) ?? -1
    if (!room.game || seat === -1) throw new RoomError("You're not in a game.")
    play(room.code, room.game, seat, action)
    return room
  }

  /**
   * Arm the room's single timer for whatever happens next on its own: a bot's
   * move, a stand-in move for a slow or disconnected human, or the next round.
   * Re-syncs keep an already-armed timer. `onStep` runs after each automatic step.
   */
  schedule(code: string, onStep: (code: string) => void): void {
    const room = this.rooms.get(code)
    if (!room) return
    const game = room.game
    if (!game) {
      this.clearFireTimers(room)
      return this.clearTimer(room)
    }
    this.scheduleFire(room, game, onStep)

    const current = game.players[game.turnIdx]!
    const away =
      room.seats.find((p) => p?.id === current.id)?.connected === false
    const live =
      (game.phase === "schieben" || game.phase === "play") &&
      !game.pendingShowdown
    const kind =
      game.phase === "roundEnd"
        ? "round"
        : !live
          ? null
          : current.isBot
            ? "bot"
            : away
              ? "away"
              : "turn"
    const key = `${game.seq}:${kind}`
    if (room.timer && room.timerKey === key) return
    this.clearTimer(room)
    if (!kind) return

    let delay: number
    let step: () => void
    if (kind === "round") {
      delay = NEXT_ROUND_MS
      step = () => {
        startRound(game, secureRandom)
        log(code, `round ${game.round} started`)
      }
    } else {
      if (kind === "bot") {
        delay =
          BOT_THINK_MS.min +
          Math.random() * (BOT_THINK_MS.max - BOT_THINK_MS.min)
      } else {
        // Never extend a running deadline (e.g. by dropping and reconnecting).
        const now = Date.now()
        const prev =
          room.deadline?.seq === game.seq ? room.deadline.at : Infinity
        const at = Math.min(prev, now + (away ? AWAY_TURN_MS : TURN_MS))
        room.deadline = { seq: game.seq, at }
        delay = at - now
      }
      const level = (current.isBot && current.botLevel) || STAND_IN_LEVEL
      step = () => {
        const seat = game.turnIdx
        if (kind === "turn") log(code, `${q(current.name)} ran out of time`)
        try {
          play(code, game, seat, chooseBotAction(viewFor(game, seat), level))
        } catch (err) {
          console.error("Bot move failed; falling back.", err)
          play(code, game, seat, {
            type: game.phase === "schieben" ? "KEEP" : "KNOCK",
          })
        }
      }
    }

    room.timerKey = key
    room.timer = setTimeout(() => {
      room.timer = null
      room.timerKey = null
      if (this.rooms.get(code) !== room || room.game !== game) return
      step()
      onStep(code)
    }, delay)
  }

  /** One timer per open lay-down window: bots lay down after thinking, humans who miss it pay. */
  private scheduleFire(
    room: ServerRoom,
    game: GameState,
    onStep: (code: string) => void,
  ): void {
    const open = new Set(
      game.phase === "play" ? game.fire.map((s) => `${game.round}:${s}`) : [],
    )
    for (const [key, timer] of room.fireTimers) {
      if (open.has(key)) continue
      clearTimeout(timer)
      room.fireTimers.delete(key)
    }
    for (const seat of game.phase === "play" ? game.fire : []) {
      const key = `${game.round}:${seat}`
      if (room.fireTimers.has(key)) continue
      const player = game.players[seat]!
      const delay = player.isBot
        ? BOT_THINK_MS.min +
          Math.random() * (BOT_THINK_MS.max - BOT_THINK_MS.min)
        : FIRE_MS
      const timer = setTimeout(() => {
        room.fireTimers.delete(key)
        if (this.rooms.get(room.code) !== room || room.game !== game) return
        if (game.phase !== "play" || !game.fire.includes(seat)) return
        // Checked now, not when armed: a human may have left in the meantime.
        if (player.isBot) {
          play(room.code, game, seat, { type: "LAY_DOWN" })
        } else {
          missFire(game, seat)
          logRoundEnd(room.code, game)
        }
        onStep(room.code)
      }, delay)
      room.fireTimers.set(key, timer)
    }
  }

  /** Each connected player's and spectator's socket paired with their personalized view. */
  gameViews(code: string): [socketId: string, view: GameView][] {
    const room = this.rooms.get(code)
    const game = room?.game
    if (!room || !game) return []
    const d = room.deadline
    const turnMsLeft =
      room.timer && d?.seq === game.seq
        ? Math.max(0, d.at - Date.now())
        : undefined
    const viewers: [string, number][] = [
      ...game.players.map((p, seat): [string, number] => [p.id, seat]),
      ...room.spectators.map((p): [string, number] => [p.id, -1]),
    ]
    return viewers.flatMap(([id, seat]) => {
      const socketId = room.members.get(id)?.socketId
      if (!socketId) return []
      const view = viewFor(game, seat)
      if (turnMsLeft !== undefined) view.turnMsLeft = turnMsLeft
      return [[socketId, view] as [string, GameView]]
    })
  }

  getRoom(code: string): RoomState | null {
    return this.rooms.get(code) ?? null
  }

  getGame(code: string): GameState | null {
    return this.rooms.get(code)?.game ?? null
  }

  toState(room: RoomState): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      seats: room.seats.map((p) => (p ? { ...p } : null)),
      spectators: room.spectators.map((p) => ({ ...p })),
      phase: room.phase,
    }
  }

  /** Register a new human member (not yet placed in a seat or the spectators). */
  private admit(
    room: ServerRoom,
    socketId: string,
    name: unknown,
  ): { player: RoomPlayer; result: RoomActionResult & { ok: true } } {
    const id = randomUUID()
    const token = randomUUID()
    const player: RoomPlayer = {
      id,
      name: sanitizeName(name),
      isHost: false,
      isBot: false,
      ready: false,
      connected: true,
    }
    room.members.set(id, { token, socketId })
    const session = { code: room.code, playerId: id }
    this.sockets.set(socketId, session)
    this.tokens.set(token, session)
    return { player, result: { ok: true, code: room.code, youId: id, token } }
  }

  /** Free a human's seat (or hand it to a bot mid-game, keeping their token to return), promoting a new host if needed. */
  private removePlayer(room: ServerRoom, playerId: string): void {
    const idx = room.seats.findIndex((p) => p?.id === playerId)
    const player = room.seats[idx]
    const midGame = !!player && !!room.game && room.game.phase !== "gameEnd"

    const member = room.members.get(playerId)
    if (member) {
      if (member.socketId) this.sockets.delete(member.socketId)
      member.socketId = null
      if (!midGame) {
        this.tokens.delete(member.token)
        room.members.delete(playerId)
      }
    }

    if (player && room.game) {
      const level = STAND_IN_LEVEL
      Object.assign(player, {
        isBot: true,
        botLevel: level,
        isHost: false,
        ready: true,
        connected: true,
      })
      convertToBot(room.game, playerId, level)
      log(room.code, `${q(player.name)} replaced by a ${level} bot`)
    } else if (idx !== -1) {
      room.seats[idx] = null
      compactSeats(room)
    } else {
      room.spectators = room.spectators.filter((p) => p.id !== playerId)
    }

    const remaining = humans(room)
    if (remaining.length === 0) {
      // A mid-game leaver may still return; `expire` closes the room after the grace period.
      if (!midGame) this.deleteRoom(room)
      return
    }
    if (room.hostId === playerId) {
      const next = remaining.find((p) => p.connected) ?? remaining[0]!
      room.hostId = next.id
      next.isHost = true
      next.ready = true
      log(room.code, `${q(next.name)} is now the host`)
    }
  }

  private deleteRoom(room: ServerRoom): void {
    this.clearTimer(room)
    this.clearFireTimers(room)
    for (const member of room.members.values()) {
      this.tokens.delete(member.token)
      if (member.socketId) this.sockets.delete(member.socketId)
    }
    this.rooms.delete(room.code)
    log(room.code, "room closed")
  }

  private playerName(room: ServerRoom, playerId: string): string {
    return findPlayer(room, playerId)?.name ?? "?"
  }

  private clearTimer(room: ServerRoom): void {
    if (room.timer) clearTimeout(room.timer)
    room.timer = null
    room.timerKey = null
  }

  private clearFireTimers(room: ServerRoom): void {
    for (const timer of room.fireTimers.values()) clearTimeout(timer)
    room.fireTimers.clear()
  }

  private memberRoom(socketId: string): { room: ServerRoom; playerId: string } {
    const session = this.sockets.get(socketId)
    const room = session && this.rooms.get(session.code)
    if (!session || !room) throw new RoomError("You are not in a room.")
    return { room, playerId: session.playerId }
  }

  private hostRoom(socketId: string): { room: ServerRoom; playerId: string } {
    const member = this.memberRoom(socketId)
    if (member.room.hostId !== member.playerId)
      throw new RoomError("Only the host can do that.")
    return member
  }

  private lobbyHostRoom(socketId: string): ServerRoom {
    const { room } = this.hostRoom(socketId)
    if (room.phase !== "lobby")
      throw new RoomError("The game has already started.")
    return room
  }

  private botName(room: ServerRoom): string {
    const taken = new Set(seatedPlayers(room).map((p) => p.name))
    let n = 1
    while (taken.has(`Bot ${n}`)) n++
    return `Bot ${n}`
  }
}
