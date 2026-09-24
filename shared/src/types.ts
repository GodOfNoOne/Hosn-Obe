/**
 * Core shared types for Hosn Obe.
 *
 * These are framework-agnostic and shared between the server (authoritative
 * game logic) and the client (rendering). Keep this file free of any Node- or
 * browser-specific APIs.
 */

/** The four card suits, represented by their Unicode symbols. */
export type Suit = "♠" | "♥" | "♦" | "♣";

/** Card ranks used in a 32-card Skat/Schwimmen deck (7 through Ace). */
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

/** A single playing card. */
export interface Card {
  suit: Suit;
  rank: Rank;
  /** Point value: 7–10 for pip cards, 10 for face cards, 11 for Ace. */
  val: number;
  /** True for hearts/diamonds (used for red styling in the UI). */
  red: boolean;
}

/** A source of randomness in the range [0, 1), mirroring `Math.random`. */
export type Rng = () => number;
