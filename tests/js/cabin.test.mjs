import assert from "node:assert/strict";
import { test } from "node:test";

import { MINIATURES, chartSvg, sceneSvg } from "../../web/js/cabin-art.js";
import {
  CHART,
  DESTINATIONS,
  FLEET_MAX,
  HOME,
  LAYOUTS,
  SHIP_MAX,
  addShip,
  alongY,
  changeLength,
  chartQuad,
  chooseLayout,
  dangerLevels,
  depthScale,
  destinationPoint,
  fitScene,
  parseFleet,
  project,
  propPoint,
  quadTransform,
  removeShip,
  routePath,
  tableQuad,
} from "../../web/js/cabin.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const inside = (p, quad) => {
  // the quads are convex and listed clockwise on screen: p is on the inner side of each edge
  return quad.every((a, i) => {
    const b = quad[(i + 1) % quad.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-6;
  });
};

test("every mode has a destination on the chart, with its own miniature", () => {
  for (const mode of ["hvb", "bvb", "hvh"]) {
    const d = DESTINATIONS[mode];
    assert.ok(d.x > 0 && d.x < CHART.width && d.y > 0 && d.y < CHART.height, mode);
    assert.match(MINIATURES[mode], /<svg/);
    for (const layout of ["wide", "tall"]) assert.ok(inside(destinationPoint(layout, mode), chartQuad(layout)), `${mode} ${layout}`);
  }
});

test("the course runs from our ship to the chosen destination", () => {
  const d = DESTINATIONS.hvb;
  const course = routePath("hvb");
  assert.ok(course.startsWith(`M${HOME.x} ${HOME.y} Q`));
  assert.ok(course.endsWith(`${d.x} ${d.y}`));
  assert.equal(routePath("nope"), "");
  assert.match(chartSvg("bvb"), /class="course"/);
  assert.doesNotMatch(chartSvg("nope"), /class="course"/);
});

test("the chart lies on the table, in the table's perspective", () => {
  for (const layout of ["wide", "tall"]) {
    const { vp } = LAYOUTS[layout];
    const table = tableQuad(layout);
    const chart = chartQuad(layout);
    for (const corner of chart) assert.ok(inside(corner, table), layout);
    // its side edges run to the vanishing point
    const back = alongY(vp, chart[3], chart[0].y);
    assert.ok(near(back.x, chart[0].x), layout);
    // farther away looks smaller
    assert.ok(depthScale(layout, chart[0].y) < depthScale(layout, chart[3].y));
  }
});

test("the perspective mapping sends the paper's corners to the quad's corners", () => {
  const quad = chartQuad("wide");
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  corners.forEach(([u, v], i) => {
    const p = project(quad, u, v);
    assert.ok(near(p.x, quad[i].x, 1e-6) && near(p.y, quad[i].y, 1e-6), `corner ${i}`);
  });
  assert.match(quadTransform(1600, 920, quad), /^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/);
});

test("the room always fits its safe area and sits on the bottom edge", () => {
  for (const [w, h] of [
    [1360, 840],
    [1920, 1000],
    [820, 1100],
    [390, 760],
    [844, 340],
  ]) {
    const layout = chooseLayout(w, h);
    const { safe, size } = LAYOUTS[layout];
    const { k, x, y } = fitScene(layout, w, h);
    assert.ok(x + safe.x * k >= -0.5 && x + (safe.x + safe.w) * k <= w + 0.5, `${w}x${h} across`);
    assert.ok(y + safe.y * k >= -0.5 && near(y + size.h * k, h), `${w}x${h} down`);
  }
  assert.equal(chooseLayout(390, 760), "tall");
  assert.equal(chooseLayout(1360, 840), "wide");
});

test("every object stands on the table, inside the scene", () => {
  for (const layout of ["wide", "tall"]) {
    const { safe } = LAYOUTS[layout];
    for (const name of Object.keys(LAYOUTS[layout].props)) {
      const p = propPoint(layout, name);
      assert.ok(inside(p, tableQuad(layout)), `${layout} ${name} on the table`);
      assert.ok(p.x - p.w / 2 >= safe.x - 1 && p.x + p.w / 2 <= safe.x + safe.w + 1, `${layout} ${name} in view`);
    }
  }
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
