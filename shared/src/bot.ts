/**
 * Bot decision-making. Bots only ever see their own `GameView`, so they play
 * with exactly the information a human in that seat would have.
 */

import type { GameAction, GameView } from "./game.js";
import { handScore, isInstantWin } from "./scoring.js";
import type { Card } from "./types.js";

/** Below this, a blind push for the hidden table set is worth the gamble. */
const PUSH_BELOW = 17;

function known(cards: readonly (Card | null)[]): Card[] {
  if (cards.some((c) => c === null)) throw new Error("Bot was asked to act on hidden cards.");
  return cards as Card[];
}

/** Greedy face-up-pool play; placeholder until the easy/normal/hard AIs land in Phase 4. */
export function chooseBotAction(view: GameView): GameAction {
  const hand = known(view.players[view.you]!.hand);
  const score = handScore(hand);

  if (view.phase === "schieben") {
    return score < PUSH_BELOW ? { type: "PUSH" } : { type: "KEEP" };
  }
  if (isInstantWin(hand)) return { type: "LAY_DOWN" };

  const pool = known(view.poolUp);
  let best: GameAction = { type: "KNOCK" };
  let bestScore = score;
  for (let h = 0; h < hand.length; h++) {
    for (let t = 0; t < pool.length; t++) {
      const trial = hand.slice();
      trial[h] = pool[t]!;
      const s = handScore(trial);
      if (s > bestScore) {
        bestScore = s;
        best = { type: "SWAP", pool: "up", handIdx: h, poolIdx: t };
      }
    }
  }
  if (handScore(pool) > bestScore) best = { type: "SWAP_ALL", pool: "up" };
  return best;
}
