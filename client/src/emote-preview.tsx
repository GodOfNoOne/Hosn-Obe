import { useState } from "react"
import { createRoot } from "react-dom/client"
import { CardEmoteArtwork } from "./CardEmoteArtwork.js"
import "./emotes.css"

const emotes = ["laughing", "angry", "crying", "gg"] as const
const labels = { laughing: "Laughing", angry: "Angry", crying: "Crying", gg: "Good game" }

function Preview() {
  const [animated, setAnimated] = useState(!matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [replay, setReplay] = useState(0)
  return <main>
    <div className="preview-kicker">Hosn Obe / a fresh deck</div>
    <h1>White cards. Big feelings.</h1>
    <p>One clean design, with individually animated faces, tears and effects.</p>
    <div className="preview-actions">
      <button type="button" aria-pressed={!animated} onClick={() => setAnimated(!animated)}>{animated ? "Pause motion" : "Play motion"}</button>
      <button type="button" onClick={() => setReplay(replay + 1)}>Replay reactions</button>
    </div>
    <section className="preview-grid" aria-label="New card emote designs" key={replay}>
      {emotes.map(emote => <article className="preview-tile" key={emote}>
        <CardEmoteArtwork emote={emote} animated={animated} />
        <h2>{labels[emote]}</h2>
      </article>)}
    </section>
    <div className="preview-scale-label">At 88 px, on a light background</div>
    <section className="preview-scale" aria-label="Small emote previews">
      {emotes.map(emote => <CardEmoteArtwork key={emote} emote={emote} />)}
    </section>
  </main>
}

createRoot(document.getElementById("root")!).render(<Preview />)
