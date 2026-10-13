import {
  applyAction,
  buildDeck,
  createGame,
  startRound,
  type Card,
  type GameAction,
  type GameState,
  type Rank,
  type RoomState,
  type Suit,
} from "@hosn-obe/shared"

export type TutorialStep =
  | "keep" | "openingBots" | "swap" | "swapBots" | "knock"
  | "finalBots" | "roundResult" | "secondOpening" | "allThree"
  | "allThreeBots" | "fireSwap" | "layDown" | "complete"

export interface TutorialState {
  game: GameState
  step: TutorialStep
  feedback: string | null
}

export type TutorialEvent =
  | { type: "act"; action: GameAction }
  | { type: "bot" }
  | { type: "nextRound" }
  | { type: "restart" }

const seats = [
  { id: "trainer-you", name: "You", isBot: false },
  { id: "trainer-mia", name: "Mia", isBot: true },
  { id: "trainer-leo", name: "Leo", isBot: true },
]

export const tutorialRoom: RoomState = {
  code: "", hostId: seats[0]!.id, maxPlayers: 3,
  seats: seats.map((seat, index) => ({
    ...seat, isHost: index === 0, ready: true, connected: true,
  })),
  spectators: [], phase: "playing",
}

function card(rank: Rank, suit: Suit): Card {
  return buildDeck().find((item) => item.rank === rank && item.suit === suit)!
}

/** Planned deals; actions and scores still run through the real game engine. */
function deal(game: GameState, secondRound = false): void {
  const hands = secondRound ? [
    [card("A", "♦"), card("K", "♣"), card("7", "♠")],
    [card("7", "♣"), card("8", "♣"), card("9", "♠")],
    [card("7", "♥"), card("8", "♠"), card("10", "♦")],
  ] : [
    [card("A", "♥"), card("K", "♥"), card("7", "♣")],
    [card("9", "♦"), card("8", "♦"), card("7", "♠")],
    [card("10", "♣"), card("8", "♠"), card("J", "♣")],
  ]
  game.players.forEach((player, index) => { player.hand = hands[index]! })
  game.poolUp = secondRound
    ? [card("Q", "♠"), card("9", "♣"), card("J", "♥")]
    : [card("9", "♥"), card("Q", "♣"), card("K", "♦")]
  game.poolDown = secondRound
    ? [card("A", "♠"), card("K", "♠"), card("8", "♦")]
    : [card("7", "♦"), card("8", "♥"), card("Q", "♥")]
  const used = [...hands.flat(), ...game.poolUp, ...game.poolDown]
  game.deck = buildDeck().filter((item) =>
    !used.some((taken) => taken.rank === item.rank && taken.suit === item.suit),
  )
}

export function createTutorial(): TutorialState {
  const game = createGame(seats, () => 0.5)
  deal(game)
  return { game, step: "keep", feedback: null }
}

export function isBotStep(step: TutorialStep): boolean {
  return ["openingBots", "swapBots", "finalBots", "secondOpening", "allThreeBots"].includes(step)
}

export function stepTutorial(state: TutorialState, event: TutorialEvent): TutorialState {
  if (event.type === "restart") return createTutorial()
  if (event.type === "nextRound") {
    if (state.step !== "roundResult") return state
    const game = structuredClone(state.game)
    startRound(game, () => 0.5)
    deal(game, true)
    return { game, step: "secondOpening", feedback: null }
  }
  if (event.type === "bot") {
    if (!isBotStep(state.step)) return state
    const game = structuredClone(state.game)
    const seat = game.turnIdx
    let action: GameAction
    if (state.step === "finalBots") action = { type: "KNOCK" }
    else if (game.phase === "schieben") action = { type: "KEEP" }
    else if (state.step === "secondOpening") action = { type: "SWAP", pool: "up", handIdx: 1, poolIdx: 2 }
    else if (state.step === "allThreeBots") action = seat === 1
      ? { type: "SWAP", pool: "down", handIdx: 2, poolIdx: 2 }
      : { type: "SWAP", pool: "up", handIdx: 0, poolIdx: 1 }
    else action = seat === 1
      ? { type: "SWAP", pool: "down", handIdx: 2, poolIdx: 0 }
      : { type: "SWAP", pool: "up", handIdx: state.step === "openingBots" ? 1 : 2, poolIdx: state.step === "openingBots" ? 1 : 2 }
    applyAction(game, seat, action)
    const next: Partial<Record<TutorialStep, TutorialStep>> = {
      openingBots: "swap", swapBots: "knock", finalBots: "roundResult",
      secondOpening: "allThree", allThreeBots: "fireSwap",
    }
    const done = game.phase === "roundEnd" || game.turnIdx === 0
    return { game, step: done ? next[state.step]! : state.step, feedback: null }
  }

  const { action } = event
  let accepted = false
  let next = state.step
  let feedback = "Follow the highlighted move to continue this demo."
  switch (state.step) {
    case "keep":
      accepted = action.type === "KEEP"
      next = "openingBots"
      feedback = "Push would trade all three cards for a hidden set. Keep this hand for now: your two hearts are a good start."
      break
    case "swap":
    case "fireSwap":
      accepted = action.type === "SWAP" && action.pool === "up" && action.handIdx === 2 && action.poolIdx === 0
      next = state.step === "swap" ? "swapBots" : "layDown"
      feedback = state.step === "swap"
        ? "Try replacing your 7♣ with the 9♥. Select those two cards, then tap Swap."
        : "Replace your 8♦ with the Q♠ to reach 31. Select those two cards, then tap Swap."
      break
    case "knock":
      accepted = action.type === "KNOCK"
      next = "finalBots"
      feedback = "You have 30 points. Tap Knock to give everyone else one last turn."
      break
    case "allThree":
      accepted = action.type === "SWAP_ALL" && action.pool === "down"
      next = "allThreeBots"
      feedback = "Let’s try trading the whole hand. Tap All 3 above the face-down cards, then Swap."
      break
    case "layDown":
      accepted = action.type === "LAY_DOWN"
      next = "complete"
      feedback = "You have 31! Tap Lay down! now, even though it isn’t your turn."
      break
  }
  if (!accepted) return { ...state, feedback }
  const game = structuredClone(state.game)
  applyAction(game, 0, action)
  return { game, step: next, feedback: null }
}
