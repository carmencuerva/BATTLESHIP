import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHART,
  DESTINATIONS,
  DESTINATION_ART,
  FLEET_MAX,
  HOME,
  SHIP_MAX,
  addShip,
  changeLength,
  chartSvg,
  dangerLevels,
  destinationSpot,
  parseFleet,
  removeShip,
  routePath,
} from "../../web/js/cabin.js";

test("every mode has a destination on the chart, with its own picture", () => {
  for (const mode of ["hvb", "bvb", "hvh"]) {
    const d = DESTINATIONS[mode];
    assert.ok(d.x > 0 && d.x < CHART.width && d.y > 0 && d.y < CHART.height, mode);
    assert.match(DESTINATION_ART[mode], /<svg/);
    const spot = destinationSpot(mode);
    assert.ok(spot.left > 0 && spot.left < 100 && spot.top > 0 && spot.top < 100);
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
