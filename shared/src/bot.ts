/**
 * Bot decision-making for the three difficulty levels. Bots only ever see
 * their own `GameView` (including the public history in it), so they play with
 * exactly the information a human in that seat would have.
 *
 * - easy: greedy face-up swaps, never gambles, knocks once nothing improves.
 * - normal: the prototype's AI — knocks on 24+, otherwise swaps, else gambles face-down.
 * - hard: Monte-Carlo lookahead — deals the unseen cards many plausible ways
 *   (opponents keep the face-up cards they took), plays each sensible move out,
 *   and keeps the one that loses the fewest lives.
 */

import { buildDeck, shuffle, SUIT_SYMBOLS } from "./deck.js"
import {
  applyAction,
  viewFor,
  type GameAction,
  type GamePlayer,
  type GameState,
  type GameView,
  type PlayerView,
} from "./game.js"
import type { BotLevel } from "./net.js"
import { handScore, isInstantWin } from "./scoring.js"
import type { Card, Rng, Suit } from "./types.js"

/** Blind face-down swaps a bot allows itself per round. */
const MAX_GAMBLES = 2
/** Easy bots push below this instead of weighing the odds. */
const EASY_PUSH_BELOW = 17
/** Normal bots stop improving and knock from here. */
const NORMAL_KNOCK_AT = 24
/** Sampled deals per decision for hard bots. */
const ROLLOUTS = 100

const KNOCK: GameAction = { type: "KNOCK" }

export function chooseBotAction(
  view: GameView,
  level: BotLevel = "normal",
  rng: Rng = Math.random,
): GameAction {
  const me = view.players[view.you]!
  const hand = known(me.hand)
  const score = handScore(hand)

  // The face-up set is hidden during the opening, so pushing is a blind bet.
  if (view.phase === "schieben") {
    const push =
      level === "easy"
        ? score < EASY_PUSH_BELOW
        : score + 1 < expectedRandomHand(hand)
    return { type: push ? "PUSH" : "KEEP" }
  }
  if (isInstantWin(hand)) return { type: "LAY_DOWN" }

  const pool = known(view.poolUp)
  if (level === "hard") return rolloutChoice(view, hand, pool, rng)

  const swap = bestSwap(hand, pool)
  // Easy never gambles; after a knock this is the last move, so take what's visible.
  if (level === "easy" || view.knockerIdx !== null) return swap ?? KNOCK
  if (score >= NORMAL_KNOCK_AT) return KNOCK
  return swap ?? gamble(me, hand, rng) ?? KNOCK
}

function gamble(
  me: PlayerView,
  hand: readonly Card[],
  rng: Rng,
): GameAction | null {
  if (me.gambles >= MAX_GAMBLES) return null
  return {
    type: "SWAP",
    pool: "down",
    handIdx: worstHandIndex(hand),
    poolIdx: Math.floor(rng() * 3),
  }
}

function rolloutChoice(
  view: GameView,
  hand: Card[],
  pool: Card[],
  rng: Rng,
): GameAction {
  // Only strictly improving swaps, so a table of hard bots can't trade cards forever.
  const base = handScore(hand)
  const candidates: GameAction[] = [KNOCK]
  if (handScore(pool) > base) candidates.push({ type: "SWAP_ALL", pool: "up" })
  for (let h = 0; h < hand.length; h++) {
    for (let t = 0; t < pool.length; t++) {
      const trial = hand.slice()
      trial[h] = pool[t]!
      if (handScore(trial) > base)
        candidates.push({ type: "SWAP", pool: "up", handIdx: h, poolIdx: t })
    }
  }
  const blind = gamble(view.players[view.you]!, hand, rng)
  if (blind) candidates.push(blind)

  // Every candidate faces the same sampled deals, so differences come from the move.
  const losses = candidates.map(() => 0)
  for (let i = 0; i < ROLLOUTS; i++) {
    const world = sampleWorld(view, hand, pool, rng)
    candidates.forEach((action, c) => {
      losses[c]! += playOut(cloneWorld(world), view.you, action, rng)
    })
  }
  let best = 0
  losses.forEach((l, c) => {
    if (l < losses[best]!) best = c
  })
  return candidates[best]!
}

/** One plausible full state behind `view`: opponents are assumed to still hold face-up cards they took. */
function sampleWorld(
  view: GameView,
  hand: Card[],
  pool: Card[],
  rng: Rng,
): GameState {
  const free = shuffle(unseen(hand, pool), rng)
  const players: GamePlayer[] = view.players.map((p, i) => ({
    ...p,
    hand: i === view.you ? hand.slice() : [],
    takenUp: p.takenUp.map((m) => m.slice()),
  }))
  players.forEach((p, i) => {
    if (i === view.you || p.out) return
    for (const move of [...p.takenUp].reverse()) {
      for (const c of move) {
        const at = free.findIndex((f) => key(f) === key(c))
        if (at !== -1 && p.hand.length < 3) p.hand.push(free.splice(at, 1)[0]!)
      }
    }
  })
  for (const p of players)
    while (!p.out && p.hand.length < 3) p.hand.push(free.pop()!)
  return {
    players,
    deck: free.slice(3),
    poolUp: pool.slice(),
    poolDown: free.slice(0, 3),
    phase: "play",
    round: view.round,
    startingIdx: view.startingIdx,
    turnIdx: view.you,
    knockerIdx: view.knockerIdx,
    fire: players.flatMap((p, i) =>
      !p.out && i !== view.you && isInstantWin(p.hand) ? [i] : [],
    ),
    pendingShowdown: view.pendingShowdown,
    seq: view.seq,
    lastEvent: view.lastEvent,
    result: null,
    winnerIdx: null,
  }
}

function cloneWorld(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      hand: p.hand.slice(),
      takenUp: p.takenUp.slice(),
    })),
    deck: s.deck.slice(),
    poolUp: s.poolUp.slice(),
    poolDown: s.poolDown.slice(),
    fire: s.fire.slice(),
  }
}

/** Lives `you` loses this round after playing `action`, with everyone then playing "normal". */
function playOut(
  world: GameState,
  you: number,
  action: GameAction,
  rng: Rng,
): number {
  applyAction(world, you, action)
  while (world.phase === "play") {
    // Bots always lay down in time, so an open window is resolved first.
    const seat = world.fire[0] ?? world.turnIdx
    applyAction(
      world,
      seat,
      chooseBotAction(viewFor(world, seat), "normal", rng),
    )
  }
  return world.result?.losers.includes(you) ? 1 : 0
}

function known(cards: readonly (Card | null)[]): Card[] {
  if (cards.some((c) => c === null))
    throw new Error("Bot was asked to act on hidden cards.")
  return cards as Card[]
}

function key(c: Card): string {
  return c.rank + c.suit
}

function unseen(...seen: (readonly Card[])[]): Card[] {
  const keys = new Set(seen.flat().map(key))
  return buildDeck().filter((c) => !keys.has(key(c)))
}

/** Best strictly improving face-up swap (single card or all three). */
function bestSwap(
  hand: readonly Card[],
  pool: readonly Card[],
): GameAction | null {
  let best: GameAction | null = null
  let bestScore = handScore(hand)
  for (let h = 0; h < hand.length; h++) {
    for (let t = 0; t < pool.length; t++) {
      const trial = hand.slice()
      trial[h] = pool[t]!
      const s = handScore(trial)
      if (s > bestScore) {
        bestScore = s
        best = { type: "SWAP", pool: "up", handIdx: h, poolIdx: t }
      }
    }
  }
  if (handScore(pool) > bestScore) best = { type: "SWAP_ALL", pool: "up" }
  return best
}

/** Least useful card: outside the strongest suit, then lowest value. */
function worstHandIndex(hand: readonly Card[]): number {
  let bestSuit: Suit | null = null
  let best = -1
  for (const suit of SUIT_SYMBOLS) {
    const total = hand.reduce(
      (sum, c) => sum + (c.suit === suit ? c.val : 0),
      0,
    )
    if (total > best) {
      best = total
      bestSuit = suit
    }
  }
  let idx = 0
  let low = Infinity
  hand.forEach((c, i) => {
    const keepValue = c.val + (c.suit === bestSuit ? 100 : 0)
    if (keepValue < low) {
      low = keepValue
      idx = i
    }
  })
  return idx
}

/** Average score of three unseen cards — what a blind push would bring. */
function expectedRandomHand(hand: readonly Card[]): number {
  const cards = unseen(hand)
  let sum = 0
  let count = 0
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      for (let c = b + 1; c < cards.length; c++) {
        sum += handScore([cards[a]!, cards[b]!, cards[c]!])
        count++
      }
    }
  }
  return sum / count
}
