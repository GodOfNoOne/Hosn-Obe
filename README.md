# Hosn Obe

A multiplayer card game (Schwimmen / 31 variant) — room-based online play with an
optional bot per seat, delivered as an Android app backed by an authoritative
game server.

See [MULTIPLAYER_PLAN.md](MULTIPLAYER_PLAN.md) for the full architecture and roadmap.

## Monorepo layout

```
Hosn-Obe/
├─ shared/        # framework-agnostic game logic (deck, scoring, types, net) + tests
├─ server/        # authoritative game server (Express + Socket.IO)
├─ client/        # React + Vite client, wrapped by Capacitor for Android
├─ prototype/     # original single-file prototype (schwimmen.html) for reference
└─ MULTIPLAYER_PLAN.md
```

## Requirements

- Node.js >= 20 (developed on Node 24)
- npm >= 10 (uses npm workspaces)
- Android Studio + SDK (only needed to build the Android APK)

## Getting started

```bash
npm install        # install all workspace deps
npm test           # run unit tests across workspaces
npm run build      # compile every workspace
npm run typecheck  # type-check every workspace
```

## Running locally (Phase 1 — hello room)

Two terminals:

```bash
npm run dev:server   # starts the Socket.IO server on http://localhost:3000
npm run dev:client   # starts the Vite dev server on http://localhost:5173
```

Copy the env examples first if you want to override defaults:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env      # set VITE_SERVER_URL for a hosted server
```

Open two browser tabs at the client URL: create a room in one, join with the
code in the other, and watch the seat list sync in real time.

> For the full hands-on runbook — starting the server, simulating on a PC, and
> simulating on a real phone or emulator (wireless debugging, LAN IP, firewall,
> install) — see [docs/RUNNING.md](docs/RUNNING.md).

## Android (Capacitor)

Capacitor is configured (`client/capacitor.config.ts`) but the native project
is generated on a machine with the Android SDK:

```bash
cd client
npm run build              # produces client/dist
npx cap add android        # one-time: creates client/android
npx cap sync android       # copy web build + plugins into the native project
# then open in Android Studio, or:
cd android && ./gradlew assembleDebug   # outputs a debug APK
```

The client reads the server URL from `VITE_SERVER_URL`; for a real device this
must be a reachable `https://` / `wss://` URL, not `localhost`.

## `@hosn-obe/shared`

Pure, dependency-free primitives shared between the server and client:

- `buildDeck()`, `shuffle(arr, rng?)` — 32-card deck and Fisher–Yates shuffle.
- `handScore(cards)` — best single-suit total, or 33 (three Aces) / 30.5 (triple).
- `isInstantWin(cards)` — true on a 31 ("fire") or three Aces.
- Socket contracts (`ClientToServerEvents`, `ServerToClientEvents`, `RoomState`, …).

```ts
import { buildDeck, shuffle, handScore, isInstantWin } from "@hosn-obe/shared";
```