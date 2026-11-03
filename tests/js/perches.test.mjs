import assert from "node:assert/strict";
import { test } from "node:test";

import { PLACEMENTS, bubbleBox, candidates, chooseSpeakingSpot, choosePerch, inside, overlaps, rect } from "../../web/js/perches.js";

const view = { width: 1360, height: 900 };
const size = { width: 110, height: 138 };
// A desktop game: header buttons, two boards, the controls bar below.
const header = rect(0, 0, 1360, 64);
const left = rect(120, 180, 410, 410);
const right = rect(830, 180, 410, 410);
const controls = rect(230, 630, 900, 60);
const obstacles = [header, left, right, controls];

test("rectangles: overlap and containment", () => {
  assert.ok(overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10)));
  assert.ok(!overlaps(rect(0, 0, 10, 10), rect(20, 0, 10, 10)));
  assert.ok(overlaps(rect(0, 0, 10, 10), rect(14, 0, 10, 10), 5)); // within the padding
  assert.ok(inside(rect(10, 10, 100, 100), view, 8));
  assert.ok(!inside(rect(1300, 10, 100, 100), view, 8));
});

test("a quiet perch is free, on screen and near the last shot", () => {
  const shot = { x: 1200, y: 560 }; // bottom-right of the right board
  const perch = choosePerch(candidates("edges", view, size), { view, obstacles, focus: shot });
  assert.ok(inside(perch, view, 8));
  for (const o of obstacles) assert.ok(!overlaps(perch, o, 6), "covers nothing");
  assert.ok(perch.left > view.width / 2, "on the side of the shot");
});

test("to speak it finds a spot where neither the parrot nor its bubble cover anything", () => {
  // The real desktop layout: only ~170 px free on each side of the boards.
  const layout = [
    header,
    rect(172, 183, 422, 422), // left board
    rect(767, 183, 422, 422), // right board
    rect(335, 112, 95, 60), // left name and hat
    rect(920, 112, 115, 60), // right name
    rect(200, 615, 360, 20), // ships afloat
    rect(800, 615, 360, 20),
    rect(230, 655, 900, 58), // controls
    rect(230, 724, 900, 36), // ship's log
  ];
  const bubble = { width: 250, height: 80 };
  const watched = layout[2];
  const spots = [...candidates("around", view, size, { board: watched }), ...candidates("edges", view, size)];
  const { perch, placement } = chooseSpeakingSpot(spots, { view, obstacles: layout, focus: { x: 978, y: 394 }, bubble });
  const box = bubbleBox(perch, bubble, placement);
  for (const o of layout) {
    assert.ok(!overlaps(perch, o, 6), "the parrot covers nothing");
    assert.ok(!overlaps(box, o, 6), "its bubble covers nothing");
  }
  assert.ok(inside(perch, view, 8) && inside(box, view, 4));
});

test("bubble boxes sit where style.css draws them", () => {
  const perch = rect(500, 400, 110, 138);
  const bubble = { width: 200, height: 80 };
  const at = (side, vertical) => bubbleBox(perch, bubble, { side, vertical });
  assert.equal(at("right", "above").bottom, perch.top - 4);
  assert.equal(at("left", "below").top, perch.bottom + 26);
  assert.equal(at("right", "middle").left, perch.right + 14);
  assert.equal(at("left", "middle").right, perch.left - 14);
  assert.equal(PLACEMENTS.length, 6);
});

test("on a phone it sits along the top, never over the boards", () => {
  const phone = { width: 390, height: 844 };
  const small = { width: 64, height: 80 };
  const board = rect(20, 260, 350, 350);
  const perch = choosePerch(candidates("top", phone, small), { view: phone, obstacles: [board], focus: { x: 195, y: 0 } });
  assert.ok(perch.bottom <= board.top - 6 && inside(perch, phone, 8));
});

test("when nothing is free it still stays on screen", () => {
  const everything = [rect(0, 0, 1360, 900)];
  const perch = choosePerch(candidates("edges", view, size), { view, obstacles: everything });
  assert.ok(inside(perch, view, 8));
});
