import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_COLUMNS, columnLabel, parseCoord, rowLabel, toCoord } from "../../web/js/coords.js";

test("engine cells map to board-game coordinates", () => {
  assert.equal(toCoord(0, 0), "A1");
  assert.equal(toCoord(6, 2), "C7");
  assert.equal(toCoord(9, 9), "J10");
  assert.equal(toCoord(14, 25), "Z15");
  assert.equal(columnLabel(25), "Z");
  assert.equal(rowLabel(0), "1");
});

test("coordinates map back to engine cells", () => {
  assert.deepEqual(parseCoord("A1"), [0, 0]);
  assert.deepEqual(parseCoord("C7"), [6, 2]);
  assert.deepEqual(parseCoord(" c 7 "), [6, 2]);
  assert.deepEqual(parseCoord("J10"), [9, 9]);
});

test("every cell of the largest board round-trips", () => {
  for (let r = 0; r < MAX_COLUMNS; r++) {
    for (let c = 0; c < MAX_COLUMNS; c++) assert.deepEqual(parseCoord(toCoord(r, c), MAX_COLUMNS), [r, c]);
  }
});

test("anything else is rejected", () => {
  for (const bad of ["", "7C", "A0", "A01", "AA1", "1", "C", "C-7", "Ñ3", null, undefined]) {
    assert.equal(parseCoord(bad), null, String(bad));
  }
  assert.equal(parseCoord("K1", 10), null); // column off a 10x10 board
  assert.equal(parseCoord("A11", 10), null); // row off a 10x10 board
  assert.deepEqual(parseCoord("J10", 10), [9, 9]);
  assert.throws(() => columnLabel(MAX_COLUMNS), RangeError);
  assert.throws(() => toCoord(0, -1), RangeError);
  assert.throws(() => rowLabel(1.5), RangeError);
});
