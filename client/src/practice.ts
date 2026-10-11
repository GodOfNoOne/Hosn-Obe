import {
  applyAction,
  chooseBotAction,
  createGame,
  GameError,
  missFire,
  ROOM_LIMITS,
  seatedPlayers,
  startRound,
  viewFor,
  type BotLevel,
  type GameAction,
  type GameState,
  type GameView,
  type RoomPlayer,
  type RoomState,
} from "@hosn-obe/shared"

import type { RoomCommands } from "./commands.js"

export const PRACTICE_YOU_ID = "you"
const BOT_THINK_MS = { min: 600, max: 1400 }
const NEXT_ROUND_MS = 5000
const DEFAULT_SEATS = 4

export interface PracticeSnapshot {
  room: RoomState
  view: GameView | null
}

/** Offline table of you plus bots, run on this device by the shared game engine. */
export class PracticeTable implements RoomCommands {
  private readonly room: RoomState
  private game: GameState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Lay-down windows, keyed `round:seat`. */
  private readonly fireTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    name: string,
    private readonly onChange: (snap: PracticeSnapshot) => void,
  ) {
    this.room = {
      code: "",
      hostId: PRACTICE_YOU_ID,
      maxPlayers: DEFAULT_SEATS,
      seats: [
        {
          id: PRACTICE_YOU_ID,
          name,
          isHost: true,
          isBot: false,
          ready: true,
          connected: true,
        },
      ],
      spectators: [],
      phase: "lobby",
    }
    for (let i = 1; i < DEFAULT_SEATS; i++)
      this.room.seats.push(this.newBot("normal"))
  }

  snapshot(): PracticeSnapshot {
    const game = this.game
    return {
      room: { ...this.room, seats: this.room.seats.map((p) => p && { ...p }) },
      view: game
        ? viewFor(
            game,
            game.players.findIndex((p) => p.id === PRACTICE_YOU_ID),
          )
        : null,
    }
  }

  dispose(): void {
    this.clearTimer()
    this.clearFireTimers()
  }

  setReady(): void {}

  kick(): void {}

  setMaxPlayers(maxPlayers: number): void {
    this.inLobby(() => {
      if (
        maxPlayers < seatedPlayers(this.room).length ||
        maxPlayers > ROOM_LIMITS.maxPlayers
      )
        return
      this.room.maxPlayers = maxPlayers
      this.compact()
    })
  }

  addBot(seatIdx: number, level: BotLevel): void {
    this.inLobby(() => {
      if (seatIdx >= this.room.maxPlayers || this.room.seats[seatIdx]) return
      this.room.seats[seatIdx] = this.newBot(level)
      this.compact()
    })
  }

  removeBot(seatIdx: number): void {
    this.inLobby(() => {
      if (!this.room.seats[seatIdx]?.isBot) return
      this.room.seats[seatIdx] = null
      this.compact()
    })
  }

  setBotLevel(seatIdx: number, level: BotLevel): void {
    this.inLobby(() => {
      const bot = this.room.seats[seatIdx]
      if (bot?.isBot) bot.botLevel = level
    })
  }

  start(): void {
    this.inLobby(() => {
      const seated = seatedPlayers(this.room)
      if (seated.length < ROOM_LIMITS.minPlayers) return
      this.game = createGame(
        seated.map(({ id, name, isBot, botLevel }) =>
          botLevel ? { id, name, isBot, botLevel } : { id, name, isBot },
        ),
      )
      this.room.phase = "playing"
    })
  }

  returnToLobby(): void {
    this.clearTimer()
    this.clearFireTimers()
    this.game = null
    this.room.phase = "lobby"
    this.changed()
  }

  act(action: GameAction): void {
    const game = this.game
    if (!game) return
    try {
      applyAction(
        game,
        game.players.findIndex((p) => p.id === PRACTICE_YOU_ID),
        action,
      )
    } catch (err) {
      if (!(err instanceof GameError)) throw err
      return
    }
    this.changed()
  }

  private inLobby(op: () => void): void {
    if (this.room.phase !== "lobby") return
    op()
    this.changed()
  }

  private changed(): void {
    this.schedule()
    this.onChange(this.snapshot())
  }

  /** Same pacing as the server: bots think for a moment, rounds pause before the next deal. */
  private schedule(): void {
    this.clearTimer()
    const game = this.game
    if (!game) return
    this.scheduleFire(game)
    const current = game.players[game.turnIdx]!
    let delay: number
    let step: () => void
    if (game.phase === "roundEnd") {
      delay = NEXT_ROUND_MS
      step = () => startRound(game)
    } else if (
      (game.phase === "schieben" || game.phase === "play") &&
      !game.pendingShowdown &&
      current.isBot
    ) {
      delay =
        BOT_THINK_MS.min + Math.random() * (BOT_THINK_MS.max - BOT_THINK_MS.min)
      step = () => {
        const seat = game.turnIdx
        try {
          applyAction(
            game,
            seat,
            chooseBotAction(viewFor(game, seat), current.botLevel),
          )
        } catch (err) {
          console.error("Bot move failed; falling back.", err)
          applyAction(game, seat, {
            type: game.phase === "schieben" ? "KEEP" : "KNOCK",
          })
        }
      }
    } else {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.game !== game) return
      step()
      this.changed()
    }, delay)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Bots lay down after thinking; you pay if you miss your window. */
  private scheduleFire(game: GameState): void {
    const fire = game.phase === "play" ? game.fire : []
    const open = new Set(fire.map((s) => `${game.round}:${s}`))
    for (const [key, timer] of this.fireTimers) {
      if (open.has(key)) continue
      clearTimeout(timer)
      this.fireTimers.delete(key)
    }
    for (const seat of fire) {
      const key = `${game.round}:${seat}`
      if (this.fireTimers.has(key)) continue
      const bot = game.players[seat]!.isBot
      const delay = bot
        ? BOT_THINK_MS.min +
          Math.random() * (BOT_THINK_MS.max - BOT_THINK_MS.min)
        : ROOM_LIMITS.fireMs
      const timer = setTimeout(() => {
        this.fireTimers.delete(key)
        if (this.game !== game || game.phase !== "play") return
        if (!game.fire.includes(seat)) return
        if (bot) applyAction(game, seat, { type: "LAY_DOWN" })
        else missFire(game, seat)
        this.changed()
      }, delay)
      this.fireTimers.set(key, timer)
    }
  }

  private clearFireTimers(): void {
    for (const timer of this.fireTimers.values()) clearTimeout(timer)
    this.fireTimers.clear()
  }

  private compact(): void {
    const seated = seatedPlayers(this.room)
    this.room.seats = [
      ...seated,
      ...Array<null>(this.room.maxPlayers - seated.length).fill(null),
    ]
  }

  private newBot(botLevel: BotLevel): RoomPlayer {
    const taken = new Set(seatedPlayers(this.room).map((p) => p.name))
    let n = 1
    while (taken.has(`Bot ${n}`)) n++
    return {
      id: `bot:${n}:${Math.random().toString(36).slice(2)}`,
      name: `Bot ${n}`,
      isHost: false,
      isBot: true,
      botLevel,
      ready: true,
      connected: true,
    }
  }
}
