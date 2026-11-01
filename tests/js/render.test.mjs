import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { renderBoard } from "../../web/js/board.js";
import { esc } from "../../web/js/html.js";
import { leaderboardHtml } from "../../web/js/leaderboard.js";

function fakeContainer() {
  return {
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} },
    innerHTML: "",
    addEventListener() {},
  };
}

const count = (html, needle) => html.split(needle).length - 1;
const cellCount = (html) => count(html, 'class="cell ') + count(html, 'class="cell"');

test("esc() neutralises HTML", () => {
  assert.equal(esc(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
});

test("renderBoard draws size² cells with their states", () => {
  const size = 4;
  const cells = Array.from({ length: size }, () => Array(size).fill(0));
  cells[0][0] = 1; // miss
  cells[1][1] = 2; // hit
  cells[2][2] = 3; // sunk
  const box = fakeContainer();
  renderBoard(box, { size, view: { size, cells, remaining: [2] }, clickable: true });
  assert.equal(cellCount(box.innerHTML), size * size);
  assert.equal(count(box.innerHTML, "cell miss"), 1);
  assert.equal(count(box.innerHTML, "cell hit"), 1);
  assert.equal(count(box.innerHTML, "cell sunk"), 1);
  assert.equal(count(box.innerHTML, 'class="flame"'), 1); // fire only where a ship is hit
  assert.equal(count(box.innerHTML, " clickable"), size * size - 3); // only unknown cells
  assert.match(box.innerHTML, /grid-template-columns:repeat\(4, var\(--cell\)\)/);
  assert.doesNotMatch(box.innerHTML, /class="label"/); // no coordinates on the board
});

test("ships are drawn whole, sunk ones marked, the fresh sink animated", () => {
  const size = 5;
  const cells = Array.from({ length: size }, () => Array(size).fill(0));
  cells[0][0] = 3;
  cells[0][1] = 3; // a sunk 2-ship
  cells[2][4] = 2; // a hit on a vertical 3-ship
  const fleet = [
    [[0, 0], [0, 1]],
    [[2, 4], [3, 4], [4, 4]],
  ];
  const box = fakeContainer();
  renderBoard(box, { size, view: { size, cells, remaining: [3] }, fleet, fresh: { cell: [0, 1], outcome: "sunk" } });
  assert.equal(count(box.innerHTML, 'class="ship '), 2);
  assert.match(box.innerHTML, /ship horizontal sunk sinking" style="grid-row:1;grid-column:1 \/ span 2"/);
  assert.match(box.innerHTML, /ship vertical afloat" style="grid-row:3 \/ span 3;grid-column:5"/);

  // The enemy board shows only sunk ships, never the others.
  const enemy = fakeContainer();
  renderBoard(enemy, { size, view: { size, cells, remaining: [3] }, sunk: [fleet[0]], crosshair: true, clickable: true });
  assert.equal(count(enemy.innerHTML, 'class="ship '), 1);
  assert.match(enemy.innerHTML, /class="crosshair"/);
});

test("renderBoard shades a heat map only on unknown cells", () => {
  const size = 3;
  const cells = Array.from({ length: size }, () => Array(size).fill(0));
  cells[0][0] = 1;
  const heat = [
    [0, 1, 2],
    [0, 4, 0],
    [0, 0, 8],
  ];
  const box = fakeContainer();
  renderBoard(box, { size, view: { size, cells, remaining: [] }, heat });
  assert.equal(count(box.innerHTML, " heat"), size * size - 1);
  assert.match(box.innerHTML, /--heat:1\.000/); // the hottest cell
  assert.match(box.innerHTML, /--heat:0\.500/); // half as hot
});

test("the committed leaderboard renders every player, escaped", async () => {
  const lb = JSON.parse(await readFile(new URL("../../results/leaderboard.json", import.meta.url), "utf8"));
  const html = leaderboardHtml(lb);
  for (const row of lb.standings) assert.ok(html.includes(esc(row.name)), row.name);
  assert.equal(count(html, "<tr>"), lb.standings.length + 1 + lb.standings.length + 1);

  const evil = structuredClone(lb);
  evil.standings[0].name = "<script>x</script>";
  assert.ok(!leaderboardHtml(evil).includes("<script>"));
});
