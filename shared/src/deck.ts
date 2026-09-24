/**
 * Deck construction and shuffling for Hosn Obe.
 *
 * Ported faithfully from the original `schwimmen.html` prototype: a 32-card
 * deck of four suits × ranks 7–A, where face cards score 10 and the Ace 11.
 */

import type { Card, Rank, Rng, Suit } from "./types.js";

/** Suit definitions in canonical order, with their red/black colour. */
export const SUITS: ReadonlyArray<{ s: Suit; red: boolean }> = [
  { s: "♠", red: false },
  { s: "♥", red: true },
  { s: "♦", red: true },
  { s: "♣", red: false },
];

/** Just the suit symbols, handy for scoring loops. */
export const SUIT_SYMBOLS: ReadonlyArray<Suit> = SUITS.map((x) => x.s);

/** Rank definitions in ascending order, with their point value. */
export const RANKS: ReadonlyArray<{ r: Rank; v: number }> = [
  { r: "7", v: 7 },
  { r: "8", v: 8 },
  { r: "9", v: 9 },
  { r: "10", v: 10 },
  { r: "J", v: 10 },
  { r: "Q", v: 10 },
  { r: "K", v: 10 },
  { r: "A", v: 11 },
];

/** Number of cards in a full deck (4 suits × 8 ranks). */
export const DECK_SIZE = SUITS.length * RANKS.length;

/** Build a fresh, ordered 32-card deck. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit: suit.s, red: suit.red, rank: rank.r, val: rank.v });
    }
  }
  return deck;
}

/**
 * In-place Fisher–Yates shuffle. Returns the same array for convenience.
 *
 * `rng` defaults to `Math.random` but can be injected for deterministic tests
 * or a server-side CSPRNG.
 */
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
