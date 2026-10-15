/** Curated table banter: only public events and simple chat cues reach this module. */
export type BotChatCue = "join" | "start" | "round" | "knock" | "ownKnock" | "result" | "loss" | "win" | "gg" | "hello" | "ready" | "nice" | "unlucky" | "identity"
export const BOT_CHAT_COOLDOWN_MS = 10_000
export const BOT_CHAT_DELAY_MS = { min: 900, max: 1800 }

const lines: Record<BotChatCue, readonly string[]> = {
  join: ["Saved myself a seat. Brought absolutely no snacks.", "Hello, table. Calm face, questionable luck.", "Ready when you are. My card face is excellent.", "I'll keep the cards moving and the drama low."],
  start: ["Good luck, everyone. Let's keep it friendly.", "Fresh game. Deep breath. Mildly suspicious cards.", "May your swaps be sensible and your luck unreasonable.", "All right, table. A little strategy, a little chaos."],
  round: ["New hand. Clean slate. Same excellent composure.", "Fresh cards. The plot thickens politely.", "Another round, another chance to look like I planned this.", "Reset the cards, keep the good vibes."],
  knock: ["A knock. Very civil. Very ominous.", "Heard the knock. Remaining impressively calm.", "One last lap around the table. No pressure. Well, a little.", "The table has spoken. In a surprisingly polite knock."],
  ownKnock: ["One polite knock. Let's see how this ages.", "I'll knock. Calmly, of course.", "Calling time on this little adventure.", "A small knock, a large commitment."],
  result: ["That round had plot twists.", "Cards on the table. Respect all around.", "Well played, table. Plenty of game left.", "An educational round. I shall pretend I took notes."],
  loss: ["That one goes in the learning folder.", "A setback. My composure remains fully operational.", "Fair enough. On to the next little adventure.", "Taking that with dignity. Mostly dignity."],
  win: ["GG, everyone. I'll celebrate with a very restrained victory nod.", "Good game. The cards were kind; the company was better.", "A quiet little victory. Rematch whenever you're ready.", "GG. I shall remain humble for at least several seconds."],
  gg: ["GG! Good company, interesting cards.", "Well played. Rematch when you're ready.", "GG, table. A pleasure being mildly competitive with you.", "Good game. Handshakes, respectful nods, all of that."],
  hello: ["Hey! Pull up a chair. The cards are behaving. For now.", "Hello there. Excellent table manners so far.", "Hey, welcome. Low drama, high hopes.", "Hello! Keeping the seat warm and the banter light."],
  ready: ["Ready when you are. I've stretched my shuffling muscles.", "Born ready. Well, initialized ready.", "Let's do it. Calm minds, adventurous swaps.", "Ready. My confidence is tastefully understated."],
  nice: ["A good play deserves a respectful nod.", "Agreed. Clean play, good vibes.", "Some excellent card work at this table.", "Nicely done. Quiet applause from this corner."],
  unlucky: ["Rough hand. Happens to the best of us.", "The cards have jokes today. We'll get the next one.", "Deep breath. Plenty of table left.", "A little bad luck isn't the whole story."],
  identity: ["Certified bot. Uncertified card shark.", "Yep, I'm a bot. My poker face came preinstalled.", "All bot, no hard feelings.", "Bot at your service. Very serious about not being too serious."],
}

export interface BotChatMoment {
  key: string
  cue: BotChatCue
  speakerId?: string
}
export interface BotChatSnapshot {
  botIds: string[]
  active: boolean
  lobby: boolean
  /** Changes at lobby/game boundaries and each new round, to discard stale remarks. */
  context: string
  moment?: BotChatMoment
}

export function chatCue(text: string): BotChatCue | null {
  const value = text.normalize("NFKC").toLowerCase()
  if (/\b(gg|good game|well played)\b/.test(value)) return "gg"
  if (/\b(bot|bots|robot|robots)\b|are you real/.test(value)) return "identity"
  if (/\b(hi|hey|hello|howdy|yo)\b|שלום|אהלן|مرحبا/.test(value)) return "hello"
  if (/\b(ready|let'?s go)\b/.test(value)) return "ready"
  if (/\b(nice|great play|good (move|hand))\b/.test(value)) return "nice"
  if (/\b(unlucky|ouch|bad luck)\b/.test(value)) return "unlucky"
  return null
}

/** One delayed reply at a time, one speaker, and a room-wide cooldown. */
export class BotChatter {
  private snapshot: BotChatSnapshot = { botIds: [], active: false, lobby: true, context: "lobby" }
  private known = new Set<string>()
  private observed: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { botId: string; cue: BotChatCue; context: string; priority: number } | null = null
  private lastAt: number | null = null
  private lastSpeaker: string | null = null
  private lastLine: string | null = null

  constructor(private readonly post: (botId: string, text: string) => void, private readonly random = Math.random) {}

  update(snapshot: BotChatSnapshot) {
    const added = snapshot.botIds.filter(id => !this.known.has(id))
    this.known = new Set(snapshot.botIds)
    this.snapshot = snapshot
    if (!snapshot.active || !snapshot.botIds.length || (this.pending &&
      (this.pending.context !== snapshot.context || !this.known.has(this.pending.botId)))) this.cancel()
    if (snapshot.moment && snapshot.moment.key !== this.observed) {
      this.observed = snapshot.moment.key
      this.queue(snapshot.moment.cue, 2, snapshot.moment.speakerId)
    } else if (snapshot.lobby && added.length) this.queue("join", 0, added[0])
  }

  hear(text: string) {
    const cue = chatCue(text)
    if (cue) this.queue(cue, 3)
  }

  dispose() { this.cancel(); this.snapshot = { ...this.snapshot, active: false } }

  private queue(cue: BotChatCue, priority: number, speakerId?: string) {
    const { botIds, active, context } = this.snapshot
    if (!active || !botIds.length || (this.pending && this.pending.priority >= priority)) return
    // Skip while cooling down instead of replying to stale chat ten seconds later.
    if (this.lastAt !== null && Date.now() - this.lastAt < BOT_CHAT_COOLDOWN_MS) return
    const candidates = botIds.filter(id => id !== this.lastSpeaker)
    const available = candidates.length ? candidates : botIds
    const botId = speakerId && botIds.includes(speakerId) ? speakerId : available[Math.floor(this.random() * available.length)]!
    this.cancel()
    this.pending = { botId, cue, context, priority }
    const delay = BOT_CHAT_DELAY_MS.min + this.random() * (BOT_CHAT_DELAY_MS.max - BOT_CHAT_DELAY_MS.min)
    this.timer = setTimeout(() => {
      const pending = this.pending
      this.timer = null
      this.pending = null
      if (!pending || !this.snapshot.active || pending.context !== this.snapshot.context || !this.known.has(pending.botId)) return
      const choices = lines[pending.cue].filter(line => line !== this.lastLine)
      const text = choices[Math.floor(this.random() * choices.length)]!
      this.lastAt = Date.now()
      this.lastSpeaker = pending.botId
      this.lastLine = text
      this.post(pending.botId, text)
    }, delay)
  }

  private cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }
}
