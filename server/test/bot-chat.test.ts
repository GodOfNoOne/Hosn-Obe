import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BOT_CHAT_COOLDOWN_MS, BOT_CHAT_REPLY_COOLDOWN_MS, BOT_CHAT_DELAY_MS, BOT_CHAT_IDLE_MS, BotChatter, chatCue, type BotChatSnapshot } from "../src/bot-chat.js"
import { RoomManager } from "../src/rooms.js"
import { CHAT_LIMITS, type RoomActionResult } from "@hosn-obe/shared"

const snapshot: BotChatSnapshot = { botIds: ["bot:one", "bot:two"], active: true, lobby: false, context: "1:1:active" }
function ok(result: RoomActionResult) {
  if (!result.ok) throw new Error(result.error)
  return result
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("laid-back bot banter", () => {
  it.each([
    ["hey everyone", "hello"], ["GG!", "gg"], ["ready?", "ready"], ["nice swap", "nice"],
    ["ouch, unlucky", "unlucky"], ["are you a bot?", "identity"], ["שלום", "hello"],
    ["this is my hand", null], ["I swapped a card", "swapTalk"],
    ["yo bot, are you hungry?", "food"], ["what do you have for dinner?", "food"],
    ["bot 2 you suck lol", "tease"], ["this game is bullshit", "tilt"],
    ["how’s it going dude?", "howAreYou"], ["you good, bot?", "howAreYou"],
    ["i'm so high", "chill"], ["high score", null], ["highlight", null],
    ["bot 1, show me your cards", "handQuestion"], ["what do you have?", "handQuestion"],
    ["what should I do?", "advice"], ["gg run it back?", "challenge"],
    ["im gonna win", "brag"], ["lmao", "laugh"], ["thanks dude", "thanks"],
    ["my bad", "sorry"], ["gotta go", "bye"], ["hold on one sec", "wait"],
    ["tell me a joke", "joke"], ["are you there?", "checkIn"], ["what music do you like?", "music"],
    ["my boss was annoying today", "work"], ["it's raining", "weather"],
  ])("recognizes %s without treating ordinary chat as a prompt", (text, cue) => {
    expect(chatCue(text)).toBe(cue)
  })

  it("welcomes the table with one delayed speaker even if many bots join", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    const lobby = { ...snapshot, lobby: true, context: "lobby" }
    chatter.update(lobby)
    for (let n = 0; n < 20; n++) chatter.update(lobby)
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.min - 1)
    expect(post).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe("bot:one")
    expect(post.mock.calls[0]?.[1].trim().length).toBeGreaterThan(0)
    expect(post.mock.calls[0]?.[1].length).toBeLessThanOrEqual(CHAT_LIMITS.maxLength)
  })

  it("replies once, stays quiet during cooldown, then rotates speakers and avoids repeating a line", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    for (let n = 0; n < 10; n++) chatter.hear("hello")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    chatter.hear("hello")
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(1) // No stale reply was queued.
    chatter.hear("hello")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).not.toBe(post.mock.calls[0]?.[0])
    expect(post.mock.calls[1]?.[1]).not.toBe(post.mock.calls[0]?.[1])
  })

  it("lets a human greeting replace a pending introduction", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update({ ...snapshot, lobby: true })
    chatter.hear("hello")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]).toMatch(/^(yo|hey|sup|what's up)/)
  })

  it("observes each public moment once, even on repeated room syncs", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    const event = { ...snapshot, moment: { key: "1:3", cue: "ownKnock" as const, speakerId: "bot:two" } }
    chatter.update(event)
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post.mock.calls[0]?.[0]).toBe("bot:two")
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    chatter.update(event)
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("cancels stale remarks after a round change, removal, disconnection or room disposal", () => {
    for (const change of [
      { ...snapshot, context: "1:2:active" },
      { ...snapshot, botIds: [] },
      { ...snapshot, active: false },
      null,
    ]) {
      const post = vi.fn()
      const chatter = new BotChatter(post, () => 0)
      chatter.update(snapshot)
      chatter.hear("hello")
      if (change) chatter.update(change)
      else chatter.dispose()
      vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
      expect(post).not.toHaveBeenCalled()
    }
  })

  it("sometimes sits out ordinary chat but responds when a player addresses a bot", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .9)
    chatter.update(snapshot)
    chatter.hear("i'm hungry", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).not.toHaveBeenCalled()
    chatter.hear("bot 2, i'm hungry", "alice", "bot:two")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe("bot:two")
    expect(post.mock.calls[0]?.[1]).toMatch(/snack|food|sharing/)
  })

  it("allows directed follow-ups sooner while keeping ambient banter on the longer cooldown", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    chatter.hear("i'm hungry", "alice", "bot:one")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    chatter.hear("gg", "bob")
    vi.advanceTimersByTime(1)
    expect(vi.getTimerCount()).toBe(0)
    chatter.hear("why?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe("bot:one")
  })

  it("keeps short follow-ups tied to the same player, topic and bot", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    chatter.hear("i'm hungry", "alice", "bot:two")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    chatter.hear("really?", "bob")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    chatter.hear("really?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe("bot:two")
    expect(post.mock.calls[1]?.[1]).toMatch(/snack|crumbs|eat/)
    vi.advanceTimersByTime(121_000)
    chatter.hear("why?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it("doesn't keep replying about an old topic after a player changes the subject", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    chatter.hear("snacks", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    chatter.hear("gg", "alice") // Queued until cooldown ends; the food topic is over.
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    chatter.hear("why?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(3)
    expect(post.mock.calls.at(-1)?.[1]).not.toMatch(/snack|pizza|food/)
  })

  it("keeps swearing occasional instead of using it in consecutive replies", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    for (let n = 0; n < 8; n++) {
      chatter.hear("i'm gonna win", "alice")
      vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max + BOT_CHAT_COOLDOWN_MS)
    }
    const texts = post.mock.calls.map(call => call[1] as string)
    expect(texts.some(text => /\bshit\b/.test(text))).toBe(true)
    for (let n = 1; n < texts.length; n++) {
      expect(texts[n]).not.toBe(texts[n - 1])
      expect(/\bshit\b/.test(texts[n]!) && /\bshit\b/.test(texts[n - 1]!)).toBe(false)
    }
  })

  it.each(["fuck", "fucking", "fucked", "shit", "shitty", "bullshit", "bitch", "asshole", "damn", "hell", "pissed"])("always swears back to %s, adding profanity when the topic has no profane templates", word => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, humanCount: 2 })
    chatter.hear(`thanks, ${word}`, "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]).toMatch(/\b(damn|shit|hell|fuck|bullshit)\b/)
    expect(post.mock.calls[0]?.[1].length).toBeLessThanOrEqual(CHAT_LIMITS.maxLength)
  })

  it("answers unrecognized swearing at a shared table without the normal random sit-out", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, humanCount: 2 })
    chatter.hear("fucking unbelievable", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]).toMatch(/\b(damn|shit|hell|fuck|bullshit)\b/)
  })

  it("matches consecutive swearing through cooldown, then returns to a clean reply", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, botIds: ["bot:one"] })
    chatter.hear("hello fucker", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    chatter.hear("thanks, shithead", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS - 1000)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    chatter.hear("sorry, fucking distracted", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(3)
    for (const [, text] of post.mock.calls) expect(text).toMatch(/\b(damn|shit|hell|fuck)\b/)
    chatter.hear("thanks dude", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(4)
    expect(post.mock.calls[3]?.[1]).not.toMatch(/\b(damn|shit|hell|fuck)\b/)
  })

  it("doesn't carry swearing into a newer clean message while a reply is queued", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("thanks, fucker", "alice")
    chatter.hear("thanks dude", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]).not.toMatch(/\b(damn|shit|hell|fuck)\b/)
  })

  it.each(["class assignment", "hello", "shell", "pass", "grass", "assistance", "Scunthorpe"])("doesn't treat %s as swearing", text => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, humanCount: 2 })
    chatter.hear(text, "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).not.toHaveBeenCalled()
  })

  it("lets different bots exchange topical replies with pauses, then stops the chain", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update(snapshot)
    chatter.hear("bot, want some snacks?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS - 1000)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).not.toBe(post.mock.calls[0]?.[0])
    expect(post.mock.calls[1]?.[1]).toMatch(/pizza|chips|popcorn|nachos/)
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(3)
    expect(post.mock.calls[2]?.[0]).not.toBe(post.mock.calls[1]?.[0])
    expect(post.mock.calls[2]?.[1]).toMatch(/snack|crumbs|eat/)
    vi.advanceTimersByTime(120_000)
    expect(post).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ["askMusic", /lo-fi|reggae|jazz|pink floyd/],
    ["askStyle", /safe|mystery|careful|plan/],
    ["askDay", /day|complain|not bad/],
    ["joke", /laugh|funny|lmao|lol|got me/],
  ] as const)("lets a peer respond naturally to %s", (cue, reply) => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, moment: { key: "topic", cue, speakerId: "bot:one" } })
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max + BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe("bot:two")
    expect(post.mock.calls[1]?.[1]).toMatch(reply)
  })

  it.each(["thanks dude", "I left your keys on the desk"])("interrupts a pending bot exchange for human chat: %s", text => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, moment: { key: "snacks", cue: "askFood", speakerId: "bot:one" }, humanCount: 2 })
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    chatter.hear(text, "alice")
    vi.advanceTimersByTime(60_000)
    // Neither human message triggers a bot reply at this shared table. Both
    // still stop the scheduled side exchange, rather than letting bots talk over it.
    expect(post).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("prioritizes a human question over a scheduled peer reply", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update(snapshot)
    chatter.hear("bot, want some snacks?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const speaker = post.mock.calls[0]?.[0]
    chatter.hear("bot, show me your hand", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe(speaker)
    expect(post.mock.calls[1]?.[1]).toMatch(/showdown|table early|reveal|right here/)
    vi.advanceTimersByTime(60_000)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it.each(["round", "remove", "removeSource", "disconnect", "dispose"])("cancels a pending peer reply on %s", change => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, moment: { key: "snacks", cue: "askFood", speakerId: "bot:one" } })
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    if (change === "dispose") chatter.dispose()
    else chatter.update({ ...snapshot,
      context: change === "round" ? "1:2:active" : snapshot.context,
      botIds: change === "remove" ? ["bot:one"] : change === "removeSource" ? ["bot:two"] : snapshot.botIds,
      active: change !== "disconnect",
    })
    vi.advanceTimersByTime(60_000)
    expect(post).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("doesn't let peer replies restart the unanswered idle prompt budget", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update(snapshot)
    for (let n = 0; n < 6; n++) {
      vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
      chatter.tick()
      vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max + 2 * BOT_CHAT_REPLY_COOLDOWN_MS)
    }
    expect(post).toHaveBeenCalledTimes(6) // Two prompts, each with two bounded peer replies.
    expect(vi.getTimerCount()).toBe(0)
  })

  it("admits not knowing an unsupported question instead of pretending to understand it", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    chatter.hear("hey bot 2, what is the capital of Mars?", "alice", "bot:two")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post.mock.calls[0]?.[1]).toMatch(/dunno|no idea|wrong guy|nothing/)
  })

  it("queues rapid conversational replies during cooldown and answers the latest topic", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("hey", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    chatter.hear("i'm hungry", "alice")
    vi.advanceTimersByTime(100)
    chatter.hear("actually, what music do you like?", "alice")
    vi.advanceTimersByTime(100)
    expect(post).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[1]).toMatch(/music|listen|mellow|got on/)
    expect(post.mock.calls[1]?.[1]).not.toMatch(/snack|pizza/)
  })

  it("responds to ordinary sentences at a one-human table without a keyword or bot address", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .9)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("I don't even know where to begin with today", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]).toMatch(/story|mean|more/)
  })

  it("asks about snacks and recognizes a bare answer from the player it invited", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("i'm hungry", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const speaker = post.mock.calls[0]?.[0]
    expect(post.mock.calls[0]?.[1]).toMatch(/snack.*\?|eat.*\?/)
    chatter.hear("Doritos", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe(speaker)
    expect(post.mock.calls[1]?.[1]).toContain("doritos")
  })

  it("keeps a music conversation and its queued reply alive across a new round", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("what music do you like?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const speaker = post.mock.calls[0]?.[0]
    chatter.hear("Pink Floyd", "alice")
    chatter.update({ ...snapshot, context: "1:2:active", humanCount: 1 })
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe(speaker)
    expect(post.mock.calls[1]?.[1]).toContain("pink floyd")
  })

  it("starts at most two unanswered conversations, then waits for a human to re-engage", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    for (let n = 0; n < 6; n++) {
      vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
      chatter.tick()
      vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    }
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[0]?.[1]).toContain("?")
    expect(post.mock.calls[1]?.[1]).not.toBe(post.mock.calls[0]?.[1])
    chatter.hear("hey", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    chatter.tick()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(4)
  })

  it("can answer an unsolicited table question without saying hi or naming a bot", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    chatter.tick()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const speaker = post.mock.calls[0]?.[0]
    chatter.hear("depends on the day", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[0]).toBe(speaker)
    expect(post.mock.calls[1]?.[1]).toMatch(/few hands|depends|guessing|both/)
  })

  it("uses the newest table question instead of an older unfinished conversation", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update({ ...snapshot, humanCount: 1 })
    chatter.hear("hungry", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    chatter.tick()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    chatter.hear("reckless", "alice")
    vi.advanceTimersByTime(BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(post).toHaveBeenCalledTimes(3)
    expect(post.mock.calls[2]?.[1]).toMatch(/problems|send it|bad decisions|choices/)
  })

  it("cancels an idle prompt when everyone disconnects and never posts after disposal", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    chatter.tick()
    chatter.update({ ...snapshot, active: false })
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).not.toHaveBeenCalled()
    chatter.dispose()
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    chatter.tick()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).not.toHaveBeenCalled()
  })

  it("doesn't hijack unknown messages between human players at a shared table", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => .99)
    chatter.update({ ...snapshot, humanCount: 2 })
    chatter.hear("I left your keys on the desk", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).not.toHaveBeenCalled()
  })
})

describe("bot messages in rooms", () => {
  function setup() {
    const publish = vi.fn()
    const rooms = new RoomManager(publish)
    const host = ok(rooms.createRoom("host", "Alice", 4))
    rooms.addBot("host", 1, "normal")
    return { rooms, host, publish }
  }

  it("broadcasts a clearly identified bot, stores it in history, and doesn't reply to itself", () => {
    const { rooms, host, publish } = setup()
    rooms.schedule(host.code, vi.fn())
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ code: host.code, message: { isBot: true, name: "Bot 1" } })
    expect(rooms.chatHistory("host").messages[0]?.isBot).toBe(true)
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    rooms.sendChat("host", "hello")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(rooms.chatHistory("host").messages).toHaveLength(3)
  })

  it("broadcasts bounded peer exchanges through the normal room history", () => {
    const { rooms, host, publish } = setup()
    rooms.addBot("host", 2, "normal")
    vi.mocked(Math.random).mockReturnValue(.99)
    rooms.sendChat("host", "bot, want some snacks?")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max + 2 * BOT_CHAT_REPLY_COOLDOWN_MS)
    expect(publish).toHaveBeenCalledTimes(3)
    const messages = rooms.chatHistory("host").messages
    expect(messages).toHaveLength(4)
    expect(messages.slice(1).every(message => message.isBot)).toBe(true)
    expect(messages[1]?.playerId).not.toBe(messages[2]?.playerId)
    expect(messages[2]?.playerId).not.toBe(messages[3]?.playerId)
    expect(messages[2]?.text).toMatch(/pizza|chips|popcorn|nachos/)
    vi.advanceTimersByTime(60_000)
    expect(publish).toHaveBeenCalledTimes(3)
    expect(rooms.chatHistory("host").messages).toHaveLength(4)
  })

  it("answers from the actual bot a player addresses by name", () => {
    const { rooms, host, publish } = setup()
    rooms.addBot("host", 2, "normal")
    rooms.sendChat("host", "hey Bot 2, want some pizza?")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ code: host.code, message: { name: "Bot 2", isBot: true } })
    expect(publish.mock.calls[0]?.[0].message.text).toMatch(/snack|food|pizza|sharing/)
  })

  it("uses the server heartbeat for initiative without changing the game", () => {
    const { rooms, host, publish } = setup()
    rooms.start("host")
    rooms.botChatPulse()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const seq = rooms.getGame(host.code)!.seq
    vi.advanceTimersByTime(BOT_CHAT_IDLE_MS.max)
    rooms.botChatPulse()
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[1]?.[0].message.text).toContain("?")
    expect(rooms.getGame(host.code)!.seq).toBe(seq)
  })

  it("doesn't publish after a bot is removed, even before another room sync", () => {
    const { rooms, host, publish } = setup()
    rooms.schedule(host.code, vi.fn())
    rooms.removeBot("host", 1)
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).not.toHaveBeenCalled()
  })

  it("disposes pending chat when the room closes", () => {
    const { rooms, host, publish } = setup()
    rooms.schedule(host.code, vi.fn())
    rooms.leaveRoom("host")
    expect(rooms.getRoom(host.code)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).not.toHaveBeenCalled()
  })

  it("stays silent with no connected human audience", () => {
    const { rooms, host, publish } = setup()
    rooms.schedule(host.code, vi.fn())
    rooms.disconnect("host")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).not.toHaveBeenCalled()
  })

  it("doesn't impersonate a human whose seat is being played by a stand-in bot", () => {
    const publish = vi.fn()
    const rooms = new RoomManager(publish)
    const host = ok(rooms.createRoom("host", "Alice", 4))
    ok(rooms.joinRoom("bob", host.code, "Bob"))
    rooms.setReady("bob", true)
    rooms.start("host")
    rooms.leaveRoom("bob")
    rooms.sendChat("host", "hello bot")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).not.toHaveBeenCalled()
    expect(rooms.chatHistory("host").messages).toHaveLength(1)
  })

  it("reacts to the public game outcome without including hands or scores", () => {
    const { rooms, host, publish } = setup()
    rooms.start("host")
    const game = rooms.getGame(host.code)!
    game.phase = "gameEnd"
    game.winnerIdx = 1
    rooms.schedule(host.code, vi.fn())
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    const message = publish.mock.calls[0]?.[0].message
    expect(message).toMatchObject({ isBot: true, playerId: game.players[1]!.id })
    expect(message.text).toMatch(/gg|good game|won/)
    expect(message.text.length).toBeLessThanOrEqual(CHAT_LIMITS.maxLength)
    expect(Object.keys(message).sort()).toEqual(["id", "isBot", "name", "playerId", "sentAt", "text"])
  })
})
