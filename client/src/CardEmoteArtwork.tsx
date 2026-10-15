import type { EmoteId } from "@hosn-obe/shared"

const ink = "#182942"
const red = "#ed4263"
const labels: Record<EmoteId, string> = {
  laughing: "Laughing", angry: "Angry", crying: "Crying", gg: "Good game",
}

function Suit({ emote }: { emote: EmoteId }) {
  if (emote === "angry") return <path d="M0-7 5 0 0 7-5 0Z" fill={red} />
  if (emote === "gg") return <path d="M0 6C-2 4-7 1-7-3-7-8-1-8 0-4 1-8 7-8 7-3 7 1 2 4 0 6Z" fill={red} />
  if (emote === "crying") return <path d="M0-8C-2-5-7-2-7 2-7 6-2 7 0 3L-2 8H2L0 3C2 7 7 6 7 2 7-2 2-5 0-8Z" fill={ink} />
  return <path d="M-2 2C-10 7-10-5-3-3-7-12 7-12 3-3 10-5 10 7 2 2L3 8H-3Z" fill={ink} />
}

function Corner({ emote }: { emote: EmoteId }) {
  return <g>
    <path d="M-4-11 0-22 4-11M-2.5-15H2.5" fill="none" stroke={emote === "angry" || emote === "gg" ? red : ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Suit emote={emote} />
  </g>
}

function LaughingFace() {
  return <>
    <g className="emote-eyes" fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round">
      <path d="M64 80 76 74 84 81M108 81 117 74 128 80" />
      <path d="m64 87 12-4m40 0 12 4" strokeWidth="2.5" />
    </g>
    <g fill="#ffb4c7"><ellipse cx="63" cy="100" rx="8" ry="4" /><ellipse cx="129" cy="100" rx="8" ry="4" /></g>
    <g className="emote-mouth">
      <path d="M65 103Q96 115 127 103C125 132 113 147 96 147S67 132 65 103Z" fill={ink} />
      <path d="M70 109Q96 118 122 109L119 120Q96 126 73 120Z" fill="white" />
      <path d="M81 141Q85 128 96 134Q107 128 111 141Q96 151 81 141Z" fill="#ff718f" />
      <path d="M65 103Q96 115 127 103C125 132 113 147 96 147S67 132 65 103Z" fill="none" stroke={ink} strokeWidth="3" />
    </g>
  </>
}

function AngryFace() {
  return <>
    <g stroke={ink} strokeWidth="3.5" strokeLinejoin="round">
      <path d="M62 78 87 87Q83 103 69 97Q62 93 62 78ZM130 78 105 87Q109 103 123 97Q130 93 130 78Z" fill="#f3f7ff" />
      <ellipse cx="78" cy="89" rx="4" ry="6" fill={ink} stroke="none" />
      <ellipse cx="114" cy="89" rx="4" ry="6" fill={ink} stroke="none" />
    </g>
    <g className="emote-brows" stroke={ink} strokeWidth="6" strokeLinecap="round">
      <path d="m61 73 25 12m45-12-25 12" />
    </g>
    <g fill="#ffa5b5" opacity=".65"><ellipse cx="63" cy="107" rx="8" ry="4" /><ellipse cx="129" cy="107" rx="8" ry="4" /></g>
    <g className="emote-mouth">
      <path d="M73 118Q96 107 119 118L121 135H71Z" fill="white" stroke={ink} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M74 126H118m-33-9v16m11-18v18m11-16v16" fill="none" stroke="#b9c9dd" strokeWidth="2" />
    </g>
    <path className="emote-anger-mark" d="M110 46v5h-5m13-5v5h5m-5 13v-5h5" fill="none" stroke={red} strokeWidth="3" strokeLinecap="round" />
  </>
}

function Tear({ side }: { side: "left" | "right" }) {
  return <g className={`emote-tear emote-tear--${side}`}>
    <path d="M0-8C-2-4-6 1-6 5A6 6 0 0 0 6 5C6 1 2-4 0-8Z" fill="#49c9f5" stroke="#159dce" strokeWidth="1.5" />
    <path d="M-2 2q-2 3 0 5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </g>
}

function CryingFace() {
  return <>
    <g className="emote-brows" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round">
      <path d="M64 66Q76 65 84 58M108 58Q116 65 128 66" />
    </g>
    <g stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round">
      <path d="M63 88Q74 77 85 88M107 88Q118 77 129 88" />
    </g>
    <g fill="#ffb4c7" opacity=".7"><ellipse cx="63" cy="102" rx="7" ry="4" /><ellipse cx="129" cy="102" rx="7" ry="4" /></g>
    <g className="emote-mouth">
      <path d="M77 132C77 117 87 108 96 108S115 117 115 132Q108 142 96 136Q84 142 77 132Z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      <path d="M84 131Q96 121 108 131L108 134Q96 129 84 134Z" fill="#ff718f" />
    </g>
    <g fill="#70d9ff"><ellipse cx="64" cy="92" rx="5" ry="2.5" /><ellipse cx="128" cy="92" rx="5" ry="2.5" /></g>
    <g transform="translate(62 108)"><Tear side="left" /></g>
    <g transform="translate(130 112)"><Tear side="right" /></g>
  </>
}

function GoodGameFace() {
  return <>
    <g className="emote-eyes" fill={ink}>
      <ellipse cx="76" cy="83" rx="7" ry="10" /><ellipse cx="116" cy="83" rx="7" ry="10" />
      <g fill="white"><circle cx="78" cy="80" r="2.5" /><circle cx="118" cy="80" r="2.5" /></g>
    </g>
    <g stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round"><path d="M67 65q8-6 15-1m28 0q8-5 15 1" /></g>
    <g fill="#ffb4c7"><ellipse cx="64" cy="102" rx="7" ry="4" /><ellipse cx="128" cy="102" rx="7" ry="4" /></g>
    <path d="M80 106Q96 113 112 106Q110 127 96 128Q82 127 80 106Z" fill={ink} />
    <path d="M87 122q9-8 18 0-9 7-18 0Z" fill="#ff718f" />
    <g className="emote-badge">
      <rect x="65" y="136" width="62" height="25" rx="7" fill="#b5f3de" stroke="#247c72" strokeWidth="2.5" />
      <path d="M91 144a6 6 0 1 0 0 9v-4h-5m21-5a6 6 0 1 0 0 9v-4h-5" fill="none" stroke="#155c55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </>
}

function Steam({ right = false }: { right?: boolean }) {
  return <g transform={right ? "translate(172 89) scale(-1 1)" : "translate(20 89)"}>
    <g className="emote-steam">
      <path d="M13 5 3 2C-8 9-17 1-12-6-17-14-7-20-2-14 6-18 14-10 9-4Z" fill="#f7fbff" stroke="#bdd5eb" strokeWidth="2" strokeLinejoin="round" />
      <path d="M-7-8q1-5 5-3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </g>
  </g>
}

function Sparkle({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${small ? .6 : 1})`}>
    <path className={`emote-sparkle ${small ? "emote-sparkle--small" : ""}`} d="M0-10 3-3 10 0 3 3 0 10-3 3-10 0-3-3Z" fill={small ? "#9fc6ff" : "#83efda"} stroke="#1e665f" strokeWidth="1.5" strokeLinejoin="round" />
  </g>
}

/** One consistent white-card rig; animate parts without inventing new frames. */
export function CardEmoteArtwork({ emote, animated = false }: { emote: EmoteId; animated?: boolean }) {
  const tilt = { laughing: -4, angry: -2, crying: 3, gg: -5 }[emote]
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192"
    className={`card-emote card-emote--${emote}${animated ? " card-emote--animated" : ""}`} role="img" aria-label={labels[emote]}>
    <g transform={`rotate(${tilt} 96 96)`}>
      <g className="emote-body">
        <rect x="40" y="22" width="116" height="154" rx="12" fill="#c5d3e5" stroke={ink} strokeWidth="3.5" />
        <rect x="37" y="17" width="116" height="154" rx="12" fill="#fff" stroke={ink} strokeWidth="3.5" />
        <rect x="43" y="23" width="104" height="142" rx="8" fill="none" stroke="#dce6f2" strokeWidth="1.5" />
        <g transform="translate(52 52)"><Corner emote={emote} /></g>
        <g transform="translate(138 136) rotate(180)"><Corner emote={emote} /></g>
        <g className="emote-face">
          {emote === "laughing" && <LaughingFace />}
          {emote === "angry" && <AngryFace />}
          {emote === "crying" && <CryingFace />}
          {emote === "gg" && <GoodGameFace />}
        </g>
      </g>
    </g>
    {emote === "angry" && <><Steam /><Steam right /></>}
    {emote === "gg" && <><Sparkle x={24} y={66} /><Sparkle x={166} y={116} /><Sparkle x={166} y={43} small /></>}
  </svg>
}
