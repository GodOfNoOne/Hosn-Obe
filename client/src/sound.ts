/** Short synthesized sound effects (Web Audio, no asset files). */

export type Sound = "card" | "knock" | "turn" | "tick" | "layDown" | "lose" | "win"

const MUTE_KEY = "hosnobe.muted"

let ctx: AudioContext | null = null
let muted = localStorage.getItem(MUTE_KEY) === "1"

// Browsers and WebViews only start audio after a user gesture.
window.addEventListener(
  "pointerdown",
  () => {
    ctx ??= new AudioContext()
    void ctx.resume()
  },
  { once: true },
)

export function isMuted(): boolean {
  return muted
}

export function setMuted(on: boolean): void {
  muted = on
  localStorage.setItem(MUTE_KEY, on ? "1" : "0")
}

function tone(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = "sine",
  volume = 0.2,
): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(at)
  osc.stop(at + dur)
}

/** A filtered noise burst, like a card sliding on felt. */
function swish(c: AudioContext, at: number, dur: number, volume: number): void {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = "bandpass"
  filter.frequency.value = 2500
  const gain = c.createGain()
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(at)
}

const SOUNDS: Record<Sound, (c: AudioContext, t: number) => void> = {
  card: (c, t) => swish(c, t, 0.09, 0.35),
  knock: (c, t) => {
    tone(c, 120, t, 0.12, "triangle", 0.6)
    tone(c, 120, t + 0.16, 0.12, "triangle", 0.6)
  },
  turn: (c, t) => {
    tone(c, 660, t, 0.15)
    tone(c, 880, t + 0.12, 0.25)
  },
  tick: (c, t) => tone(c, 1200, t, 0.05, "square", 0.04),
  layDown: (c, t) =>
    [784, 988, 1175].forEach((f, i) =>
      tone(c, f, t + i * 0.08, 0.3, "triangle"),
    ),
  lose: (c, t) => {
    tone(c, 330, t, 0.22, "triangle")
    tone(c, 247, t + 0.2, 0.4, "triangle")
  },
  win: (c, t) =>
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, f, t + i * 0.12, 0.3, "triangle"),
    ),
}

export function playSound(sound: Sound): void {
  if (muted || !ctx) return
  try {
    SOUNDS[sound](ctx, ctx.currentTime + 0.01)
  } catch {
    // Audio is optional; never let it break the game.
  }
}
