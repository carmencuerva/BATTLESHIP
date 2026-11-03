import assert from "node:assert/strict";
import { test } from "node:test";

import { pluralCategory } from "../../web/js/i18n.js";
import { PARROT_LINES, lineForEnd, lineForShot, lineForStart } from "../../web/js/parrot-lines.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("the parrot says nothing on water or on a plain hit", () => {
  for (const lang of ["es", "en"]) {
    for (const afloat of [0, 1, 2, 5]) {
      assert.equal(lineForShot("miss", afloat, lang), null);
      assert.equal(lineForShot("hit", afloat, lang), null);
    }
  }
});

test("on a sink it counts the enemy ships left, with the right plural", () => {
  assert.equal(lineForShot("sunk", 4, "es"), "¡Hundido! Quedan 4 barcos por hundir.");
  assert.equal(lineForShot("sunk", 2, "es"), "¡Hundido! Quedan 2 barcos por hundir.");
  assert.equal(lineForShot("sunk", 1, "es"), "¡Hundido! Queda 1 barco por hundir.");
  assert.equal(lineForShot("sunk", 4, "en"), "Sunk! 4 ships left to sink.");
  assert.equal(lineForShot("sunk", 1, "en"), "Sunk! 1 ship left to sink.");
});

test("the last sink gives way to the end-of-game line", () => {
  assert.equal(lineForShot("sunk", 0, "es"), null);
  assert.equal(lineForShot("sunk", 0, "en"), null);
  assert.match(lineForEnd("victory", "es"), /Victoria/);
  assert.match(lineForEnd("defeat", "es"), /pique/);
  assert.match(lineForEnd("victory", "en"), /Victory/);
  assert.match(lineForEnd("defeat", "en"), /Down we go/);
  assert.ok(lineForStart("es") && lineForStart("en"));
});

test("PARROT_LINES has the same lines and placeholders in both languages", () => {
  assert.deepEqual(Object.keys(PARROT_LINES.es).sort(), Object.keys(PARROT_LINES.en).sort());
  for (const [key, text] of Object.entries(PARROT_LINES.en)) {
    assert.deepEqual(placeholders(PARROT_LINES.es[key]), placeholders(text), key);
  }
});

test("plural categories follow each language", () => {
  assert.equal(pluralCategory(1, "es"), "one");
  assert.equal(pluralCategory(2, "es"), "other");
  assert.equal(pluralCategory(0, "en"), "other");
  assert.equal(pluralCategory(1, "en"), "one");
});
