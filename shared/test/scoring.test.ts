import { describe, expect, it } from "vitest";

import { RANKS } from "../src/deck.js";
import {
  FIRE_SCORE,
  handScore,
  isInstantWin,
  THREE_ACES_SCORE,
  THREE_OF_A_KIND_SCORE,
} from "../src/scoring.js";
import type { Card, Rank, Suit } from "../src/types.js";

/** Build a card from a rank + suit, deriving its point value and colour. */
function card(rank: Rank, suit: Suit): Card {
  const val = RANKS.find((r) => r.r === rank)!.v;
  const red = suit === "♥" || suit === "♦";
  return { rank, suit, val, red };
}

describe("handScore", () => {
  it("sums a single-suit hand", () => {
    // A♠ + K♠ + Q♠ = 11 + 10 + 10 = 31
    const hand = [card("A", "♠"), card("K", "♠"), card("Q", "♠")];
    expect(handScore(hand)).toBe(31);
  });

  it("picks the best suit in a mixed hand", () => {
    // Spades: A(11) + K(10) = 21; Hearts: 7 only. Best = 21.
    const hand = [card("A", "♠"), card("K", "♠"), card("7", "♥")];
    expect(handScore(hand)).toBe(21);
  });

  it("counts only same-suit cards toward a total", () => {
    // One card per suit → best is the highest single card.
    const hand = [card("A", "♠"), card("K", "♥"), card("Q", "♦")];
    expect(handScore(hand)).toBe(11);
  });

  it("scores three Aces as 33", () => {
    const hand = [card("A", "♠"), card("A", "♥"), card("A", "♦")];
    expect(handScore(hand)).toBe(THREE_ACES_SCORE);
    expect(handScore(hand)).toBe(33);
  });

  it("scores a non-Ace three-of-a-kind as 30.5", () => {
    const hand = [card("K", "♠"), card("K", "♥"), card("K", "♦")];
    expect(handScore(hand)).toBe(THREE_OF_A_KIND_SCORE);
    expect(handScore(hand)).toBe(30.5);
  });

  it("throws when the hand is not exactly three cards", () => {
    expect(() => handScore([card("A", "♠"), card("K", "♠")])).toThrow();
    expect(() =>
      handScore([
        card("A", "♠"),
        card("K", "♠"),
        card("Q", "♠"),
        card("J", "♠"),
      ]),
    ).toThrow();
  });
});

describe("isInstantWin", () => {
  it("is true for a 31 (fire)", () => {
    const hand = [card("A", "♠"), card("K", "♠"), card("Q", "♠")];
    expect(handScore(hand)).toBe(FIRE_SCORE);
    expect(isInstantWin(hand)).toBe(true);
  });

  it("is true for three Aces (33)", () => {
    const hand = [card("A", "♠"), card("A", "♥"), card("A", "♦")];
    expect(isInstantWin(hand)).toBe(true);
  });

  it("is false for a non-Ace three-of-a-kind (30.5)", () => {
    const hand = [card("K", "♠"), card("K", "♥"), card("K", "♦")];
    expect(isInstantWin(hand)).toBe(false);
  });

  it("is false for an ordinary hand", () => {
    const hand = [card("A", "♠"), card("K", "♠"), card("7", "♥")];
    expect(isInstantWin(hand)).toBe(false);
  });
});
