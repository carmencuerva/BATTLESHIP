import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPASS, DIVIDERS, LOGBOOK, MINIATURES, MODELS, SPYGLASS, sceneSvg } from "../../web/js/cabin-art.js";
import {
  FLEET_MAX,
  LAYOUTS,
  SHIP_MAX,
  addShip,
  alongY,
  changeLength,
  chooseLayout,
  coverScene,
  dangerLevels,
  depthScale,
  parseFleet,
  removeShip,
  tableQuad,
} from "../../web/js/cabin.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("every battle has its own miniature, and every setting its object", () => {
  for (const mode of ["hvb", "bvb", "hvh"]) assert.match(MINIATURES[mode], /<svg/, mode);
  for (const art of [MODELS, DIVIDERS, COMPASS, SPYGLASS, LOGBOOK]) assert.match(art, /^<svg/);
});

test("the table is drawn in the room's perspective", () => {
  for (const layout of ["wide", "tall"]) {
    const { vp } = LAYOUTS[layout];
    const [bl, br, fr, fl] = tableQuad(layout);
    // its sides run to the vanishing point, and the far edge is narrower
    assert.ok(near(alongY(vp, fl, bl.y).x, bl.x) && near(alongY(vp, fr, br.y).x, br.x), layout);
    assert.ok(br.x - bl.x < fr.x - fl.x, layout);
    assert.ok(depthScale(layout, bl.y) < depthScale(layout, fl.y));
  }
});

test("the room covers any screen, with no empty edges", () => {
  for (const [w, h] of [
    [1360, 840],
    [1920, 1000],
    [820, 1100],
    [390, 760],
    [844, 340],
  ]) {
    const layout = chooseLayout(w, h);
    const { size } = LAYOUTS[layout];
    const { k, x, y } = coverScene(layout, w, h);
    assert.ok(x <= 0.5 && x + size.w * k >= w - 0.5, `${w}x${h} across`);
    assert.ok(y <= 0.5 && y + size.h * k >= h - 0.5, `${w}x${h} down`);
  }
  assert.equal(chooseLayout(390, 760), "tall");
  assert.equal(chooseLayout(1360, 840), "wide");
});

test("the room picture is the same on every visit and draws no text", () => {
  for (const layout of ["wide", "tall"]) {
    const svg = sceneSvg(layout);
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
    assert.equal(svg, sceneSvg(layout));
    assert.doesNotMatch(svg, /<text/);
  }
});

test("ship models: longer, shorter, add and remove within limits", () => {
  assert.deepEqual(changeLength([5, 4, 3], 1, 1), [5, 5, 3]);
  assert.deepEqual(changeLength([SHIP_MAX], 0, 1), [SHIP_MAX]);
  assert.deepEqual(changeLength([1], 0, -1), [1]);
  assert.deepEqual(removeShip([5, 4, 3], 0), [4, 3]);
  assert.deepEqual(removeShip([2], 0), [2], "a fleet keeps at least one ship");
  assert.deepEqual(addShip([5]), [5, 2]);
  assert.equal(addShip(Array(FLEET_MAX).fill(2)).length, FLEET_MAX);
  const fleet = [5, 4];
  changeLength(fleet, 0, -1);
  assert.deepEqual(fleet, [5, 4], "never changes its argument");
});

test("a typed fleet is read as whole numbers", () => {
  assert.deepEqual(parseFleet("5, 4,3,3 ,2"), [5, 4, 3, 3, 2]);
  assert.equal(parseFleet("5,x"), null);
  assert.equal(parseFleet(""), null);
  assert.equal(parseFleet("4.5"), null);
});

test("danger follows the official ranking", () => {
  const standings = [
    { name: "hard", elo: 1735 },
    { name: "lucia", elo: 1733 },
    { name: "medium", elo: 1532 },
    { name: "easy", elo: 1384 },
    { name: "random", elo: 1115 },
  ];
  const names = ["random", "easy", "medium", "hard", "lucia"];
  assert.deepEqual(dangerLevels(standings, names), { hard: 5, lucia: 4, medium: 3, easy: 2, random: 1 });
  assert.deepEqual(dangerLevels(null, names), {});
  assert.deepEqual(dangerLevels(standings, ["medium"]), { medium: 3 });
});
