/**
 * Hand scoring for Hosn Obe.
 *
 * A hand is exactly three cards. Its score is the best of:
 *   - the highest single-suit pip total (e.g. A♠ + K♠ + Q♠ = 31), or
 *   - a three-of-a-kind bonus: three Aces = 33, any other triple = 30.5.
 *
 * A score of 31 (or 33 via three Aces) ends the round instantly.
 */

import { SUIT_SYMBOLS } from "./deck.js";
import type { Card } from "./types.js";

/** Highest score for three Aces. */
export const THREE_ACES_SCORE = 33;
/** Score for any non-Ace three-of-a-kind. */
export const THREE_OF_A_KIND_SCORE = 30.5;
/** The single-suit total that wins instantly. */
export const FIRE_SCORE = 31;

/**
 * Compute the best score for a 3-card hand.
 *
 * @throws if `cards` does not contain exactly three cards.
 */
export function handScore(cards: readonly Card[]): number {
  if (cards.length !== 3) {
    throw new Error(`handScore expects exactly 3 cards, got ${cards.length}`);
  }
  const [a, b, c] = cards as readonly [Card, Card, Card];

  // Three of a kind (same rank): three Aces = 33, any other triple = 30.5.
  if (a.rank === b.rank && b.rank === c.rank) {
    return a.rank === "A" ? THREE_ACES_SCORE : THREE_OF_A_KIND_SCORE;
  }

  // Otherwise, the best single-suit pip total.
  let best = 0;
  for (const suit of SUIT_SYMBOLS) {
    let sum = 0;
    for (const card of cards) {
      if (card.suit === suit) sum += card.val;
    }
    if (sum > best) best = sum;
  }
  return best;
}

/** True when the hand scores 31, or 33 via three Aces — an instant win. */
export function isInstantWin(cards: readonly Card[]): boolean {
  const score = handScore(cards);
  return score === FIRE_SCORE || score === THREE_ACES_SCORE;
}
