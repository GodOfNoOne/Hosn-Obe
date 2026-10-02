import { describe, expect, it } from "vitest";

import { chooseBotAction } from "../src/bot.js";
import { buildDeck } from "../src/deck.js";
import {
  applyAction,
  createGame,
  GameError,
  startRound,
  viewFor,
  type GameState,
} from "../src/game.js";
import type { Card } from "../src/types.js";

const DECK = buildDeck();
function card(code: string): Card {
  const found = DECK.find((c) => `${c.rank}${c.suit}` === code);
  if (!found) throw new Error(`bad card ${code}`);
  return { ...found };
}
const hand = (...codes: string[]) => codes.map(card);

function game(n = 2): GameState {
  const seats = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false }));
  return createGame(seats, () => 0.5);
}

/** Skip the opening by keeping, landing on seat 1's turn. */
function inPlay(n = 2): GameState {
  const g = game(n);
  g.players[0]!.hand = hand("7♠", "8♥", "9♦");
  applyAction(g, 0, { type: "KEEP" });
  return g;
}

describe("createGame / startRound", () => {
  it("deals 3 per player plus two 3-card pools from one deck", () => {
    const g = game(3);
    const all = [...g.players.flatMap((p) => p.hand), ...g.poolUp, ...g.poolDown, ...g.deck];
    expect(new Set(all.map((c) => c.rank + c.suit)).size).toBe(32);
    expect(g.players.every((p) => p.hand.length === 3 && p.lives === 3)).toBe(true);
    expect(g).toMatchObject({ phase: "schieben", round: 1, startingIdx: 0, turnIdx: 0 });
  });

  it("rejects unsupported player counts", () => {
    expect(() => game(1)).toThrow(GameError);
    expect(() => game(9)).toThrow(GameError);
  });

  it("rotates the opener each round, skipping eliminated players", () => {
    const g = game(3);
    g.phase = "roundEnd";
    g.players[1]!.out = true;
    startRound(g);
    expect(g.startingIdx).toBe(2);
    expect(g.players[1]!.hand).toEqual([]);
  });
});

describe("viewFor", () => {
  it("hides opponents' hands, the face-down pool and (during the opening) the face-up pool", () => {
    const g = game();
    const opener = viewFor(g, 0);
    const other = viewFor(g, 1);
    expect(opener.players[0]!.hand.every(Boolean)).toBe(true);
    expect(opener.players[1]!.hand).toEqual([null, null, null]);
    expect(other.players[1]!.hand).toEqual([null, null, null]);
    expect(opener.poolUp).toEqual([null, null, null]);
    expect(opener.poolDown).toEqual([null, null, null]);
    expect(opener).not.toHaveProperty("deck");
    expect(JSON.stringify(other)).not.toContain('"suit"');
  });

  it("shows your own hand and the face-up pool during play, everything at showdown", () => {
    const g = inPlay();
    const v = viewFor(g, 1);
    expect(v.players[1]!.hand.every(Boolean)).toBe(true);
    expect(v.poolUp.every(Boolean)).toBe(true);
    expect(v.players[0]!.hand).toEqual([null, null, null]);
    applyAction(g, 1, { type: "KNOCK" });
    applyAction(g, 0, { type: "KNOCK" });
    expect(viewFor(g, 1).players[0]!.hand.every(Boolean)).toBe(true);
    expect(viewFor(g, 1).poolDown).toEqual([null, null, null]);
  });
});

describe("applyAction", () => {
  it("rejects out-of-turn, wrong-phase and malformed actions", () => {
    const g = game();
    expect(() => applyAction(g, 1, { type: "KEEP" })).toThrow("not your turn");
    expect(() => applyAction(g, 0, { type: "KNOCK" })).toThrow("Keep or push");
    applyAction(g, 0, { type: "KEEP" });
    expect(() => applyAction(g, 1, { type: "KEEP" })).toThrow("Unknown action");
    expect(() => applyAction(g, 1, { type: "SWAP", pool: "x" as "up", handIdx: 0, poolIdx: 0 })).toThrow("pool");
    expect(() => applyAction(g, 1, { type: "SWAP", pool: "up", handIdx: 3, poolIdx: 0 })).toThrow("card");
    expect(() => applyAction(g, 1, null as never)).toThrow(GameError);
  });

  it("push trades the opener's hand for the face-up set", () => {
    const g = game();
    const before = g.players[0]!.hand.slice();
    const up = g.poolUp.slice();
    g.players[0]!.hand = before;
    applyAction(g, 0, { type: "PUSH" });
    expect(g.players[0]!.hand).toEqual(up);
    expect(g.poolUp).toEqual(before);
    expect(g).toMatchObject({ phase: "play", turnIdx: 1 });
  });

  it("an opening 31 keeps the opener's turn to lay down", () => {
    const g = game();
    g.players[0]!.hand = hand("A♠", "K♠", "Q♠");
    applyAction(g, 0, { type: "KEEP" });
    expect(g.turnIdx).toBe(0);
    applyAction(g, 0, { type: "LAY_DOWN" });
    expect(g.result).toMatchObject({ reason: "layDown", losers: [1] });
    expect(g.players[1]!.lives).toBe(2);
  });

  it("swaps single cards and whole hands with either pool", () => {
    const g = inPlay();
    const mine = g.players[1]!.hand[2]!;
    const theirs = g.poolDown[1]!;
    applyAction(g, 1, { type: "SWAP", pool: "down", handIdx: 2, poolIdx: 1 });
    expect(g.players[1]!.hand[2]).toEqual(theirs);
    expect(g.poolDown[1]).toEqual(mine);
    expect(g.lastEvent).toEqual({ type: "swap", seat: 1, pool: "down", handIdx: 2, poolIdx: 1 });

    const up = g.poolUp.slice();
    const prev = g.players[0]!.hand.slice();
    applyAction(g, 0, { type: "SWAP_ALL", pool: "up" });
    expect(g.players[0]!.hand).toEqual(up);
    expect(g.poolUp).toEqual(prev);
  });

  it("after a knock everyone else gets one turn, then the lowest hand loses a life", () => {
    const g = inPlay(3);
    g.players[0]!.hand = hand("A♠", "K♠", "7♥");
    g.players[1]!.hand = hand("8♣", "9♦", "7♥");
    g.players[2]!.hand = hand("A♦", "10♦", "7♣");
    applyAction(g, 1, { type: "KNOCK" });
    expect(g.knockerIdx).toBe(1);
    applyAction(g, 2, { type: "KNOCK" });
    expect(g.lastEvent).toEqual({ type: "stand", seat: 2 });
    expect(g.phase).toBe("play");
    applyAction(g, 0, { type: "KNOCK" });
    expect(g.phase).toBe("roundEnd");
    expect(g.result).toMatchObject({ reason: "showdown", scores: [21, 9, 21], losers: [1] });
    expect(g.players.map((p) => p.lives)).toEqual([3, 2, 3]);
  });

  it("an all-way showdown tie costs nobody a life", () => {
    const g = inPlay();
    g.players[0]!.hand = hand("A♠", "7♥", "8♣");
    g.players[1]!.hand = hand("A♦", "7♣", "8♠");
    applyAction(g, 1, { type: "KNOCK" });
    applyAction(g, 0, { type: "KNOCK" });
    expect(g.result?.losers).toEqual([]);
  });

  it("only lays down with 31 or three aces", () => {
    const g = inPlay();
    g.players[1]!.hand = hand("A♠", "K♠", "9♠");
    expect(() => applyAction(g, 1, { type: "LAY_DOWN" })).toThrow("31");
    g.players[1]!.hand = hand("A♠", "A♥", "A♦");
    applyAction(g, 1, { type: "LAY_DOWN" });
    expect(g.result).toMatchObject({ reason: "layDown", losers: [0] });
  });

  it("eliminates a player who loses while swimming and ends the game", () => {
    const g = inPlay();
    g.players[0]!.lives = 0;
    g.players[0]!.hand = hand("7♠", "8♥", "9♦");
    g.players[1]!.hand = hand("A♠", "K♠", "7♥");
    applyAction(g, 1, { type: "KNOCK" });
    applyAction(g, 0, { type: "KNOCK" });
    expect(g.result?.eliminated).toEqual([0]);
    expect(g).toMatchObject({ phase: "gameEnd", winnerIdx: 1 });
    expect(() => applyAction(g, 1, { type: "KNOCK" })).toThrow("over");
  });
});

describe("chooseBotAction", () => {
  it("keeps a decent opening hand and pushes a weak one", () => {
    const g = game();
    g.players[0]!.hand = hand("A♠", "K♠", "7♥");
    expect(chooseBotAction(viewFor(g, 0))).toEqual({ type: "KEEP" });
    g.players[0]!.hand = hand("7♠", "8♥", "9♦");
    expect(chooseBotAction(viewFor(g, 0))).toEqual({ type: "PUSH" });
  });

  it("lays down a winner, takes the best face-up swap, else knocks", () => {
    const g = inPlay();
    g.players[1]!.hand = hand("A♠", "K♠", "Q♠");
    expect(chooseBotAction(viewFor(g, 1))).toEqual({ type: "LAY_DOWN" });
    g.players[1]!.hand = hand("A♠", "K♠", "7♥");
    g.poolUp = hand("8♦", "Q♠", "9♣");
    expect(chooseBotAction(viewFor(g, 1))).toEqual({ type: "SWAP", pool: "up", handIdx: 2, poolIdx: 1 });
    g.poolUp = hand("8♦", "7♣", "9♣");
    expect(chooseBotAction(viewFor(g, 1))).toEqual({ type: "KNOCK" });
  });
});
