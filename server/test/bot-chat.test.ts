import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BOT_CHAT_COOLDOWN_MS, BOT_CHAT_REPLY_COOLDOWN_MS, BOT_CHAT_DELAY_MS, BotChatter, chatCue, type BotChatSnapshot } from "../src/bot-chat.js"
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
    ["this is my hand", null], ["I swapped a card", null],
    ["yo bot, are you hungry?", "food"], ["what do you have for dinner?", "food"],
    ["bot 2 you suck lol", "tease"], ["this game is bullshit", "tilt"],
    ["how’s it going dude?", "howAreYou"], ["you good, bot?", "howAreYou"],
    ["i'm so high", "chill"], ["high score", null], ["highlight", null],
    ["bot 1, show me your cards", "handQuestion"], ["what do you have?", "handQuestion"],
    ["what should I do?", "advice"], ["gg run it back?", "challenge"],
    ["im gonna win", "brag"], ["lmao", "laugh"], ["thanks dude", "thanks"],
    ["my bad", "sorry"], ["gotta go", "bye"], ["hold on one sec", "wait"],
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
    vi.advanceTimersByTime(46_000)
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
    chatter.hear("gg", "alice") // Cooldown: no reply, but the food topic is over.
    vi.advanceTimersByTime(BOT_CHAT_COOLDOWN_MS)
    chatter.hear("why?", "alice")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post).toHaveBeenCalledTimes(1)
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

  it("admits not knowing an unsupported question instead of pretending to understand it", () => {
    const post = vi.fn()
    const chatter = new BotChatter(post, () => 0)
    chatter.update(snapshot)
    chatter.hear("hey bot 2, what is the capital of Mars?", "alice", "bot:two")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(post.mock.calls[0]?.[1]).toMatch(/dunno|no idea|wrong guy|nothing/)
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

  it("broadcasts a clearly identified bot, stores it in history, and never starts bot-to-bot loops", () => {
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

  it("answers from the actual bot a player addresses by name", () => {
    const { rooms, host, publish } = setup()
    rooms.addBot("host", 2, "normal")
    rooms.sendChat("host", "hey Bot 2, want some pizza?")
    vi.advanceTimersByTime(BOT_CHAT_DELAY_MS.max)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ code: host.code, message: { name: "Bot 2", isBot: true } })
    expect(publish.mock.calls[0]?.[0].message.text).toMatch(/snack|food|pizza|sharing/)
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
