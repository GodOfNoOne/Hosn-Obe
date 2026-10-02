import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomError, RoomManager } from "../src/rooms.js";

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}

function setup(maxPlayers = 4) {
  const rooms = new RoomManager();
  const host = ok(rooms.createRoom("s-host", "Alice", maxPlayers));
  const room = () => rooms.getRoom(host.code)!;
  return { rooms, code: host.code, host, room };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RoomManager lobby", () => {
  it("seats the host in seat 0 with empty seats up to maxPlayers", () => {
    const { room, host } = setup(3);
    expect(room().seats).toHaveLength(3);
    expect(room().seats[0]).toMatchObject({ id: host.youId, isHost: true, ready: true });
    expect(room().hostId).toBe(host.youId);
    expect(room().seats.slice(1)).toEqual([null, null]);
  });

  it("issues distinct public ids and secret tokens, hidden from room state", () => {
    const { rooms, room, host, code } = setup();
    const bob = ok(rooms.joinRoom("s-bob", code, "Bob"));
    expect(new Set([host.youId, host.token, bob.youId, bob.token]).size).toBe(4);
    expect(JSON.stringify(rooms.toState(room()))).not.toContain(host.token);
  });

  it("joins into the first empty seat and rejects when full", () => {
    const { rooms, code, room } = setup(2);
    expect(rooms.joinRoom("s-bob", code.toLowerCase(), "Bob")).toMatchObject({ ok: true });
    expect(room().seats[1]).toMatchObject({ name: "Bob", ready: false });
    expect(rooms.joinRoom("s-carol", code, "Carol")).toEqual({ ok: false, error: "Room is full." });
  });

  it("restricts host controls to the host", () => {
    const { rooms, code } = setup();
    rooms.joinRoom("s-bob", code, "Bob");
    expect(() => rooms.addBot("s-bob", 2, "easy")).toThrow(RoomError);
    expect(() => rooms.start("s-bob")).toThrow(RoomError);
    expect(() => rooms.kick("s-bob", 0)).toThrow(RoomError);
  });

  it("adds and removes bots with validated seats and levels", () => {
    const { rooms, room } = setup();
    rooms.addBot("s-host", 1, "hard");
    rooms.addBot("s-host", 2, "nonsense");
    expect(room().seats[1]).toMatchObject({ isBot: true, botLevel: "hard", name: "Bot 1" });
    expect(room().seats[2]).toMatchObject({ botLevel: "normal", name: "Bot 2" });
    expect(() => rooms.addBot("s-host", 1, "easy")).toThrow("taken");
    expect(() => rooms.addBot("s-host", 9, "easy")).toThrow("Invalid seat");
    expect(() => rooms.removeBot("s-host", 0)).toThrow(RoomError);
    rooms.removeBot("s-host", 1);
    expect(room().seats[1]).toBeNull();
  });

  it("changes an individual bot's level", () => {
    const { rooms, code, room } = setup();
    rooms.addBot("s-host", 1, "easy");
    rooms.addBot("s-host", 2, "easy");
    rooms.setBotLevel("s-host", 2, "hard");
    expect(room().seats[1]?.botLevel).toBe("easy");
    expect(room().seats[2]?.botLevel).toBe("hard");
    expect(() => rooms.setBotLevel("s-host", 2, "godlike")).toThrow("Invalid bot level");
    expect(() => rooms.setBotLevel("s-host", 0, "hard")).toThrow("no bot");
    rooms.joinRoom("s-bob", code, "Bob");
    expect(() => rooms.setBotLevel("s-bob", 1, "hard")).toThrow("Only the host");
  });

  it("only starts with 2+ players who are all ready, and can return to the lobby", () => {
    const { rooms, code, room } = setup();
    expect(() => rooms.start("s-host")).toThrow("at least 2");
    rooms.joinRoom("s-bob", code, "Bob");
    expect(() => rooms.start("s-host")).toThrow("ready");
    rooms.setReady("s-bob", true);
    rooms.start("s-host");
    expect(room().phase).toBe("playing");
    expect(rooms.getGame(code)?.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(rooms.joinRoom("s-carol", code, "Carol")).toMatchObject({ ok: false });
    rooms.returnToLobby("s-host");
    expect(room().phase).toBe("lobby");
    expect(rooms.getGame(code)).toBeNull();
    expect(room().seats[1]?.ready).toBe(false);
  });

  it("kicks humans but not the host or bots", () => {
    const { rooms, code, room } = setup();
    rooms.joinRoom("s-bob", code, "Bob");
    rooms.addBot("s-host", 2, "easy");
    expect(() => rooms.kick("s-host", 0)).toThrow(RoomError);
    expect(() => rooms.kick("s-host", 2)).toThrow(RoomError);
    expect(rooms.kick("s-host", 1).kickedSocketId).toBe("s-bob");
    expect(room().seats[1]).toBeNull();
    expect(() => rooms.setReady("s-bob", true)).toThrow("not in a room");
  });

  it("promotes the next human to host and closes rooms with only bots", () => {
    const { rooms, code, room } = setup();
    rooms.addBot("s-host", 1, "easy");
    const bob = ok(rooms.joinRoom("s-bob", code, "Bob"));
    rooms.leaveRoom("s-host");
    expect(room().hostId).toBe(bob.youId);
    expect(room().seats[2]).toMatchObject({ isHost: true, ready: true });
    rooms.leaveRoom("s-bob");
    expect(rooms.getRoom(code)).toBeNull();
  });

  it("resizes the table, compacting players from cut-off seats", () => {
    const { rooms, room } = setup(5);
    rooms.addBot("s-host", 4, "easy");
    rooms.setMaxPlayers("s-host", 3);
    expect(room().seats).toHaveLength(3);
    expect(room().seats[1]?.isBot).toBe(true);
    rooms.addBot("s-host", 2, "easy");
    expect(() => rooms.setMaxPlayers("s-host", 2)).toThrow("shrinking");
    rooms.setMaxPlayers("s-host", 8);
    expect(room().seats).toHaveLength(8);
  });
});

describe("RoomManager reconnection", () => {
  it("keeps a dropped player's seat and rebinds it to a new socket with the token", () => {
    const { rooms, code, room } = setup();
    const bob = ok(rooms.joinRoom("s-bob", code, "Bob"));
    rooms.disconnect("s-bob");
    expect(room().seats[1]).toMatchObject({ id: bob.youId, connected: false });

    const { result } = rooms.resume("s-bob2", bob.token);
    expect(result).toMatchObject({ ok: true, code, youId: bob.youId });
    expect(room().seats[1]?.connected).toBe(true);
    rooms.setReady("s-bob2", true);
    expect(room().seats[1]?.ready).toBe(true);
  });

  it("reports the stale socket when a seat is resumed from another connection", () => {
    const { rooms, host } = setup();
    expect(rooms.resume("s-other", host.token).staleSocketId).toBe("s-host");
    expect(() => rooms.setReady("s-host", true)).toThrow("not in a room");
  });

  it("rejects unknown tokens and tokens of players who left", () => {
    const { rooms, code } = setup();
    const bob = ok(rooms.joinRoom("s-bob", code, "Bob"));
    expect(rooms.resume("s-x", "nope").result.ok).toBe(false);
    expect(rooms.resume("s-x", 42).result.ok).toBe(false);
    rooms.leaveRoom("s-bob");
    expect(rooms.resume("s-x", bob.token).result.ok).toBe(false);
  });

  it("frees a lobby seat after the grace period but keeps game seats", () => {
    const { rooms, code, room } = setup();
    const bob = ok(rooms.joinRoom("s-bob", code, "Bob"));
    rooms.disconnect("s-bob");
    rooms.expire(code, bob.youId);
    expect(room().seats[1]).toBeNull();

    const carol = ok(rooms.joinRoom("s-carol", code, "Carol"));
    rooms.setReady("s-carol", true);
    rooms.start("s-host");
    rooms.disconnect("s-carol");
    rooms.expire(code, carol.youId);
    expect(room().seats[1]).toMatchObject({ name: "Carol", connected: false });
  });

  it("drops a room once nobody is connected after the grace period", () => {
    const { rooms, code, host } = setup();
    rooms.addBot("s-host", 1, "easy");
    rooms.start("s-host");
    rooms.disconnect("s-host");
    rooms.expire(code, host.youId);
    expect(rooms.getRoom(code)).toBeNull();
  });
});

describe("RoomManager gameplay", () => {
  function started() {
    const s = setup();
    const bob = ok(s.rooms.joinRoom("s-bob", s.code, "Bob"));
    s.rooms.setReady("s-bob", true);
    s.rooms.start("s-host");
    return { ...s, bob, game: () => s.rooms.getGame(s.code)! };
  }

  it("routes actions to the caller's seat and rejects out-of-turn moves", () => {
    const { rooms, game } = started();
    expect(() => rooms.gameAction("s-bob", { type: "KEEP" })).toThrow("not your turn");
    rooms.gameAction("s-host", { type: "KEEP" });
    expect(game()).toMatchObject({ phase: "play", turnIdx: 1 });
    expect(() => rooms.gameAction("s-nobody", { type: "KNOCK" })).toThrow("not in a room");
  });

  it("sends each socket a view that hides the other hand", () => {
    const { rooms, code, game } = started();
    rooms.gameAction("s-host", { type: "KEEP" });
    const views = new Map(rooms.gameViews(code));
    expect([...views.keys()]).toEqual(["s-host", "s-bob"]);
    const bobView = views.get("s-bob")!;
    expect(bobView.you).toBe(1);
    expect(bobView.players[0]!.hand).toEqual([null, null, null]);
    expect(bobView.players[1]!.hand).toEqual(game().players[1]!.hand);
  });

  it("hands a leaving player's seat to a bot mid-game", () => {
    const { rooms, code, room, game } = started();
    rooms.leaveRoom("s-bob");
    expect(room().seats[1]).toMatchObject({ name: "Bob", isBot: true });
    expect(game().players[1]!.isBot).toBe(true);
    expect(rooms.getRoom(code)).not.toBeNull();
  });

  it("drives bot turns and the next round on a timer", () => {
    vi.useFakeTimers();
    const { rooms, code } = setup();
    rooms.addBot("s-host", 1, "easy");
    rooms.start("s-host");
    const game = rooms.getGame(code)!;
    const onStep = vi.fn((c: string) => rooms.schedule(c, onStep));

    // A fixed non-31 hand so the opener can't keep the turn.
    game.players[0]!.hand = [
      { suit: "♠", rank: "7", val: 7, red: false },
      { suit: "♥", rank: "7", val: 7, red: true },
      { suit: "♦", rank: "8", val: 8, red: true },
    ];
    rooms.gameAction("s-host", { type: "KEEP" });
    rooms.schedule(code, onStep);
    expect(game.turnIdx).toBe(1);
    vi.runOnlyPendingTimers();
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(game.seq).toBeGreaterThan(2);

    // Host knocks (or stands) until the round ends; the bot moves on its timer.
    while (game.phase === "play") {
      if (game.turnIdx === 0) {
        rooms.gameAction("s-host", { type: "KNOCK" });
        rooms.schedule(code, onStep);
      } else {
        vi.runOnlyPendingTimers();
      }
    }
    expect(game.phase).toBe("roundEnd");
    vi.runOnlyPendingTimers();
    expect(game).toMatchObject({ phase: "schieben", round: 2, startingIdx: 1 });
  });
});
