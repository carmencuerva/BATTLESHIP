import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { renderBoard } from "../../web/js/board.js";
import { esc } from "../../web/js/html.js";
import { leaderboardHtml } from "../../web/js/leaderboard.js";

function fakeContainer() {
  return {
    classList: { add() {} },
    style: { setProperty() {} },
    innerHTML: "",
    addEventListener() {},
  };
}

const count = (html, needle) => html.split(needle).length - 1;

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
  assert.equal(count(box.innerHTML, 'class="cell'), size * size);
  assert.equal(count(box.innerHTML, " miss"), 1);
  assert.equal(count(box.innerHTML, " hit"), 1);
  assert.equal(count(box.innerHTML, " sunk"), 1);
  assert.equal(count(box.innerHTML, " clickable"), size * size - 3); // only unknown cells
  assert.equal(box.style.gridTemplateColumns, "repeat(5, var(--cell))");
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
