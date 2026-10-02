import { describe, expect, it } from "vitest";

import { RoomError, RoomManager } from "../src/rooms.js";

function setup(maxPlayers = 4) {
  const rooms = new RoomManager();
  const created = rooms.createRoom("host", "Alice", maxPlayers);
  if (!created.ok) throw new Error(created.error);
  const room = () => rooms.getRoom(created.code)!;
  return { rooms, code: created.code, room };
}

describe("RoomManager", () => {
  it("seats the host in seat 0 with empty seats up to maxPlayers", () => {
    const { room } = setup(3);
    expect(room().seats).toHaveLength(3);
    expect(room().seats[0]).toMatchObject({ id: "host", isHost: true, ready: true });
    expect(room().seats.slice(1)).toEqual([null, null]);
  });

  it("joins into the first empty seat and rejects when full", () => {
    const { rooms, code, room } = setup(2);
    expect(rooms.joinRoom("bob", code.toLowerCase(), "Bob")).toMatchObject({ ok: true });
    expect(room().seats[1]).toMatchObject({ id: "bob", ready: false });
    expect(rooms.joinRoom("carol", code, "Carol")).toEqual({ ok: false, error: "Room is full." });
  });

  it("restricts host controls to the host", () => {
    const { rooms, code } = setup();
    rooms.joinRoom("bob", code, "Bob");
    expect(() => rooms.addBot("bob", 2, "easy")).toThrow(RoomError);
    expect(() => rooms.start("bob")).toThrow(RoomError);
    expect(() => rooms.kick("bob", 0)).toThrow(RoomError);
  });

  it("adds and removes bots with validated seats and levels", () => {
    const { rooms, room } = setup();
    rooms.addBot("host", 1, "hard");
    rooms.addBot("host", 2, "nonsense");
    expect(room().seats[1]).toMatchObject({ isBot: true, botLevel: "hard", name: "Bot 1" });
    expect(room().seats[2]).toMatchObject({ botLevel: "normal", name: "Bot 2" });
    expect(() => rooms.addBot("host", 1, "easy")).toThrow("taken");
    expect(() => rooms.addBot("host", 9, "easy")).toThrow("Invalid seat");
    expect(() => rooms.removeBot("host", 0)).toThrow(RoomError);
    rooms.removeBot("host", 1);
    expect(room().seats[1]).toBeNull();
  });

  it("changes an individual bot's level", () => {
    const { rooms, code, room } = setup();
    rooms.addBot("host", 1, "easy");
    rooms.addBot("host", 2, "easy");
    rooms.setBotLevel("host", 2, "hard");
    expect(room().seats[1]?.botLevel).toBe("easy");
    expect(room().seats[2]?.botLevel).toBe("hard");
    expect(() => rooms.setBotLevel("host", 2, "godlike")).toThrow("Invalid bot level");
    expect(() => rooms.setBotLevel("host", 0, "hard")).toThrow("no bot");
    rooms.joinRoom("bob", code, "Bob");
    expect(() => rooms.setBotLevel("bob", 1, "hard")).toThrow("Only the host");
  });

  it("only starts with 2+ players who are all ready", () => {
    const { rooms, code, room } = setup();
    expect(() => rooms.start("host")).toThrow("at least 2");
    rooms.joinRoom("bob", code, "Bob");
    expect(() => rooms.start("host")).toThrow("ready");
    rooms.setReady("bob", true);
    rooms.start("host");
    expect(room().phase).toBe("playing");
    expect(rooms.joinRoom("carol", code, "Carol")).toMatchObject({ ok: false });
    rooms.returnToLobby("host");
    expect(room().phase).toBe("lobby");
    expect(room().seats[1]?.ready).toBe(false);
  });

  it("kicks humans but not the host or bots", () => {
    const { rooms, code, room } = setup();
    rooms.joinRoom("bob", code, "Bob");
    rooms.addBot("host", 2, "easy");
    expect(() => rooms.kick("host", 0)).toThrow(RoomError);
    expect(() => rooms.kick("host", 2)).toThrow(RoomError);
    expect(rooms.kick("host", 1).kickedId).toBe("bob");
    expect(room().seats[1]).toBeNull();
    expect(() => rooms.setReady("bob", true)).toThrow("not in a room");
  });

  it("promotes the next human to host and closes rooms with only bots", () => {
    const { rooms, code, room } = setup();
    rooms.addBot("host", 1, "easy");
    rooms.joinRoom("bob", code, "Bob");
    rooms.leaveRoom("host");
    expect(room().hostId).toBe("bob");
    expect(room().seats[2]).toMatchObject({ isHost: true, ready: true });
    rooms.leaveRoom("bob");
    expect(rooms.getRoom(code)).toBeNull();
  });

  it("resizes the table, compacting players from cut-off seats", () => {
    const { rooms, room } = setup(5);
    rooms.addBot("host", 4, "easy");
    rooms.setMaxPlayers("host", 3);
    expect(room().seats).toHaveLength(3);
    expect(room().seats[1]?.isBot).toBe(true);
    rooms.addBot("host", 2, "easy");
    expect(() => rooms.setMaxPlayers("host", 2)).toThrow("shrinking");
    rooms.setMaxPlayers("host", 6);
    expect(room().seats).toHaveLength(6);
  });
});
