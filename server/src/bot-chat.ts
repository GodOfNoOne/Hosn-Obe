/** Local, laid-back table talk. No private hands or external model calls. */
export type BotChatCue = "join" | "start" | "round" | "knock" | "ownKnock" | "result" | "loss" | "win" | "gg" | "hello" | "ready" | "nice" | "unlucky" | "identity"
  | "howAreYou" | "goodMood" | "tired" | "food" | "chill" | "laugh" | "thanks" | "sorry" | "brag" | "challenge" | "tilt" | "advice" | "handQuestion" | "tease" | "bye" | "wait" | "unknown"
  | "foodFollowUp" | "tiltFollowUp" | "adviceFollowUp" | "chillFollowUp"
export const BOT_CHAT_COOLDOWN_MS = 10_000
export const BOT_CHAT_REPLY_COOLDOWN_MS = 5000
export const BOT_CHAT_DELAY_MS = { min: 900, max: 1800 }
export const BOT_CHAT_REPLY_CHANCE = .65
const FOLLOW_UP_MS = 45_000
const swear = /\b(damn|shit|bullshit|hell|assholes?|smartass)\b/i

const lines: Record<BotChatCue, readonly string[]> = {
  join: ["yo, scoot over. i'm in", "what's good, table", "alright, let's play a few", "i'm here. got distracted for a sec", "yo. who's dealing?", "alright, let's shuffle this shit"],
  start: ["alright, good luck everyone", "let's see what happens", "no stress. just cards", "i'm ready. probably", "let's run it", "alright, let's play some damn cards"],
  round: ["fresh hand. we're good", "okay, forget that last one", "new cards, same questionable plan", "one more. obviously", "alright, reset", "damn, needed a fresh hand"],
  knock: ["oh, we're doing this already?", "alright, let's see it", "okay, now i'm curious", "yeah yeah, one more turn", "someone's feeling confident", "that knock sounded confident as hell"],
  ownKnock: ["yeah, i'm knocking", "alright, let's find out", "knock. don't ask me if i'm sure", "i've thought about this for almost two seconds", "okay, show me what you've got", "hell with it. knock"],
  result: ["okay, that happened", "honestly? fair", "that got weird for a second", "yeah, i saw that going differently", "alright, next hand", "well, shit"],
  loss: ["yeah, that's on me", "not my finest moment. we're good", "okay, you got me", "rough. i'm not tilted though", "gonna pretend that was part of the plan", "ah shit. alright, next one"],
  win: ["gg. run it back?", "nice. i'll take it", "didn't hate that. good game", "gg everyone, that was fun", "okay, that worked out", "oh shit, i actually won. gg"],
  gg: ["gg, that was a good one", "good game, for real", "gg. run it back?", "yeah, well played", "gg. that last bit was wild", "damn, good game"],
  hello: ["yo, what's good", "hey dude", "sup. you playing or just hanging?", "yo, glad you made it", "hey, grab a seat", "what's up"],
  ready: ["yeah dude, let's go", "ready. mostly", "yep, deal 'em", "i'm good, let's run it", "alright, send it", "hell yeah, let's play"],
  nice: ["yeah, that was clean", "okay, that was actually kinda slick", "credit where it's due. nice", "can't even be mad at that", "nice one, dude", "damn, that was smooth"],
  unlucky: ["yeah, that's rough. next one's yours", "bad cards happen. you're good", "nah, don't sweat that one", "we've all had that hand", "take a sec. we'll run another", "cards are being assholes today"],
  identity: ["yeah, i'm a bot. still hanging though", "bot, dude. no mystery there", "yep. just here to play cards", "yeah. don't let that ruin a good game", "a bot with way too much free time", "yep, a bot. these cards still give me shit"],
  howAreYou: ["pretty chill. how about you?", "good, dude. just hanging", "not bad. could use a snack though", "taking it easy. you good?", "same as ever. slightly distracted", "chill as hell, honestly"],
  goodMood: ["nice, dude. glad you're good", "yeah, that's the vibe", "good to hear. let's play a few", "same here, just hanging", "all good then", "hell yeah. love that"],
  tired: ["long day? we can take it easy", "yeah, i get that. no rush", "take a sec, dude. cards can wait", "we can keep it low-key", "same vibe. i'm moving kinda slow", "some days are tiring as hell"],
  food: ["now you've got me thinking about snacks", "yeah, i'd absolutely demolish a snack right now", "cards first or snacks first? tough call", "okay, snack break sounds pretty good", "don't bring up food unless you're sharing", "i could go for some damn pizza"],
  chill: ["just vibing. still watching the table though", "i'm on slow-and-steady mode, dude", "chill table, good company. i'm good", "yeah, keep it mellow", "i'm not in a hurry to do anything", "zero stress. that's the whole damn plan"],
  laugh: ["lmao yeah", "nah, that was funny", "lol, alright, you got me", "i'm laughing, don't make me lose my turn", "okay that got me", "that was funny as hell"],
  thanks: ["yeah, of course", "no worries, dude", "all good", "anytime", "you got it"],
  sorry: ["nah, you're good", "don't worry about it", "all good, dude. really", "happens. we're chilling", "nothing to apologize for"],
  brag: ["okay, confidence. i see you", "alright, big talk. let's play", "save me a little of that luck", "bold. i respect it", "we'll see after the hand", "talk your shit. let's see the cards"],
  challenge: ["yeah, run it back", "i'm down. another one?", "alright, you're on", "say less. let's play", "i've got time", "hell yeah, one more"],
  tilt: ["yeah, rough deals happen. next hand's a clean slate", "i get it. don't let one hand ruin your night", "these cards have zero manners", "take a breath, dude. we're just hanging", "you're allowed to be annoyed. i get it", "sometimes the cards are just bullshit"],
  advice: ["i'd start with one suit. mixing suits won't add all those points", "look for cards that build the same suit. keep it simple", "i can't pick your move for you, dude. try building one suit", "same-suit cards are a decent start. don't overthink it"],
  handQuestion: ["nice try. you'll see at showdown", "nah dude, not showing the table early", "lol, wait for the reveal", "my cards are staying right here for now"],
  tease: ["lmao, fair. let me cook", "talk now, we'll see after the hand", "okay, okay. score that one to you", "i'll survive the roast", "yeah? save it for the scoreboard", "alright, smartass. your turn"],
  bye: ["later, dude. good hanging", "catch you next game", "take it easy", "see you around, dude", "gg, come back whenever"],
  wait: ["yeah, take your time", "no rush, dude", "all good. we're here", "take a sec, you're good"],
  unknown: ["dunno, man. i'm just here for the cards", "you're asking the wrong guy for that one", "honestly? no idea", "i got nothing on that one, dude"],
  foodFollowUp: ["yeah. preferably something you can eat with one hand", "see, now the whole table wants snacks", "snacks and cards. hard to improve on that", "just don't get crumbs on the cards, dude"],
  tiltFollowUp: ["i'm saying the next deal's a fresh start", "yeah, i get it. can't win every hand", "one hand doesn't say much. keep your head", "we're good, dude. take your time"],
  adviceFollowUp: ["only your best single suit adds up. that's the bit to watch", "a swap that builds one suit is usually a decent start", "watch what's face up. that part isn't a mystery", "don't chase every shiny card. pick a suit and build it"],
  chillFollowUp: ["yeah, just taking it easy between hands", "that's all i'm saying. no need to rush it", "good company and a few cards. works for me", "we're chilling, dude"],
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
  const value = normalize(text)
  // Specific topics come before greetings or the word "bot" in an address.
  if (/\b(what (cards? (do you|have you)|is your hand)|what'?s (in )?your hand|show (me )?your (cards|hand)|your (score|points))\b|\bwhat do you have[?!. ]*$/.test(value)) return "handQuestion"
  if (/\b(what should i do|any (tips|advice)|how (do|should) i (play|win)|help me (play|win))\b/.test(value)) return "advice"
  if (/\b(you (suck|are trash|are bad)|you'?re (trash|bad|terrible)|stupid bot|dumb bot|trash bot)\b/.test(value)) return "tease"
  if (/\b(rigged|cheating|bullshit|i hate (this|these)|these cards suck|i'?m tilted)\b/.test(value)) return "tilt"
  if (/\b(i'?m (gonna |going to )?win|i will win|easy win|ez|too easy|you'?re going down)\b/.test(value)) return "brag"
  if (/\b(rematch|run it back|another (game|one)|one more game|play again)\b/.test(value)) return "challenge"
  if (/\b(hungry|snacks?|pizza|munchies|food|chips|dinner|lunch)\b/.test(value)) return "food"
  if (/\b(tired|sleepy|long day|stressed|bored|exhausted)\b/.test(value)) return "tired"
  if (/\b(stoned|baked|chilling|vibing|take it easy|i'?m (so |pretty |too )?high)\b/.test(value)) return "chill"
  if (/\b(how (are|r) (you|u)|how'?s it going|how (are )?you doing|you (good|alright)|what'?s up|sup)\b/.test(value)) return "howAreYou"
  if (/\b(i'?m (good|fine|great)|all good|doing (good|great))\b/.test(value)) return "goodMood"
  if (/\b(thanks|thank you|thx|ty|cheers)\b/.test(value)) return "thanks"
  if (/\b(sorry|my bad|apologies)\b/.test(value)) return "sorry"
  if (/\b(bye|later|gotta go|good night|gn)\b/.test(value)) return "bye"
  if (/\b(wait|hold on|brb|one sec|give me a sec)\b/.test(value)) return "wait"
  if (/\b(gg|good game|well played)\b/.test(value)) return "gg"
  if (/\b(are you (a |an? actual )?(bot|robot|real|human)|you'?re a bot)\b|^(bot\s*\d*|robot)\?+$/.test(value)) return "identity"
  if (/\b(ready|let'?s go)\b/.test(value)) return "ready"
  if (/\b(nice|great play|good (move|hand))\b/.test(value)) return "nice"
  if (/\b(unlucky|ouch|bad luck)\b/.test(value)) return "unlucky"
  if (/\b(lol|lmao|rofl|haha+)\b|[😂🤣]/u.test(value)) return "laugh"
  if (/\b(hi|hey|hello|howdy|yo)\b|שלום|אהלן|مرحبا/.test(value)) return "hello"
  return null
}

function normalize(text: string) { return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").trim() }

function followUp(cue: BotChatCue): BotChatCue {
  if (cue === "food" || cue === "foodFollowUp") return "foodFollowUp"
  if (["tilt", "loss", "unlucky", "tiltFollowUp"].includes(cue)) return "tiltFollowUp"
  if (cue === "advice" || cue === "adviceFollowUp") return "adviceFollowUp"
  return "chillFollowUp"
}

/** One delayed reply at a time, one speaker, and a room-wide cooldown. */
export class BotChatter {
  private snapshot: BotChatSnapshot = { botIds: [], active: false, lobby: true, context: "lobby" }
  private known = new Set<string>()
  private observed: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: { botId: string; cue: BotChatCue; context: string; priority: number; replyTo?: string } | null = null
  private lastAt: number | null = null
  private lastSpeaker: string | null = null
  private recentLines: string[] = []
  private replies = new Map<string, { cue: BotChatCue; botId: string; at: number }>()

  constructor(private readonly post: (botId: string, text: string) => void, private readonly random = Math.random) {}

  update(snapshot: BotChatSnapshot) {
    if (snapshot.context !== this.snapshot.context) this.replies.clear()
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

  hear(text: string, playerId?: string, addressedBotId?: string) {
    const value = normalize(text)
    const previous = playerId ? this.replies.get(playerId) : undefined
    const continuing = !!previous && Date.now() - previous.at <= FOLLOW_UP_MS &&
      /^(really|why|what do you mean|how come|same|me too|yeah|true|you)[?!. ]*$/.test(value)
    const addressed = !!addressedBotId || /\b(bot|robot)\b/.test(value)
    const topic = chatCue(text)
    if (playerId && previous && !continuing && topic !== previous.cue) this.replies.delete(playerId)
    const cue = addressed && value.includes("?") && topic === "hello" ? "unknown"
      : topic ?? (continuing ? followUp(previous.cue) : addressed && value.includes("?") ? "unknown" : null)
    if (!cue) return
    const directed = addressed || continuing || ["howAreYou", "identity", "handQuestion", "advice"].includes(cue)
    if (!directed && this.random() >= BOT_CHAT_REPLY_CHANCE) return
    this.queue(cue, 3, addressedBotId ?? (continuing ? previous.botId : undefined), playerId, directed)
  }

  dispose() { this.cancel(); this.snapshot = { ...this.snapshot, active: false } }

  private queue(cue: BotChatCue, priority: number, speakerId?: string, replyTo?: string, directed = false) {
    const { botIds, active, context } = this.snapshot
    if (!active || !botIds.length || (this.pending && this.pending.priority >= priority && !(replyTo && this.pending.priority === priority))) return
    // Skip while cooling down instead of replying to stale chat ten seconds later.
    const cooldown = directed ? BOT_CHAT_REPLY_COOLDOWN_MS : BOT_CHAT_COOLDOWN_MS
    if (this.lastAt !== null && Date.now() - this.lastAt < cooldown) return
    const candidates = botIds.filter(id => id !== this.lastSpeaker)
    const available = candidates.length ? candidates : botIds
    const botId = speakerId && botIds.includes(speakerId) ? speakerId : available[Math.floor(this.random() * available.length)]!
    this.cancel()
    this.pending = { botId, cue, context, priority, replyTo }
    const delay = BOT_CHAT_DELAY_MS.min + this.random() * (BOT_CHAT_DELAY_MS.max - BOT_CHAT_DELAY_MS.min)
    this.timer = setTimeout(() => {
      const pending = this.pending
      this.timer = null
      this.pending = null
      if (!pending || !this.snapshot.active || pending.context !== this.snapshot.context || !this.known.has(pending.botId)) return
      const fresh = lines[pending.cue].filter(line => !this.recentLines.includes(line))
      const choices = fresh.length ? fresh : lines[pending.cue].filter(line => line !== this.recentLines.at(-1))
      const clean = choices.filter(line => !swear.test(line))
      const spicy = choices.filter(line => swear.test(line))
      const useSwear = !swear.test(this.recentLines.at(-1) ?? "") && this.random() < .2
      const pool = useSwear && spicy.length ? spicy : clean.length ? clean
        : lines[pending.cue].filter(line => !swear.test(line) && line !== this.recentLines.at(-1))
      const text = pool[Math.floor(this.random() * pool.length)]!
      this.lastAt = Date.now()
      this.lastSpeaker = pending.botId
      this.recentLines = [...this.recentLines, text].slice(-8)
      if (pending.replyTo) {
        this.replies.delete(pending.replyTo)
        this.replies.set(pending.replyTo, { cue: pending.cue, botId: pending.botId, at: Date.now() })
        if (this.replies.size > 32) this.replies.delete(this.replies.keys().next().value!)
      }
      this.post(pending.botId, text)
    }, delay)
  }

  private cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }
}
