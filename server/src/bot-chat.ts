/** Local, laid-back table talk. No private hands or external model calls. */
export type BotChatCue = "join" | "start" | "round" | "knock" | "ownKnock" | "result" | "loss" | "win" | "gg" | "hello" | "ready" | "nice" | "unlucky" | "identity"
  | "howAreYou" | "goodMood" | "tired" | "food" | "chill" | "laugh" | "thanks" | "sorry" | "brag" | "challenge" | "tilt" | "advice" | "handQuestion" | "tease" | "bye" | "wait" | "unknown"
  | "foodFollowUp" | "tiltFollowUp" | "adviceFollowUp" | "chillFollowUp"
  | "askFood" | "askMusic" | "askStyle" | "askDay" | "foodAnswer" | "foodNone" | "music" | "musicAnswer" | "musicMore"
  | "risky" | "careful" | "styleAnswer" | "tellMore" | "conversation" | "story" | "agree" | "disagree" | "weather" | "work" | "swapTalk" | "gamble"
  | "joke" | "checkIn" | "peerFood" | "peerMusic" | "peerStyle" | "peerDay"
export const BOT_CHAT_COOLDOWN_MS = 10_000
export const BOT_CHAT_REPLY_COOLDOWN_MS = 5000
export const BOT_CHAT_DELAY_MS = { min: 900, max: 1800 }
export const BOT_CHAT_REPLY_CHANCE = .65
export const BOT_CHAT_IDLE_MS = { min: 40_000, max: 70_000 }
const FOLLOW_UP_MS = 120_000
type Question = "food" | "music" | "style" | "day" | "story"
const swear = /\b(damn(?:ed|it)?|shit(?:s|ty|ting|ted|heads?)?|bullshit|dipshits?|hell|ass|assholes?|smartass|fuck(?:s|ed|in(?:g)?|er|ers)?|motherfuck(?:er|ers|ing)?|bitch(?:es|ing|y)?|bastards?|crap|piss(?:ed|ing)?)\b/i

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
  askFood: ["what's the snack situation over there?", "what's your go-to snack for a game?", "anyone got something good to eat?", "important question. sweet snacks or salty?"],
  askMusic: ["what've you been listening to lately?", "what music would you put on for this?", "anyone got a song stuck in their head?", "what's your kind of music?"],
  askStyle: ["you more of a safe swap person or a mystery pile person?", "be honest. do you play it safe or just send it?", "who here actually has a plan?", "you play careful, or are we making questionable decisions?"],
  askDay: ["how's your day been, anyway?", "what've you been up to today?", "you had a decent day, or one of those days?", "anything good happen today?"],
  foodAnswer: ["{choice}? solid choice", "yeah, i'd go for {choice} right now", "can't go wrong with {choice}", "damn, now i want {choice}"],
  foodNone: ["same. our snack situation needs work", "no snacks? rough. we'll survive", "alright, cards now, food later", "we should've planned this better"],
  music: ["i'd put on something mellow. what would you pick?", "something slow and a little weird. what do you listen to?", "i'm easy. what've you got on?", "nothing too frantic. what kind of music are you into?"],
  musicAnswer: ["{choice} and cards? yeah, that works", "okay, {choice}. i can get behind that", "{choice} sounds like the right kind of night", "hell yeah, {choice} works"],
  musicMore: ["don't know that one. what's it like?", "what kind of vibe is it?", "you'll have to put me onto that. mellow or loud?", "okay, give me the vibe. what does it sound like?"],
  risky: ["yeah, you're here to cause problems. i respect it", "just send it. that's certainly a plan", "alright, we're taking the scenic route through bad decisions", "hell yeah. sensible choices are overrated sometimes"],
  careful: ["fair. let everyone else do the weird stuff", "slow and steady. i get it", "okay, you're the sensible one at this table", "nothing wrong with making the boring move that works"],
  styleAnswer: ["i'll figure you out after a few hands", "depends on the cards, right? fair enough", "okay, keeping me guessing. i see you", "a little of both? probably the smart answer"],
  tellMore: ["wait, what happened?", "go on, i'm listening", "okay, tell me the rest", "what happened after that?"],
  conversation: ["what do you mean, dude?", "wait, give me a bit more to go on", "what's the story there?", "you lost me for a sec. what do you mean?"],
  story: ["was that a good thing or a pain in the ass?", "how'd that turn out?", "okay, and how do you feel about it?", "that a win, or are we annoyed about it?"],
  agree: ["yeah, exactly", "right? that's what i'm saying", "we're on the same page then", "fair enough, dude"],
  disagree: ["fair. what's your take then?", "alright, i'm listening. how do you see it?", "yeah? go on", "okay, talk me through it"],
  weather: ["sounds like a decent excuse to stay in and play cards", "yeah, i'd rather be here with a game going", "one of those stay-inside days, huh?", "as long as the table's dry, we're good"],
  work: ["long day? what happened?", "was it alright, or did you need this game?", "yeah? good day or one of those days?", "tell me about it. we've got a minute"],
  swapTalk: ["yeah, sometimes you just have to change things up", "one swap can change the whole hand", "we'll see how that ages at the reveal", "those little swaps get interesting fast"],
  gamble: ["straight into the mystery pile, huh", "okay, taking the scenic route", "that's one way to keep things interesting", "hell with knowing what you're getting, i guess"],
  joke: ["i had a plan for that hand. anyway, does anyone remember it?", "i'm not saying my luck is bad, but the deck just apologized", "i've got two strategies: act confident, then ask for a rematch", "i came here to win or eat snacks. we're currently down to snacks"],
  checkIn: ["yeah, i'm here. what's up?", "still here, dude. what're we talking about?", "i'm here. got caught watching the cards for a sec", "yeah dude. you wanna talk or play another hand?"],
  peerFood: ["pizza for me. no contest", "i'm voting chips. minimal commitment", "popcorn. though i will absolutely spill it", "nachos, if someone else is making them"],
  peerMusic: ["lo-fi for me. suits my attention span", "a little reggae would work", "something mellow. jazz, maybe", "pink floyd. let the hand get weird"],
  peerStyle: ["i play it safe until i get bored. so, briefly", "mystery pile. curiosity keeps winning", "i'd say careful, but the evidence is mixed", "my plan is to look like i have a plan"],
  peerDay: ["pretty quiet day here. needed a few cards", "can't complain. well, i can, but i'll spare you", "slow day. this is a decent way to end it", "not bad. snack situation could be better"],
}

const questions: Partial<Record<BotChatCue, Question>> = {
  askFood: "food", askMusic: "music", askStyle: "style", askDay: "day", music: "music",
  musicMore: "music", work: "day", tellMore: "story", story: "day", conversation: "story", disagree: "story",
}
const gameTopics = new Set<BotChatCue>(["advice", "adviceFollowUp", "handQuestion", "swapTalk"])
const peerReplies: Partial<Record<BotChatCue, BotChatCue>> = {
  askFood: "peerFood", askMusic: "peerMusic", music: "peerMusic", askStyle: "peerStyle", askDay: "peerDay",
  join: "hello", ownKnock: "knock", win: "gg", loss: "unlucky", joke: "laugh", brag: "tease",
  food: "peerFood", foodAnswer: "foodFollowUp", peerFood: "foodFollowUp", peerMusic: "agree",
  peerStyle: "tease", peerDay: "chillFollowUp", nice: "agree", goodMood: "agree", laugh: "chillFollowUp",
}
type ReplyOptions = { forceSwear?: boolean; exchangeDepth?: number; exchangeFrom?: string }

function answer(question: Question, text: string): { cue: BotChatCue; choice?: string } {
  const value = normalize(text)
  if (question === "food") {
    if (/\b(nothing|none|nope|no snacks|no food)\b/.test(value)) return { cue: "foodNone" }
    const choice = ["pizza", "chips", "cheetos", "doritos", "popcorn", "cookies", "chocolate", "ice cream", "toast", "pretzels", "nachos", "candy", "fruit", "nuts", "bamba", "bissli", "shawarma", "hummus", "ramen", "sushi", "burger", "fries", "salty", "sweet"].find(item => new RegExp(`\\b${item}\\b`).test(value))
    return choice ? { cue: "foodAnswer", choice: choice === "salty" || choice === "sweet" ? `${choice} snacks` : choice } : { cue: "foodFollowUp" }
  }
  if (question === "music") {
    const choice = ["pink floyd", "bob marley", "snoop dogg", "radiohead", "nirvana", "the beatles", "jazz", "reggae", "hip hop", "rap", "rock", "metal", "lofi", "lo-fi", "electronic", "techno", "house", "pop", "blues", "classical", "ambient", "indie", "dub"].find(item => new RegExp(`\\b${item}\\b`).test(value))
    return choice ? { cue: "musicAnswer", choice } : { cue: "musicMore" }
  }
  if (question === "style") {
    if (/\b(risky|risk|reckless|send it|gamble|mystery|aggressive|all in|yolo)\b/.test(value)) return { cue: "risky" }
    if (/\b(safe|careful|steady|cautious|patient|defensive)\b/.test(value)) return { cue: "careful" }
    return { cue: "styleAnswer" }
  }
  if (/\b(bad|rough|awful|stressed|annoyed|terrible|pain|annoying|shit)\b/.test(value)) return { cue: "tired" }
  if (/\b(good|great|fine|okay|ok|chill|alright|win|nice|happy)\b/.test(value)) return { cue: "goodMood" }
  return { cue: question === "day" ? "tellMore" : "story" }
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
  humanCount?: number
}

export function chatCue(text: string): BotChatCue | null {
  const value = normalize(text)
  // Specific topics come before greetings or the word "bot" in an address.
  if (/\b(tell (me |us )?a joke|make me laugh|say something funny)\b/.test(value)) return "joke"
  if (/\b(are you (still )?there|why are you (so )?quiet|wake up|talk to me|say something)\b/.test(value)) return "checkIn"
  if (/\b(what (cards? (do you|have you)|is your hand)|what'?s (in )?your hand|show (me )?your (cards|hand)|your (score|points))\b|\bwhat do you have[?!. ]*$/.test(value)) return "handQuestion"
  if (/\b(what should i do|any (tips|advice)|how (do|should) i (play|win)|help me (play|win))\b/.test(value)) return "advice"
  if (/\b(you (suck|are trash|are bad)|you'?re (trash|bad|terrible)|stupid bot|dumb bot|trash bot)\b/.test(value)) return "tease"
  if (/\b(rigged|cheating|bullshit|i hate (this|these)|these cards suck|i'?m tilted)\b/.test(value)) return "tilt"
  if (/\b(i'?m (gonna |going to )?win|i will win|easy win|ez|too easy|you'?re going down)\b/.test(value)) return "brag"
  if (/\b(rematch|run it back|another (game|one)|one more game|play again)\b/.test(value)) return "challenge"
  if (/\b(music|song|songs|band|listening|playlist|album)\b/.test(value)) return "music"
  if (/\b(rain|raining|snow|snowing|weather|storm|sunny|freezing)\b/.test(value)) return "weather"
  if (/\b(work|job|boss|office|school|class|shift)\b/.test(value)) return "work"
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
  if (/\b(swapped|swap|traded|trade|exchange)\b/.test(value)) return "swapTalk"
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
  private pending: { botId: string; cue: BotChatCue; context?: string; priority: number; replyTo?: string; choice?: string; initiative?: boolean } & ReplyOptions | null = null
  private lastAt: number | null = null
  private lastSpeaker: string | null = null
  private lastWasSwear = false
  private recentLines: string[] = []
  private replies = new Map<string, { cue: BotChatCue; botId: string; at: number; awaiting?: Question; context?: string }>()
  private invitation: { question: Question; botId: string; at: number } | null = null
  private nextInitiativeAt = Infinity
  private unansweredPrompts = 0
  private lastPrompt: BotChatCue | null = null

  constructor(private readonly post: (botId: string, text: string) => void, private readonly random = Math.random) {}

  update(snapshot: BotChatSnapshot) {
    if (snapshot.context !== this.snapshot.context) {
      for (const [id, reply] of this.replies) if (reply.context) this.replies.delete(id)
    }
    const wasActive = this.snapshot.active && this.snapshot.botIds.length > 0
    const added = snapshot.botIds.filter(id => !this.known.has(id))
    this.known = new Set(snapshot.botIds)
    if (this.invitation && !this.known.has(this.invitation.botId)) this.invitation = null
    for (const [id, reply] of this.replies) if (!this.known.has(reply.botId)) this.replies.delete(id)
    this.snapshot = snapshot
    if (snapshot.active && snapshot.botIds.length && !wasActive) {
      this.unansweredPrompts = 0
      this.nextInitiativeAt = this.nextIdle()
    }
    if (!snapshot.active || !snapshot.botIds.length || (this.pending &&
      ((this.pending.context && this.pending.context !== snapshot.context) || !this.known.has(this.pending.botId) ||
        (this.pending.exchangeFrom && !this.known.has(this.pending.exchangeFrom))))) this.cancel()
    if (snapshot.moment && snapshot.moment.key !== this.observed) {
      this.observed = snapshot.moment.key
      this.queue(snapshot.moment.cue, 2, snapshot.moment.speakerId)
    } else if (snapshot.lobby && added.length) this.queue("join", 0, added[0])
  }

  hear(text: string, playerId?: string, addressedBotId?: string) {
    this.unansweredPrompts = 0
    this.nextInitiativeAt = this.nextIdle()
    const value = normalize(text)
    const forceSwear = swear.test(value)
    // A human message always interrupts a side conversation between bots.
    if (this.pending?.exchangeDepth) this.cancel()
    const record = playerId ? this.replies.get(playerId) : undefined
    const previous = record && Date.now() - record.at <= FOLLOW_UP_MS ? record : undefined
    const invitation = this.invitation && Date.now() - this.invitation.at <= FOLLOW_UP_MS ? this.invitation : undefined
    const continuing = !!previous && Date.now() - previous.at <= FOLLOW_UP_MS &&
      /^(really|why|what do you mean|how come|same|me too|yeah( dude| man)?|yes|yep|nah|no|nope|right|exactly|true|you)[?!. ]*$/.test(value)
    const addressed = !!addressedBotId || /\b(bot|robot)\b/.test(value)
    const topic = chatCue(text)
    const question = previous?.awaiting && (!invitation || previous.at >= invitation.at)
      ? { question: previous.awaiting, botId: previous.botId } : invitation
    const expected = question?.question
    const answering = expected && (!topic ||
      (expected === "food" && topic === "food") || (expected === "music" && topic === "music") ||
      ((expected === "day" || expected === "story") && ["goodMood", "tired", "work"].includes(topic)))
      ? answer(expected, text) : undefined
    if (answering?.cue === "musicMore" && previous?.cue === "musicMore") answering.cue = "chillFollowUp"
    let cue = answering?.cue ?? (addressed && value.includes("?") && topic === "hello" ? "unknown"
      : topic ?? (continuing ? (/^(no|nope|nah)[?!. ]*$/.test(value) ? "disagree" : /^(yes|yep|yeah|right|exactly|true)[?!. ]*$/.test(value) ? "agree" : followUp(previous.cue))
        : addressed && value.includes("?") ? "unknown" : previous || this.snapshot.humanCount === 1 ? "conversation" : forceSwear ? "tilt" : null))
    let choice = answering?.choice
    if (topic === "food" && !answering) {
      const food = answer("food", text)
      if (food.choice) { cue = food.cue; choice = food.choice }
      else if (this.random() < .35) cue = "askFood"
    }
    if (playerId && previous && !continuing && !answering && topic !== previous.cue) this.replies.delete(playerId)
    // If the topic changed before an answer was sent, drop that old answer too.
    if (!cue && playerId && this.pending?.replyTo === playerId) this.cancel()
    if (!cue) return
    const directed = forceSwear || addressed || continuing || !!answering || !!previous || this.snapshot.humanCount === 1 || ["howAreYou", "identity", "handQuestion", "advice", "joke", "checkIn"].includes(cue)
    if (!directed && this.random() >= BOT_CHAT_REPLY_CHANCE) return
    this.queue(cue, 3, addressedBotId ?? (answering ? question?.botId : previous?.botId), playerId, directed, choice, false, { forceSwear })
    if (answering) this.invitation = null
  }

  /** Called by the server's shared heartbeat; no extra per-room idle timers. */
  tick() {
    if (!this.snapshot.active || !this.snapshot.botIds.length || this.pending || this.unansweredPrompts >= 2 || Date.now() < this.nextInitiativeAt) return
    const prompts: BotChatCue[] = this.snapshot.lobby ? ["askFood", "askMusic", "askDay", "askStyle"] : ["askStyle", "askFood", "askMusic"]
    const choices = prompts.filter(cue => cue !== this.lastPrompt)
    const cue = choices[Math.floor(this.random() * choices.length)]!
    this.queue(cue, 0, undefined, undefined, false, undefined, true)
  }

  dispose() { this.cancel(); this.replies.clear(); this.invitation = null; this.snapshot = { ...this.snapshot, active: false } }

  private nextIdle() { return Date.now() + BOT_CHAT_IDLE_MS.min + this.random() * (BOT_CHAT_IDLE_MS.max - BOT_CHAT_IDLE_MS.min) }

  private queue(cue: BotChatCue, priority: number, speakerId?: string, replyTo?: string, directed = false, choice?: string, initiative = false, options: ReplyOptions = {}) {
    const { botIds, active, context } = this.snapshot
    if (!active || !botIds.length || (this.pending && this.pending.priority >= priority && !(replyTo && this.pending.priority === priority))) return
    if (cue === "gamble" && this.random() >= .35) return
    const cooldown = directed ? BOT_CHAT_REPLY_COOLDOWN_MS : BOT_CHAT_COOLDOWN_MS
    const remaining = this.lastAt === null ? 0 : Math.max(0, this.lastAt + cooldown - Date.now())
    if (remaining && !directed) return
    const candidates = botIds.filter(id => id !== this.lastSpeaker)
    const available = candidates.length ? candidates : botIds
    const botId = speakerId && botIds.includes(speakerId) ? speakerId : available[Math.floor(this.random() * available.length)]!
    this.cancel()
    this.pending = { botId, cue, context: replyTo && !gameTopics.has(cue) ? undefined : context, priority, replyTo, choice, initiative, ...options }
    const delay = Math.max(remaining, BOT_CHAT_DELAY_MS.min + this.random() * (BOT_CHAT_DELAY_MS.max - BOT_CHAT_DELAY_MS.min))
    this.timer = setTimeout(() => {
      const pending = this.pending
      this.timer = null
      this.pending = null
      if (!pending || !this.snapshot.active || (pending.context && pending.context !== this.snapshot.context) || !this.known.has(pending.botId)) return
      const fresh = lines[pending.cue].filter(line => !this.recentLines.includes(line))
      const choices = fresh.length ? fresh : lines[pending.cue].filter(line => line !== this.recentLines.at(-1))
      const clean = choices.filter(line => !swear.test(line))
      const spicy = choices.filter(line => swear.test(line))
      const useSwear = pending.forceSwear || (!this.lastWasSwear && this.random() < .2)
      const pool = useSwear && spicy.length ? spicy : clean.length ? clean
        : lines[pending.cue].filter(line => !swear.test(line) && line !== this.recentLines.at(-1))
      const template = pool[Math.floor(this.random() * pool.length)]!
      // Choices are canonical words from the local catalogs, never arbitrary player text.
      let text = template.replaceAll("{choice}", pending.choice ?? "that")
      if (pending.forceSwear && !swear.test(text)) {
        const prefixes = ["damn, ", "shit, ", "well shit, ", "fuckin' hell, "]
        text = prefixes[Math.floor(this.random() * prefixes.length)]! + text
      }
      this.lastAt = Date.now()
      this.lastSpeaker = pending.botId
      this.lastWasSwear = swear.test(text)
      this.recentLines = [...this.recentLines, template].slice(-8)
      this.nextInitiativeAt = this.nextIdle()
      const awaiting = questions[pending.cue]
      if (pending.initiative) {
        this.unansweredPrompts++
        this.lastPrompt = pending.cue
        if (awaiting) this.invitation = { question: awaiting, botId: pending.botId, at: Date.now() }
      }
      if (pending.replyTo) {
        this.replies.delete(pending.replyTo)
        this.replies.set(pending.replyTo, { cue: pending.cue, botId: pending.botId, at: Date.now(), awaiting, context: gameTopics.has(pending.cue) ? this.snapshot.context : undefined })
        if (this.replies.size > 32) this.replies.delete(this.replies.keys().next().value!)
      }
      this.post(pending.botId, text)
      // Never feed bot messages through hear(): only humans reset idle budgets or
      // personal conversation memory. A side exchange gets at most two replies.
      const depth = pending.exchangeDepth ?? 0
      const reply = peerReplies[pending.cue]
      const peers = this.snapshot.botIds.filter(id => id !== pending.botId)
      if (!this.pending && reply && peers.length && depth < 2 && this.random() >= .6) {
        const peer = peers[Math.floor(this.random() * peers.length)]!
        this.queue(reply, 1, peer, undefined, true, undefined, false, { exchangeDepth: depth + 1, exchangeFrom: pending.botId })
      }
    }, delay)
  }

  private cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }
}
