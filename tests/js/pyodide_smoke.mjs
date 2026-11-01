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

// A tiny championship through the same functions as the Tournament screen.
const config = {
  players: ["random", "easy", "medium", "hard"],
  format: "championship",
  games_per_pair: 2,
  knockout_games: 2,
  seed: 1,
};
const played = [];
const stages = [];
let step = arena.call("tournament_next", config, played);
assert.equal(step.error, undefined, step.error);
while (!step.done) {
  stages.push(step.stage);
  for (const [i, j, spec] of step.games) {
    played.push([i, j, spec, arena.call("tournament_game", [step.players[i], step.players[j]], spec)]);
  }
  step = arena.call("tournament_next", config, played);
}
assert.deepEqual(stages, ["league", "semifinal", "final"]);
assert.equal(played.length, step.total);
const board = arena.call("tournament_result", config, played);
assert.equal(board.standings.length, 4);
assert.equal(board.standings[0].name, board.knockout.champion);
console.log(`championship: ${board.standings.map((row) => `${row.rank}. ${row.name}`).join(" · ")}`);
console.log("pyodide smoke test passed");
