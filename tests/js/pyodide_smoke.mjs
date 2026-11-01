// Runs the real web bundle (web/py.zip) inside Pyodide under Node, through the same bridge
// the page uses: lists the players, plays a full bot-vs-bot game and a small tournament.
// Needs `npm install` and `python scripts/build_web.py` first. Usage: npm run smoke

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadPyodide } from "pyodide";

import { setUpArena } from "../../web/pyodide-bootstrap.js";

const zip = await readFile(new URL("../../web/py.zip", import.meta.url));
const pyodide = await loadPyodide();
const arena = await setUpArena(pyodide, zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));

const { players, rejected } = arena.call("list_players");
assert.deepEqual(rejected, []);
const names = players.map((p) => p.name);
for (const builtin of ["random", "easy", "medium", "hard"]) assert.ok(names.includes(builtin), builtin);
console.log(`players: ${names.join(", ")}`);

// One full game, driven exactly like app.js does it.
const { size, fleet } = arena.call("defaults");
const sides = ["medium", "hard"].map((name, i) => {
  const { handle } = arena.call("create_bot", name, 100 + i);
  const { placement } = arena.call("bot_placement", handle, size, fleet);
  return { name, handle, board: arena.call("new_board", size, fleet, placement), shots: 0 };
});
let attacker = 0;
let heatmaps = 0;
for (;;) {
  const defender = 1 - attacker;
  const { view } = arena.call("status", sides[defender].board);
  const move = arena.call("bot_shot", sides[attacker].handle, view);
  assert.equal(move.error, undefined, move.error);
  if (move.info?.heatmap) heatmaps += 1;
  const out = arena.call("shoot", sides[defender].board, move.shot, attacker);
  assert.equal(out.error, undefined, out.error);
  sides[defender].board = out.board;
  sides[attacker].shots += 1;
  if (out.terminal) break;
  assert.ok(sides[attacker].shots < size * size, "game did not end");
  attacker = out.next;
}
assert.ok(heatmaps > 0, "hard publishes its heat map for X-ray mode");
console.log(`game: ${sides[attacker].name} won (${sides[0].shots} + ${sides[1].shots} shots)`);

// A tiny tournament through the same functions as the Tournament screen.
const config = { players: ["random", "easy", "hard"], games_per_pair: 2, seed: 1 };
const plan = arena.call("tournament_plan", config);
assert.equal(plan.error, undefined, plan.error);
const records = plan.games.map(([i, j, spec]) =>
  arena.call("tournament_game", [plan.players[i], plan.players[j]], spec),
);
const board = arena.call("tournament_standings", config, plan.games, records);
assert.equal(board.standings.length, 3);
assert.equal(board.standings.reduce((n, row) => n + row.played, 0), 2 * plan.games.length);
console.log(`tournament: ${board.standings.map((row) => `${row.rank}. ${row.name} ${row.elo}`).join(" · ")}`);
console.log("pyodide smoke test passed");
