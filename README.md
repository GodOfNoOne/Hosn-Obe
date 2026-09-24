# Hosn Obe

A multiplayer card game (Schwimmen / 31 variant) — room-based online play with an
optional bot per seat, delivered as an Android app backed by an authoritative
game server.

See [MULTIPLAYER_PLAN.md](MULTIPLAYER_PLAN.md) for the full architecture and roadmap.

## Monorepo layout

```
Hosn-Obe/
├─ shared/        # framework-agnostic game logic (deck, scoring, types) + tests
├─ prototype/     # original single-file prototype (schwimmen.html) for reference
└─ MULTIPLAYER_PLAN.md
```

`server/` (Express + Socket.IO) and `client/` (React + Vite, wrapped by
Capacitor) will be added in later phases per the plan.

## Requirements

- Node.js >= 20 (developed on Node 24)
- npm >= 10 (uses npm workspaces)

## Getting started

```bash
npm install        # install all workspace deps
npm test           # run unit tests across workspaces
npm run build      # compile the shared package to dist/
```

## `@hosn-obe/shared`

Pure, dependency-free game primitives shared between the server and client:

- `buildDeck()`, `shuffle(arr, rng?)` — 32-card deck and Fisher–Yates shuffle.
- `handScore(cards)` — best single-suit total, or 33 (three Aces) / 30.5 (triple).
- `isInstantWin(cards)` — true on a 31 ("fire") or three Aces.

```ts
import { buildDeck, shuffle, handScore, isInstantWin } from "@hosn-obe/shared";
```