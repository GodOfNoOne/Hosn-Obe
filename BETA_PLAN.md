# Public beta tweaks

Rule fixes and quality-of-life changes after the online launch, done one step at a time.

| Step | Change                                   | Status  |
| ---- | ---------------------------------------- | ------- |
| 1    | Lay down 31/33 immediately (5s window)   | Done    |
| 2    | 33 costs every other player a life       | Next    |
| 3    | One-time return of eliminated players    | Planned |
| 4    | Leave/end-game warnings + return to game | Planned |

## Decisions

- **Lay-down window:** anyone holding 31/33 once hands are revealed (after keep/push), plus whoever swaps into it.
- **During the window:** play goes on normally. Any other move by the holder, or a timeout, is the penalty.
- **Penalty:** the round ends and only the holder loses a life (also for a missed 33).
- **Revival:** only when 2+ players remain and all of them are swimming. Once per game.
- **Returning:** the seat stays as a bot. A "Return to game" button on Home/Online works on the same device and survives an app restart.

## Step 1: Lay down 31/33 immediately

**Engine** (`shared/src/game.ts`)
- `GameState.fire` lists the seats that must lay down. It's kept on the server and never sent to clients.
- A window opens:
  - for every live seat holding 31/33 when keep/push ends. The old rule where the opener keeps the turn on a 31 is gone.
  - for a seat whose `SWAP`/`SWAP_ALL` leaves it on 31/33. The turn passes as usual.
- `LAY_DOWN` is allowed out of turn, but only for seats in `fire`.
- A swap or knock by a seat in `fire` costs that seat a life (`reason: "missedFire"`).
- `missFire(state, seat)` ends the round when the window times out.
- If the knock comes back around while a window is open, the showdown waits (`pendingShowdown`).

**Server** (`server/src/rooms.ts`)
- Runs one timer per open window, using `ROOM_LIMITS.fireMs` (5000 for now).
- Bots lay down after their think time. Humans who miss it are penalized.

**Practice** (`client/src/practice.ts`): runs the same timers on the device.

**Client** (`client/src/Game.tsx`)
- A "Lay down!" button is always shown during play, so it never hints that you hold 31/33.
- There's no countdown on screen.
- The result text explains a missed lay-down.

`PROTOCOL_VERSION` is now 2, so older app builds must be updated.

## Step 2: 33 costs every other player a life

- In `endRound`, a lay-down with a score of 33 makes every other live player lose a life. A 31 keeps the current rule: the lowest hand loses.
- Eliminations follow the normal rules. If only one player is left, the game ends.
- Add tests.

## Step 3: One-time return of eliminated players

- Add `GameState.revivalUsed`.
- After a round, revive if all of these hold:
  - the revival hasn't been used yet
  - 2 or more players are still in
  - all of them are swimming
  - at least one player is out
- Revived players come back swimming (`out = false`, `lives = 0`).
- Add `RoundResult.revived` so the client can announce it.
- Add tests.

## Step 4: Leaving by accident

**Warnings**
- Ask for confirmation on in-game "Leave" and on the host's "End game". "Back to lobby" after the game ends doesn't ask.
- Warn on `beforeunload` during an online game.

**Returning**
- **Server:** leaving mid-game hands the seat to a stand-in bot but keeps the resume token.
  - Resuming turns the seat back into a human (new `convertToHuman` in the engine).
  - The token is dropped when the game ends or goes back to the lobby.
  - If nobody is connected, the room closes after the existing grace period.
- **Client:** save `{token, code}` in `localStorage`.
  - Show a "Return to game" button on the Home and Online screens.
  - If resuming fails, clear the saved data and show "that game has ended".

## Defaults chosen (not specified)

1. If the opener pushes away a dealt 31 during keep/push, there's no penalty. Windows open only once hands are revealed.
2. Laying down without a window just shows an error, with no penalty.
3. A disconnected human gets no protection from the timeout. A player who left (now played by a bot) lays down in time.

## Dev note

The server and client import `@hosn-obe/shared` from its built output. Run `npm run build -w @hosn-obe/shared` after shared changes, then `npm run typecheck` and `npm test`.
