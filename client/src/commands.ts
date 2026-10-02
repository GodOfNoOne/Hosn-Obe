import type { BotLevel, GameAction } from "@hosn-obe/shared";

import { socket } from "./socket.js";

/** What the room and game screens can ask for; online goes to the server, practice stays local. */
export interface RoomCommands {
  setReady(ready: boolean): void;
  setMaxPlayers(maxPlayers: number): void;
  addBot(seatIdx: number, level: BotLevel): void;
  removeBot(seatIdx: number): void;
  setBotLevel(seatIdx: number, level: BotLevel): void;
  kick(seatIdx: number): void;
  start(): void;
  returnToLobby(): void;
  act(action: GameAction): void;
}

export const socketCommands: RoomCommands = {
  setReady: (ready) => socket.emit("room:setReady", { ready }),
  setMaxPlayers: (maxPlayers) => socket.emit("room:setMaxPlayers", { maxPlayers }),
  addBot: (seatIdx, level) => socket.emit("room:addBot", { seatIdx, level }),
  removeBot: (seatIdx) => socket.emit("room:removeBot", { seatIdx }),
  setBotLevel: (seatIdx, level) => socket.emit("room:setBotLevel", { seatIdx, level }),
  kick: (seatIdx) => socket.emit("room:kick", { seatIdx }),
  start: () => socket.emit("room:start"),
  returnToLobby: () => socket.emit("room:returnToLobby"),
  act: (action) => socket.emit("game:action", action),
};
