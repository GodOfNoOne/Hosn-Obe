import type { Card } from "@hosn-obe/shared";

/** A playing card; `null` renders a face-down back. */
export function CardView({
  card,
  size = "md",
  selected = false,
  flash = false,
  onClick,
  label,
}: {
  card: Card | null;
  size?: "sm" | "md";
  selected?: boolean;
  flash?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const className = [
    "card",
    `card--${size}`,
    card ? (card.red ? "red" : "") : "back",
    onClick ? "selectable" : "",
    selected ? "selected" : "",
    flash ? "swap-flash" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const face = !card ? (
    <span className="qmark">?</span>
  ) : size === "sm" ? (
    <span className="mini">
      {card.rank}
      {card.suit}
    </span>
  ) : (
    <>
      <span className="rank-top">
        {card.rank}
        {card.suit}
      </span>
      <span className="suit-center">{card.suit}</span>
      <span className="rank-bottom">
        {card.rank}
        {card.suit}
      </span>
    </>
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-pressed={selected} aria-label={label}>
      {face}
    </button>
  ) : (
    <div className={className} aria-label={label}>
      {face}
    </div>
  );
}

/** Lives as small low cards; 0 = swimming, below 0 = out. */
export function Lives({ lives }: { lives: number }) {
  if (lives < 0) return <span className="lives lives--out">out</span>;
  if (lives === 0) return <span className="lives swimming">swimming!</span>;
  return (
    <span className="lives" aria-label={`${lives} lives`}>
      {Array.from({ length: lives }, (_, i) => (
        <span key={i} className="life-card">
          7♣
        </span>
      ))}
    </span>
  );
}
