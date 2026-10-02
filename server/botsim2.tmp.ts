import { applyAction, chooseBotAction, createGame, startRound, viewFor } from "../shared/src/index.js";
import type { BotLevel } from "../shared/src/net.js";

let hardMs = 0;
let hardCalls = 0;
let hardMax = 0;

function play(levels: BotLevel[]): number | null {
  const g = createGame(levels.map((l, i) => ({ id: `b${i}`, name: l, isBot: true, botLevel: l })));
  while (g.phase !== "gameEnd") {
    if (g.phase === "roundEnd") startRound(g);
    const seat = g.turnIdx;
    const t0 = performance.now();
    const action = chooseBotAction(viewFor(g, seat), levels[seat]);
    if (levels[seat] === "hard") {
      const dt = performance.now() - t0;
      hardMs += dt;
      hardCalls++;
      hardMax = Math.max(hardMax, dt);
      if (dt > 300) console.log("slow", dt.toFixed(0), JSON.stringify(viewFor(g, seat)).slice(0, 300));
    }
    applyAction(g, seat, action);
  }
  return g.winnerIdx;
}

const N = Number(process.env.N ?? 1000);
const matchups: BotLevel[][] = (process.env.M ?? "normal,hard;normal,hard,normal,hard")
  .split(";")
  .map((m) => m.split(",") as BotLevel[]);
for (const m of matchups) {
  const wins = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const shift = i % m.length;
    const seated = [...m.slice(shift), ...m.slice(0, shift)];
    const w = play(seated);
    const k = w === null ? "draw" : seated[w]!;
    wins.set(k, (wins.get(k) ?? 0) + 1);
  }
  console.log(m.join(" v "), Object.fromEntries([...wins].map(([k, v]) => [k, `${((v / N) * 100).toFixed(1)}%`])));
}
if (hardCalls) console.log(`hard: avg ${(hardMs / hardCalls).toFixed(2)}ms, max ${hardMax.toFixed(1)}ms`);
