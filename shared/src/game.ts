/**
 * Authoritative Schwimmen engine (runs on the server) and the per-seat
 * sanitized view sent to clients. Generic over N seats.
 *
 * Round flow: deal -> opener keeps/pushes (schieben) -> turns clockwise
 * (swap one/all with the face-up or face-down pool, or knock) -> after a knock
 * everyone else gets one last turn -> showdown.
 *
 * Whoever holds 31/33 (once hands are revealed, or right after swapping into
 * it) must lay down, even out of turn. Making any other move first, or letting
 * the window time out (`missFire`, driven by the host's clock), costs that
 * player a life instead.
 */

import { buildDeck, DECK_SIZE, shuffle } from "./deck.js"
import type { BotLevel } from "./net.js"
import { handScore, isInstantWin } from "./scoring.js"
import type { Card, Rng } from "./types.js"

export const HAND_SIZE = 3
/** 0 lives = "swimming"; losing again after that knocks you out. */
export const START_LIVES = 3

export type PoolName = "up" | "down"
export type GamePhase = "schieben" | "play" | "roundEnd" | "gameEnd"

export type GameAction =
  | { type: "KEEP" }
  | { type: "PUSH" }
  | { type: "SWAP"; pool: PoolName; handIdx: number; poolIdx: number }
  | { type: "SWAP_ALL"; pool: PoolName }
  /** Knock; once someone else has knocked this means "stand". */
  | { type: "KNOCK" }
  | { type: "LAY_DOWN" }

export type GameEvent =
  | { type: "deal" }
  | {
      type: "keep" | "push" | "knock" | "stand" | "layDown" | "missFire"
      seat: number
    }
  | {
      type: "swap"
      seat: number
      pool: PoolName
      handIdx: number
      poolIdx: number
    }
  | { type: "swapAll"; seat: number; pool: PoolName }

export interface RoundResult {
  reason: "showdown" | "layDown" | "missedFire"
  /** Per seat; `null` for players who were already out. */
  scores: (number | null)[]
  losers: number[]
  eliminated: number[]
}

export interface GamePlayer {
  id: string
  name: string
  isBot: boolean
  botLevel?: BotLevel
  lives: number
  out: boolean
  hand: Card[]
  /** Face-up cards taken this round, one group per move (public: everyone saw them). */
  takenUp: Card[][]
  /** Face-down swaps this round. */
  gambles: number
}

export interface GameState {
  players: GamePlayer[]
  deck: Card[]
  poolUp: Card[]
  poolDown: Card[]
  phase: GamePhase
  round: number
  startingIdx: number
  turnIdx: number
  knockerIdx: number | null
  /** Seats holding 31/33 that must lay down now; secret, never sent to clients. */
  fire: number[]
  /** The knock came back around, but the showdown waits for open lay-down windows. */
  pendingShowdown: boolean
  /** Bumped on every event so clients can re-trigger animations. */
  seq: number
  lastEvent: GameEvent
  result: RoundResult | null
  winnerIdx: number | null
}

/** A rejected game action; the message is safe to show to the user. */
export class GameError extends Error {}

export const MAX_GAME_PLAYERS = Math.floor(
  (DECK_SIZE - 2 * HAND_SIZE) / HAND_SIZE,
)

export type GameSeat = Pick<GamePlayer, "id" | "name" | "isBot" | "botLevel">

export function createGame(
  seats: readonly GameSeat[],
  rng: Rng = Math.random,
): GameState {
  if (seats.length < 2 || seats.length > MAX_GAME_PLAYERS) {
    throw new GameError(`Games need 2–${MAX_GAME_PLAYERS} players.`)
  }
  const state: GameState = {
    players: seats.map((s) => ({
      ...s,
      lives: START_LIVES,
      out: false,
      hand: [],
      takenUp: [],
      gambles: 0,
    })),
    deck: [],
    poolUp: [],
    poolDown: [],
    phase: "roundEnd",
    round: 0,
    // startRound rotates to the next seat, so round 1 opens with seat 0.
    startingIdx: seats.length - 1,
    turnIdx: 0,
    knockerIdx: null,
    fire: [],
    pendingShowdown: false,
    seq: 0,
    lastEvent: { type: "deal" },
    result: null,
    winnerIdx: null,
  }
  startRound(state, rng)
  return state
}

export function startRound(state: GameState, rng: Rng = Math.random): void {
  if (state.phase !== "roundEnd")
    throw new GameError("The round is still running.")
  const deck = shuffle(buildDeck(), rng)
  for (const p of state.players) {
    p.hand = p.out ? [] : deck.splice(0, HAND_SIZE)
    p.takenUp = []
    p.gambles = 0
  }
  state.poolUp = deck.splice(0, HAND_SIZE)
  state.poolDown = deck.splice(0, HAND_SIZE)
  state.deck = deck
  state.round++
  state.startingIdx = nextAlive(state, state.startingIdx)
  state.turnIdx = state.startingIdx
  state.knockerIdx = null
  state.fire = []
  state.pendingShowdown = false
  state.result = null
  state.phase = "schieben"
  emit(state, { type: "deal" })
}

/** Apply `seat`'s (untrusted) action, mutating `state`. Throws `GameError` if illegal. */
export function applyAction(
  state: GameState,
  seat: number,
  action: GameAction,
): void {
  if (state.phase !== "schieben" && state.phase !== "play") {
    throw new GameError("The round is over.")
  }
  if (!action || typeof action !== "object")
    throw new GameError("Unknown action.")
  if (state.phase === "play" && action.type === "LAY_DOWN") {
    if (!state.fire.includes(seat)) {
      throw new GameError("You need 31 or three aces to lay down.")
    }
    emit(state, { type: "layDown", seat })
    endRound(state, "layDown", seat)
    return
  }
  if (seat !== state.turnIdx || state.pendingShowdown)
    throw new GameError("It's not your turn.")
  const player = state.players[seat]!

  if (state.phase === "schieben") {
    if (action.type === "PUSH") {
      ;[player.hand, state.poolUp] = [state.poolUp, player.hand]
    } else if (action.type !== "KEEP") {
      throw new GameError("Keep or push first.")
    }
    emit(state, { type: action.type === "PUSH" ? "push" : "keep", seat })
    state.phase = "play"
    state.fire = state.players.flatMap((p, i) =>
      !p.out && isInstantWin(p.hand) ? [i] : [],
    )
    state.turnIdx = nextAlive(state, seat)
    return
  }

  if (
    state.fire.includes(seat) &&
    (action.type === "KNOCK" ||
      action.type === "SWAP" ||
      action.type === "SWAP_ALL")
  ) {
    missFire(state, seat)
    return
  }

  switch (action.type) {
    case "KNOCK":
      if (state.knockerIdx === null) {
        state.knockerIdx = seat
        emit(state, { type: "knock", seat })
      } else {
        emit(state, { type: "stand", seat })
      }
      break
    case "SWAP": {
      const pool = poolCards(state, action.pool)
      const { handIdx, poolIdx } = action
      if (!isCardIndex(handIdx) || !isCardIndex(poolIdx))
        throw new GameError("Invalid card.")
      noteTaken(player, action.pool, [pool[poolIdx]!])
      ;[player.hand[handIdx], pool[poolIdx]] = [
        pool[poolIdx]!,
        player.hand[handIdx]!,
      ]
      emit(state, { type: "swap", seat, pool: action.pool, handIdx, poolIdx })
      break
    }
    case "SWAP_ALL": {
      const pool = poolCards(state, action.pool)
      const taken = pool.splice(0, HAND_SIZE, ...player.hand)
      noteTaken(player, action.pool, taken)
      player.hand = taken
      emit(state, { type: "swapAll", seat, pool: action.pool })
      break
    }
    default:
      throw new GameError("Unknown action.")
  }
  if (isInstantWin(player.hand)) state.fire.push(seat)
  advanceTurn(state)
}

/** `seat`'s lay-down window ran out: the round ends with only them losing a life. */
export function missFire(state: GameState, seat: number): void {
  if (state.phase !== "play" || !state.fire.includes(seat)) {
    throw new GameError("No lay-down is pending.")
  }
  emit(state, { type: "missFire", seat })
  endRound(state, "missedFire", seat)
}

/** What one seat may see: own hand (mostly), face-up pool (after the opening), and all hands at showdown. */
export interface GameView {
  /** Your seat index, or -1 for a spectator. */
  you: number
  players: PlayerView[]
  /** `null` entries are face-down. */
  poolUp: (Card | null)[]
  poolDown: null[]
  phase: GamePhase
  round: number
  startingIdx: number
  turnIdx: number
  knockerIdx: number | null
  pendingShowdown: boolean
  seq: number
  lastEvent: GameEvent
  result: RoundResult | null
  winnerIdx: number | null
  /** Set by the server: ms until the current turn is auto-played. */
  turnMsLeft?: number
}

export interface PlayerView extends Omit<GamePlayer, "hand"> {
  /** `null` entries are face-down. */
  hand: (Card | null)[]
}

export function viewFor(state: GameState, seat: number): GameView {
  const showdown = state.phase === "roundEnd" || state.phase === "gameEnd"
  const opening = state.phase === "schieben"
  return {
    you: seat,
    players: state.players.map(({ hand, takenUp, ...p }, i) => {
      // While someone else decides keep/push, your own cards are still face-down.
      const visible =
        showdown || (i === seat && !(opening && seat !== state.turnIdx))
      return {
        ...p,
        hand: hand.map((c) => (visible ? { ...c } : null)),
        takenUp: takenUp.map((move) => move.map((c) => ({ ...c }))),
      }
    }),
    poolUp: state.poolUp.map((c) => (opening ? null : { ...c })),
    poolDown: state.poolDown.map(() => null),
    phase: state.phase,
    round: state.round,
    startingIdx: state.startingIdx,
    turnIdx: state.turnIdx,
    knockerIdx: state.knockerIdx,
    pendingShowdown: state.pendingShowdown,
    seq: state.seq,
    lastEvent: { ...state.lastEvent },
    result: state.result && {
      ...state.result,
      scores: [...state.result.scores],
      losers: [...state.result.losers],
      eliminated: [...state.result.eliminated],
    },
    winnerIdx: state.winnerIdx,
  }
}

/** Swap a seat over to bot control (e.g. a human left mid-game). */
export function convertToBot(
  state: GameState,
  id: string,
  level: BotLevel,
): void {
  const player = state.players.find((p) => p.id === id)
  if (player) {
    player.isBot = true
    player.botLevel = level
  }
}

function noteTaken(
  player: GamePlayer,
  pool: PoolName,
  cards: readonly Card[],
): void {
  if (pool === "up") player.takenUp.push(cards.map((c) => ({ ...c })))
  else player.gambles++
}

function emit(state: GameState, event: GameEvent): void {
  state.lastEvent = event
  state.seq++
}

function nextAlive(state: GameState, from: number): number {
  const n = state.players.length
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n
    if (!state.players[idx]!.out) return idx
  }
  return from
}

function isCardIndex(i: unknown): i is number {
  return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < HAND_SIZE
}

function poolCards(state: GameState, pool: unknown): Card[] {
  if (pool === "up") return state.poolUp
  if (pool === "down") return state.poolDown
  throw new GameError("Invalid pool.")
}

function advanceTurn(state: GameState): void {
  state.turnIdx = nextAlive(state, state.turnIdx)
  if (state.turnIdx !== state.knockerIdx) return
  if (state.fire.length) state.pendingShowdown = true
  else endRound(state, "showdown", null)
}

/**
 * Showdown: the lowest hand loses a life (ties all lose; an all-way tie costs nobody).
 * Lay-down: the lowest of the others loses. Missed lay-down: only `seat` loses.
 */
function endRound(
  state: GameState,
  reason: RoundResult["reason"],
  seat: number | null,
): void {
  const scores = state.players.map((p) => (p.out ? null : handScore(p.hand)))
  const contenders = state.players
    .map((_, i) => i)
    .filter((i) => scores[i] !== null && i !== seat)
  const low = Math.min(...contenders.map((i) => scores[i]!))
  let losers = contenders.filter((i) => scores[i] === low)
  if (reason === "showdown" && losers.length === contenders.length) losers = []
  if (reason === "missedFire") losers = [seat!]

  const eliminated: number[] = []
  for (const i of losers) {
    const p = state.players[i]!
    p.lives--
    if (p.lives < 0) {
      p.out = true
      eliminated.push(i)
    }
  }
  state.fire = []
  state.pendingShowdown = false
  state.result = {
    reason,
    scores,
    losers,
    eliminated,
  }

  const alive = state.players.flatMap((p, i) => (p.out ? [] : [i]))
  if (alive.length <= 1) {
    state.phase = "gameEnd"
    state.winnerIdx = alive[0] ?? null
  } else {
    state.phase = "roundEnd"
  }
}
