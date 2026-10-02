import { useEffect, useState, type CSSProperties } from "react";

import {
  isInstantWin,
  type Card,
  type GameAction,
  type GameEvent,
  type GameView,
  type PlayerView,
  type PoolName,
  type RoomState,
} from "@hosn-obe/shared";

import { CardView, Lives } from "./Card.js";
import { socket } from "./socket.js";
import { useServerError } from "./useServerError.js";

const POOL_LABEL: Record<PoolName, string> = { up: "face-up", down: "face-down" };

function fmt(score: number): string {
  return score === 30.5 ? "30½" : String(score);
}

function nameOf(view: GameView, seat: number): string {
  return seat === view.you ? "You" : (view.players[seat]?.name ?? "?");
}

function describeEvent(view: GameView, ev: GameEvent): string {
  if (ev.type === "deal") {
    const opener = view.startingIdx === view.you ? "You open" : `${nameOf(view, view.startingIdx)} opens`;
    return `Round ${view.round} — ${opener}.`;
  }
  const who = nameOf(view, ev.seat);
  switch (ev.type) {
    case "keep":
      return `${who} kept the dealt cards.`;
    case "push":
      return `${who} pushed — traded all three for the table set.`;
    case "swap":
      return `${who} swapped a card with the ${POOL_LABEL[ev.pool]} pool.`;
    case "swapAll":
      return `${who} swapped all three with the ${POOL_LABEL[ev.pool]} pool.`;
    case "knock":
      return `${who} knocked — everyone else gets one last turn.`;
    case "stand":
      return `${who} stand${ev.seat === view.you ? "" : "s"}.`;
    case "layDown":
      return `${who} laid down!`;
  }
}

function prompt(view: GameView, yourTurn: boolean): string {
  const turnName = nameOf(view, view.turnIdx);
  if (view.phase === "schieben") {
    return yourTurn
      ? "Opening: keep your three cards, or push them for the hidden table set."
      : `${turnName} is deciding to keep or push…`;
  }
  if (view.phase === "play") {
    if (!yourTurn) return `${turnName}'s turn…`;
    if (view.knockerIdx !== null) {
      return `${nameOf(view, view.knockerIdx)} knocked — last move: swap or stand.`;
    }
    return "Your turn: swap a card, or knock to close.";
  }
  if (view.phase === "gameEnd") {
    if (view.winnerIdx === null) return "Nobody survived — it's a draw.";
    return view.winnerIdx === view.you ? "🎉 You win the game!" : `${nameOf(view, view.winnerIdx)} wins the game.`;
  }
  return "Next round starting soon…";
}

function resultText(view: GameView): string {
  const r = view.result;
  if (!r) return "";
  const lost = r.losers.map((i) => nameOf(view, i));
  const parts = [lost.length ? `${lost.join(", ")} lose${lost.length === 1 && lost[0] !== "You" ? "s" : ""} a life.` : "Tie — nobody loses a life."];
  for (const i of r.eliminated) parts.push(`${nameOf(view, i)} ${i === view.you ? "are" : "is"} out!`);
  return parts.join(" ");
}

/** Seats after yours, in turn order, so the table reads clockwise from you. */
function opponentsInOrder(view: GameView): number[] {
  const n = view.players.length;
  const start = view.you >= 0 ? view.you : -1;
  return Array.from({ length: n - 1 }, (_, k) => (start + 1 + k + n) % n).filter(
    (i) => i !== view.you,
  );
}

/** Rim position (-1..1 per axis) for the k-th seat after yours; k=0 is you at the bottom, clockwise. */
function rimStyle(k: number, n: number): CSSProperties {
  const angle = Math.PI / 2 + (2 * Math.PI * k) / n;
  // An exponent < 1 pushes diagonal seats out toward the table's corners.
  const squash = (v: number) => Math.sign(v) * Math.abs(v) ** 0.6;
  const x = squash(Math.cos(angle)).toFixed(3);
  const y = squash(Math.sin(angle)).toFixed(3);
  return {
    left: `calc(50% + (50% - var(--seat-hw)) * ${x})`,
    top: `calc(50% + (50% - var(--seat-hh)) * ${y})`,
  };
}

export function Game({
  view,
  room,
  isHost,
  onLeave,
}: {
  view: GameView;
  room: RoomState;
  isHost: boolean;
  onLeave: () => void;
}) {
  const error = useServerError();
  const [handSel, setHandSel] = useState<number | null>(null);
  const [poolSel, setPoolSel] = useState<{ pool: PoolName; idx: number } | null>(null);
  const [allSel, setAllSel] = useState<PoolName | null>(null);

  // Any new event invalidates a half-made selection.
  useEffect(() => {
    setHandSel(null);
    setPoolSel(null);
    setAllSel(null);
  }, [view.seq]);

  const me: PlayerView | undefined = view.players[view.you];
  const yourTurn = view.turnIdx === view.you && (view.phase === "schieben" || view.phase === "play");
  const canPlay = yourTurn && view.phase === "play";
  const myCards = me?.hand.every((c): c is Card => c !== null) ? (me.hand as Card[]) : null;
  const canLayDown = canPlay && myCards !== null && myCards.length === 3 && isInstantWin(myCards);
  const showdown = view.phase === "roundEnd" || view.phase === "gameEnd";
  const offline = new Set(seatsOffline(room));
  const ev = view.lastEvent;

  function act(action: GameAction) {
    socket.emit("game:action", action);
  }

  function swap() {
    if (allSel) act({ type: "SWAP_ALL", pool: allSel });
    else if (handSel !== null && poolSel) {
      act({ type: "SWAP", pool: poolSel.pool, handIdx: handSel, poolIdx: poolSel.idx });
    }
  }

  function flashHand(seat: number, idx: number): boolean {
    if (!("seat" in ev) || ev.seat !== seat) return false;
    return ev.type === "swapAll" || ev.type === "push" || (ev.type === "swap" && ev.handIdx === idx);
  }

  function flashPool(pool: PoolName, idx: number): boolean {
    if (ev.type === "swap") return ev.pool === pool && ev.poolIdx === idx;
    return (ev.type === "swapAll" && ev.pool === pool) || (ev.type === "push" && pool === "up");
  }

  function renderPool(pool: PoolName, cards: (Card | null)[]) {
    return (
      <div className="pool">
        <div className="pool-head">
          <span className="pool-title">{pool === "up" ? "Face-up" : "Face-down"}</span>
          {canPlay && (
            <button
              type="button"
              className={`select-all ${allSel === pool ? "active" : ""}`}
              aria-pressed={allSel === pool}
              onClick={() => {
                setAllSel(allSel === pool ? null : pool);
                setHandSel(null);
                setPoolSel(null);
              }}
            >
              All 3
            </button>
          )}
        </div>
        <div className="card-row">
          {cards.map((c, i) => (
            <CardView
              key={`${view.seq}-${pool}-${i}`}
              card={c}
              flash={flashPool(pool, i)}
              selected={allSel === pool || (poolSel?.pool === pool && poolSel.idx === i)}
              label={`${POOL_LABEL[pool]} pool card ${i + 1}`}
              onClick={
                canPlay
                  ? () => {
                      setAllSel(null);
                      setPoolSel(poolSel?.pool === pool && poolSel.idx === i ? null : { pool, idx: i });
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="game">
      <p className="game-status" aria-live="polite">
        {prompt(view, yourTurn)}
      </p>

      <div className={`table ${view.players.length >= 6 ? "table--large" : ""}`}>
        <div className="felt">
          {renderPool("up", view.poolUp)}
          {renderPool("down", view.poolDown)}
        </div>

        {opponentsInOrder(view).map((seat, k) => {
          const p = view.players[seat]!;
          return (
            <div
              key={p.id}
              className={`seat ${view.turnIdx === seat && !showdown ? "seat--turn" : ""} ${p.out ? "seat--out" : ""}`}
              style={rimStyle(k + 1, view.players.length)}
            >
              <span className="seat-name">{p.name}</span>
              <div className="card-row card-row--sm">
                {p.hand.map((c, i) => (
                  <CardView key={`${view.seq}-${i}`} card={c} size="sm" flash={flashHand(seat, i)} />
                ))}
              </div>
              <div className="seat-foot">
                <Lives lives={p.lives} />
                {showdown && view.result?.scores[seat] != null && (
                  <span className="score">{fmt(view.result.scores[seat]!)}</span>
                )}
              </div>
              <SeatBadges
                bot={p.isBot}
                offline={offline.has(p.id)}
                knocked={view.knockerIdx === seat}
              />
            </div>
          );
        })}

        {me && (
          <div
            className={`seat seat--you ${yourTurn ? "seat--turn" : ""}`}
            style={rimStyle(0, view.players.length)}
          >
            <span className="seat-name">You</span>
            <div className="seat-foot">
              <Lives lives={me.lives} />
              {showdown && view.result?.scores[view.you] != null && (
                <span className="score">{fmt(view.result.scores[view.you]!)}</span>
              )}
            </div>
            <SeatBadges bot={false} offline={false} knocked={view.knockerIdx === view.you} />
          </div>
        )}
      </div>

      <p className="game-log">{showdown ? resultText(view) : describeEvent(view, ev)}</p>

      {me && (
        <div className={`you ${yourTurn ? "you--turn" : ""}`}>
          <div className="card-row">
            {me.hand.map((c, i) => (
              <CardView
                key={`${view.seq}-${i}`}
                card={c}
                flash={flashHand(view.you, i)}
                selected={allSel !== null || handSel === i}
                label={`Your card ${i + 1}`}
                onClick={
                  canPlay
                    ? () => {
                        setAllSel(null);
                        setHandSel(handSel === i ? null : i);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {yourTurn && view.phase === "schieben" && (
        <div className="row">
          <button className="secondary" onClick={() => act({ type: "KEEP" })}>
            Keep
          </button>
          <button onClick={() => act({ type: "PUSH" })}>Push</button>
        </div>
      )}

      {canPlay && (
        <div className="row">
          <button disabled={!allSel && (handSel === null || !poolSel)} onClick={swap}>
            Swap
          </button>
          {canLayDown ? (
            <button className="laydown" onClick={() => act({ type: "LAY_DOWN" })}>
              Lay down!
            </button>
          ) : (
            <button className="danger" onClick={() => act({ type: "KNOCK" })}>
              {view.knockerIdx === null ? "Knock" : "Stand"}
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="row row--spaced">
        {isHost && (
          <button className="secondary" onClick={() => socket.emit("room:returnToLobby")}>
            {view.phase === "gameEnd" ? "Back to lobby" : "End game"}
          </button>
        )}
        <button className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

function seatsOffline(room: RoomState): string[] {
  return room.seats.flatMap((p) => (p && !p.connected ? [p.id] : []));
}

function SeatBadges({ bot, offline, knocked }: { bot: boolean; offline: boolean; knocked: boolean }) {
  if (!bot && !offline && !knocked) return null;
  return (
    <div className="seat-badges">
      {bot && <span className="badge badge--bot">bot</span>}
      {offline && <span className="badge badge--offline">offline</span>}
      {knocked && <span className="badge badge--knock">knocked</span>}
    </div>
  );
}
