# Hosn Obe — Multiplayer Android App (APK) Plan

A roadmap for turning the single-file `schwimmen.html` prototype into a real
multiplayer, room-based **Android app (APK)** with an optional bot per seat,
backed by an authoritative game server.

> **Delivery target:** an installable **`.apk` / `.aab`** (Google Play), built by
> wrapping the web UI with **Capacitor**. The game still uses a **remote server**
> for multiplayer — the APK is only the client that connects to it over WebSocket.

---

## 1. Goal & Scope

Transform the current local hot-seat prototype into:

- A **native Android app (APK)** built from a web UI via **Capacitor** (see §3).
- **Online multiplayer** with **rooms/lobbies** players can create and join by code.
- **2–9 players per room** (the game supports up to 9 on one 32-card deck).
- An option to **fill any empty seat with a bot** (reuse the existing AI logic).
- Real-time state sync (deal, swap, schieben, knock, lay-down, lives).
- Runs against a **hosted game server** (authoritative); the APK never trusts
  local game state.

### Non-goals (v1)

- Accounts / persistent stats (can be added later).
- Matchmaking against strangers (rooms are private by code first).
- iOS build (Android first; iOS is a later `npx cap add ios` on the same codebase).
- Google Play publishing is **optional** for v1 — direct APK sideloading to friends
  is fine and avoids the Play Console fee, review times, and privacy-policy work.

---

## 2. What We Already Have (reuse from `schwimmen.html`)

The current file contains **pure game logic** that is framework-agnostic and
should be extracted into a shared module:

| Current function                                                      | Reuse as                                       |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| `buildDeck()`, `shuffle()`                                            | Deck/shuffle utilities                         |
| `handScore(cards)`                                                    | Hand scoring (single-suit / 3-of-a-kind)       |
| `isInstantWin(cards)`                                                 | 31 / three-aces detection                      |
| `deal()`                                                              | Round dealing (adapt to N players)             |
| `pcMove()`, `pcSchieben()`                                            | **Bot AI** (easy/normal/hard, `oppSuitThreat`) |
| schieben state machine (`phase`, `turn`, `startingPlayer`, `knocker`) | Server-side game state                         |
| `finishRound()`                                                       | Scoring / lives resolution                     |

**Key refactor:** all of this logic must move **server-side** (authoritative),
never trusted from the client, to prevent cheating (players seeing others'
cards or forging moves).

---

## 3. Tech Stack Decision

### Recommended: Capacitor (web UI → APK) + Node server

The existing prototype is already HTML/CSS/JS. **Capacitor** wraps that web app
in a native Android WebView and outputs a real `.apk`/`.aab`, so we reuse nearly
all of the current UI and animations while still shipping to the Play Store.

| Layer          | Choice                                                 | Why                                                              |
| -------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| App shell      | **Capacitor (Android)**                                | Wraps the web UI into an installable APK/AAB; iOS later for free |
| Frontend       | **React + TypeScript + Vite** (or keep plain HTML/JS)  | Vite build output is what Capacitor bundles                      |
| Styling        | Port existing CSS (already mobile-ish)                 | Reuse `schwimmen.html` look & animations                         |
| Real-time      | **Socket.IO client** (WebSocket)                       | Rooms first-class, auto-reconnect, works in WebView              |
| Backend        | **Node + Express + Socket.IO** (Render free tier)      | Authoritative game logic; shared TS with client                  |
| State (server) | In-memory `Map<roomId, GameState>` (v1)                | Simple; add Redis later for scale                                |
| Native bits    | Capacitor plugins (StatusBar, Haptics, KeepAwake, App) | Native polish inside the WebView                                 |

**Why Capacitor:** the value here is the card UI + game feel, which already
exists as web code. Capacitor gets us to an APK **without rewriting the UI**,
keeps a single codebase, and still lets us share TypeScript game logic with the
Node server (one `shared/` package).

> **Alternatives (only if native UI is required):**
>
> - **React Native / Expo** — true native components + `expo build` APK, but the
>   card UI/CSS must be rewritten in RN primitives. Can still reuse `shared/` TS logic.
> - **Flutter** — best native performance, but a full rewrite in Dart; cannot
>   reuse the existing JS game logic.
>
> Whichever client we pick, the **server and networking protocol below are
> identical** — only the client rendering changes.

---

## 4. Project Structure (monorepo)

```
hosnobe/
├─ package.json                 # workspaces / turborepo root
├─ shared/                      # framework-agnostic game logic (TS)
│  ├─ deck.ts                   # buildDeck, shuffle
│  ├─ scoring.ts                # handScore, isInstantWin
│  ├─ engine.ts                 # reducer: applyAction(state, action) -> state
│  ├─ bot.ts                    # AI: chooseSchieben(), chooseMove()
│  └─ types.ts                  # Card, GameState, Action, Player
├─ server/                      # hosted on Render (free tier); Oracle Always Free later
│  ├─ index.ts                  # Express + Socket.IO bootstrap
│  ├─ rooms.ts                  # room lifecycle, join codes
│  ├─ gameRoom.ts               # per-room state + turn timers + bot driver
│  └─ validate.ts               # server-side action validation
└─ client/                      # React + Vite web UI, wrapped by Capacitor
   ├─ src/
   │  ├─ socket.ts              # socket.io-client -> hosted server URL (env)
   │  ├─ pages/Lobby.tsx        # create/join room
   │  ├─ pages/Room.tsx         # seats, ready, add-bot, start
   │  ├─ pages/Game.tsx         # the table
   │  ├─ components/Card.tsx    # port cardHTML + flip animation
   │  ├─ components/Hand.tsx
   │  └─ components/TablePool.tsx
   ├─ index.html
   ├─ capacitor.config.ts       # appId, appName, server URL, webDir=dist
   └─ android/                  # generated native project (gradlew assembleRelease -> APK/AAB)
```

> The `client/` web build (`vite build` → `dist/`) is what Capacitor copies into
> the Android project. Running `npx cap sync android` then
> `./gradlew assembleRelease` (or Android Studio) produces the signed **APK/AAB**.

---

## 5. Core Data Model (`shared/types.ts`)

```ts
type Suit = "♠" | "♥" | "♦" | "♣"
interface Card {
  suit: Suit
  rank: string
  val: number
  red: boolean
}

interface Player {
  id: string // socket id or persistent id
  name: string
  isBot: boolean
  botLevel?: "easy" | "normal" | "hard"
  lives: number // start 3 ("swimming" at 0 -> out on next loss)
  hand: Card[] // 3 cards (server only sends YOUR hand to you)
  connected: boolean
}

interface GameState {
  roomId: string
  players: Player[] // seat order
  deck: Card[] // server only
  pool: Card[] // face-up table set (3 cards)
  phase: "lobby" | "schieben" | "play" | "roundEnd" | "gameEnd"
  turnIdx: number // index into players
  startingIdx: number // rotates each round
  knockerIdx: number | null
  round: number
}

type Action =
  | { type: "SCHIEBEN"; choice: "keep" | "push" }
  | { type: "SWAP"; handIdx: number; poolIdx: number }
  | { type: "SWAP_ALL" }
  | { type: "KNOCK" }
  | { type: "LAY_DOWN" }
```

---

## 6. Networking Protocol (Socket.IO events)

**Client → Server**
| Event | Payload | Notes |
| --- | --- | --- |
| `room:create` | `{ name, maxPlayers }` | returns room code |
| `room:join` | `{ code, name }` | join by code |
| `room:addBot` | `{ seatIdx, level }` | host only |
| `room:removeBot` | `{ seatIdx }` | host only |
| `room:start` | `{}` | host only, needs ≥2 players |
| `game:action` | `Action` | validated server-side |
| `room:leave` | `{}` | |

**Server → Client**
| Event | Payload | Notes |
| --- | --- | --- |
| `room:state` | sanitized room (seats, hosts, bots) | |
| `game:state` | `GameState` **with only YOUR hand revealed** | others' hands hidden |
| `game:yourTurn` | `{ deadline }` | for the turn timer |
| `game:roundEnd` | `{ scores, lostLife }` | reveal all hands |
| `game:error` | `{ message }` | invalid action |

**Anti-cheat rule:** the server sends each client a **personalized** `game:state`
where opponents' `hand` arrays are stripped (or replaced with card backs). The
full state exists only on the server.

---

## 7. Rooms & Bots

### Room lifecycle

1. Host calls `room:create` → server makes a 4–6 char **join code**, stores
   `GameState { phase: "lobby" }`, host takes seat 0.
2. Others `room:join` with the code → added to seat list.
3. Host can `room:addBot` on any empty seat, picking difficulty.
4. Host `room:start` when ≥2 seats filled → deal round 1.

### Bot driver (server-side)

- Bots have **no socket**; the room loop detects `players[turnIdx].isBot` and
  calls `bot.chooseMove(state)` after a short "thinking" delay (600–1400 ms) to
  feel natural.
- Reuse the existing `oppSuitThreat` opponent-modeling and the easy/normal/hard
  branches from the current `pcMove()` / `pcSchieben()`.
- A disconnected human seat can be **auto-converted to a bot** so the game
  doesn't stall (configurable).

### Turn timers

- Each human turn has a deadline (e.g., 30 s). On timeout: auto-`KNOCK` or
  auto-skip, preventing griefing/stalls.
- **Client pauses timers until the socket is connected.** On a free-tier server
  that sleeps, a rejoin can hit a 30–60 s cold wake; never let a turn deadline
  fire while disconnected. Show a "waking server…" / "reconnecting…" state and
  start the countdown only after the authoritative `game:yourTurn { deadline }`
  arrives (deadline is server-issued, not client-guessed).

---

## 8. Game Flow Mapping (from current prototype → multiplayer)

| Current (2-player local)               | Multiplayer (N players)                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `startingPlayer` alternates            | `startingIdx` rotates each round                                        |
| `phase = "schieben"` opening keep/push | Only the **dealer/opener** does keep/push; then play proceeds clockwise |
| Player swaps 1 or all 3 with `poolUp`  | Same, but pool is the single shared face-up set                         |
| `knock` = one final move each          | Knock → every **other** player gets one last turn, then showdown        |
| Manual "Lay down!" on 31/33            | Same; instant-win ends the round immediately                            |
| Lives as low cards / "swimming"        | Same per player; 0 lives + loss = eliminated                            |
| Round ends → `finishRound()`           | Lowest hand loses a life; last player standing wins the match           |

> Note: the current file's schieben is a 2-player special case. For N players,
> the classic rule is: the **dealer** looks at a second hand and decides to keep
> or push the face-up set; play then goes around the table once per turn.

---

## 9. Build Phases (milestones)

### Progress

| Phase                       | Status         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Extract logic           | ✅ Done        | Deck/shuffle/scoring + `applyAction` engine and `viewFor` in `shared/` with tests                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1 — Scaffold + debug APK    | ✅ Done        | Debug APK verified on a real phone over LAN (see `docs/RUNNING.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2 — Rooms & lobby           | ✅ Done        | Fixed seats, host controls (seat count, add/remove bot, per-bot difficulty, kick), ready/start, back to lobby                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3 — Core gameplay           | ✅ Done        | Server-driven deal → schieben → play → knock → showdown → next round; personalized `game:state`; resume token (reload/reconnect keeps your seat); seats arranged around the table rim. Bots use a placeholder greedy AI. Rules: max 8 players; lay-down costs the lowest other hand a life; full showdown tie = no loss                                                                                                                                                                                         |
| 4 — Bots                    | ✅ Done        | easy = greedy face-up only; normal = prototype AI (knock 24+, swap, else ≤2 blind gambles); hard = Monte-Carlo lookahead (100 sampled deals, opponents keep face-up cards they took) — ~62% vs normal heads-up, ~3 ms/move. Blind push decided on expected value (face-up set is hidden in the opening). Think delay 600–1400 ms. A disconnected human's turn is played by a normal stand-in after 15 s; the seat stays theirs. Prototype's suit-threat "hard" lost to normal in simulation, so it was replaced |
| 4.5 — Main menu             | ✅ Done        | Home screen "Welcome to Hosn Obe" with Play online (create/join rooms), Practice (offline: the shared engine + bots run on the device, no server needed; table pre-filled with normal bots) and Settings (placeholder). Player name remembered in `localStorage`                                                                                                                                                                                                                                                |
| 5 — N players + lives       | ✅ Done        | Engine already generic (2–8 seats, rotating opener skipping the eliminated, knock-around, 3 lives + swimming, ties all lose, match winner); added 3+ player tests (multi-loser tie, game continues after an elimination) and an "you're out — watching" state in the UI                                                                                                                                                                                                                                         |
| 6 — Native plugins & polish | ✅ Done        | KeepAwake while at a table; Haptics on card taps and when your turn starts; core `SystemBars` (light icons, safe-area insets as CSS vars — Android 16 forces edge-to-edge, so the StatusBar plugin's color/overlay options no longer apply); Android back button (leave room/practice with confirm, else home, else exit); socket reconnects immediately on app resume; Settings → Server address overrides the build-time URL (no rebuild when the tunnel changes)                                             |
| 7 — Mobile resilience       | ⬜ Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8 — Release & deploy        | ⬜ Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Phase 0 — Extract logic (no UI change)

- Move `handScore`, `isInstantWin`, `buildDeck`, `shuffle`, deal logic into
  `shared/` as pure TS with unit tests.
- Rewrite the game as an `applyAction(state, action)` **reducer** (server-authoritative).

### Phase 1 — Scaffold monorepo + first debug APK

- Init workspaces: `shared`, `server`, `client`.
- Vite React app + Express/Socket.IO server + typed socket layer.
- Point the client's socket URL at a hosted server via an env var (no `localhost`
  hardcoding, since the APK runs on a phone, not the dev machine).
- **Add Capacitor now, not later:** `npx cap init` + `npx cap add android`, then
  `vite build` → `npx cap sync android` → `./gradlew assembleDebug` to get a
  **debug APK on a real phone** connecting to a trivial "hello room" server.
  This validates the riskiest mobile unknowns early — WebSocket-in-WebView,
  reconnect on app resume, and cold-start UX — instead of discovering them at
  the end. (Full native polish/plugins come in Phase 6.)

### Phase 2 — Rooms & lobby (no gameplay yet)

- Create/join by code, seat list, host controls, add/remove bot, ready/start.
- Real-time `room:state` sync.

### Phase 3 — Core gameplay online (2 humans)

- Server drives deal → schieben → play → knock → showdown.
- Personalized `game:state` (hide opponents' cards).
- Port `Card`, `Hand`, `TablePool` components + animations.
- **Reconnection token (do it here, not in polish).** Phones background
  constantly, so "resume seat via signed token" is core mobile resilience, not a
  nice-to-have. On (re)connect the client sends its token; the server rebinds the
  socket to the existing seat and replays the current `game:state`. Without this,
  every app-switch drops the player to a bot.

### Phase 4 — Bots

- Server bot driver, difficulty levels, thinking delay.
- Fill empty seats; auto-bot on disconnect.

### Phase 4.5 — Main menu

- Home screen: "Welcome to Hosn Obe" with **Play online**, **Practice**, **Settings**.
- Play online → the existing create/join room screen.
- Practice → an **offline** table with only bots (adjustable seats/levels), run locally by
  the shared engine with the same bot/round pacing as the server.
- Settings → placeholder for now.

### Phase 5 — N players + lives/elimination

- Generalize turn order to N seats, rotating dealer, knock-around, life loss,
  elimination, match winner.

### Phase 6 — Native plugins & polish

(Capacitor + a working debug APK already exist from Phase 1; this phase makes it
feel native.)

- Add native plugins: **KeepAwake** (screen stays on), **Haptics** (card taps),
  **StatusBar**, **App** (back-button/exit handling).
- Ensure the WebView allows the WebSocket connection (HTTPS/WSS server URL;
  set `cleartext` only for local dev).
- Handle app backgrounding: reconnect the socket on resume and re-send the
  reconnection token (see Phase 3).
- Re-test the **debug APK** on a real device after each native change.

### Phase 7 — Mobile polish & resilience

- Turn timers, reconnection (resume seat via token), spectator view,
  sounds/haptics, safe-area insets, portrait/landscape layout, offline banner.
- Handle app backgrounding (socket reconnect on resume).

### Phase 8 — Release & deploy

- **Server (host on Render — free tier):**
  - Push `server/` to a GitHub repo → on [render.com](https://render.com) create a
    **Web Service** from that repo. No credit card, **free forever** (not a trial).
  - Build command `npm install && npm run build`, start command `node dist/index.js`
    (adjust to your scripts); Render provides **HTTPS/WSS** automatically.
  - Bind to `process.env.PORT` (Render sets it) and enable CORS/WebSockets.
  - Set the APK's socket URL to the Render URL via env (e.g. `wss://<app>.onrender.com`).
  - ⚠️ **Free-tier caveat:** the service **sleeps after ~15 min idle**, so the first
    connection wakes it (~30–60s cold start), then it's instant. Fine for friends-only play.
  - **Upgrade path (still free, always-on):** move to an **Oracle Cloud "Always Free"**
    VM later to remove cold starts — same code, just self-hosted on a small Linux box.
  - (Optional Redis adapter for Socket.IO when scaling to many rooms.)
- **APK/AAB:** generate a signing keystore, build a **signed release**
  (`./gradlew assembleRelease` for APK, `bundleRelease` for Play Store AAB).
- Publish the AAB to **Google Play** (or distribute the APK directly for testing).
- Version the app (`versionCode`/`versionName`) and gate breaking server changes.

---

## 10. Security & Fairness Checklist

- [ ] All game logic runs **server-side**; client only sends intents.
- [ ] Server validates every `Action` (right player, right phase, legal move).
- [ ] Opponents' cards **never** leave the server until showdown.
- [ ] Deck shuffled server-side with a CSPRNG.
- [ ] Rate-limit socket events; validate room codes; cap players per room.
- [ ] Reconnection uses a signed session token, not a guessable id.
- [ ] APK talks to the server over **WSS/HTTPS** only (no cleartext in release).
- [ ] Release APK is **signed**; keystore kept out of the repo.
- [ ] Don't ship secrets in the APK — the client only needs the public server URL.

---

## 11. Stretch Features (post-v1)

- Persistent accounts + ELO / stats.
- Public matchmaking queue.
- Chat + emotes in-room.
- Spectator mode.
- Replays / hand history.
- Themes and card-back skins.

---

## 12. First Concrete Steps

1. Create the monorepo (`npm init -w shared -w server -w client`).
2. Port `handScore` + `isInstantWin` into `shared/scoring.ts` with tests.
3. Stand up a "hello room" Socket.IO server + React lobby that can create/join a
   room and show connected players in real time.
4. Add **Capacitor** to `client/` (`npx cap init`, `npx cap add android`),
   `vite build` + `npx cap sync`, and produce a first **debug APK** on a real
   phone connecting to the hosted "hello room" server — proving the end-to-end
   APK → server path early (this is Phase 1, not an afterthought).

From there, gameplay slots into the reducer + event protocol above.
