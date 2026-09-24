import { describe, expect, it } from "vitest";

import {
  buildDeck,
  DECK_SIZE,
  RANKS,
  shuffle,
  SUITS,
} from "../src/deck.js";
import type { Card } from "../src/types.js";

/** Stable string key for a card, for set/uniqueness checks. */
function key(c: Card): string {
  return `${c.rank}${c.suit}`;
}

describe("buildDeck", () => {
  it("has 32 unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(DECK_SIZE).toBe(32);
    const unique = new Set(deck.map(key));
    expect(unique.size).toBe(32);
  });

  it("contains every suit × rank combination exactly once", () => {
    const deck = buildDeck();
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const matches = deck.filter(
          (c) => c.suit === suit.s && c.rank === rank.r,
        );
        expect(matches).toHaveLength(1);
        expect(matches[0]!.val).toBe(rank.v);
        expect(matches[0]!.red).toBe(suit.red);
      }
    }
  });

  it("scores Aces at 11 and face cards at 10", () => {
    const deck = buildDeck();
    const ace = deck.find((c) => c.rank === "A")!;
    const jack = deck.find((c) => c.rank === "J")!;
    const king = deck.find((c) => c.rank === "K")!;
    expect(ace.val).toBe(11);
    expect(jack.val).toBe(10);
    expect(king.val).toBe(10);
  });
});

describe("shuffle", () => {
  it("preserves the exact multiset of cards", () => {
    const deck = buildDeck();
    const before = deck.map(key).sort();
    shuffle(deck);
    const after = deck.map(key).sort();
    expect(after).toEqual(before);
  });

  it("is deterministic given a seeded rng", () => {
    // A simple deterministic pseudo-random sequence.
    const makeRng = () => {
      let seed = 42;
      return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    };

    const a = shuffle(buildDeck(), makeRng()).map(key);
    const b = shuffle(buildDeck(), makeRng()).map(key);
    expect(a).toEqual(b);
  });

  it("returns the same array reference", () => {
    const deck = buildDeck();
    expect(shuffle(deck)).toBe(deck);
  });
});
