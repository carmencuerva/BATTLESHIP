import assert from "node:assert/strict";
import { test } from "node:test";

import { pluralCategory } from "../../web/js/i18n.js";
import { PARROT_LINES, lineForEnd, lineForLoss, lineForShot, lineForTurn, numberWord } from "../../web/js/parrot-lines.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("the parrot says nothing on water or on a plain hit", () => {
  for (const lang of ["es", "en"]) {
    for (const afloat of [0, 1, 2, 5]) {
      assert.equal(lineForShot("miss", afloat, lang), null);
      assert.equal(lineForShot("hit", afloat, lang), null);
    }
  }
});

test("on your sink it counts the enemy ships left, in words and with the right plural", () => {
  const who = "capitán";
  assert.equal(lineForShot("sunk", 3, "es", { who }), "¡Tocado y hundido! ¡Te quedan tres barcos por hundir!");
  assert.equal(lineForShot("sunk", 1, "es", { who, k: 1 }), "¡Otro al fondo! ¡Solo queda uno, capitán!");
  assert.equal(lineForShot("sunk", 4, "en", { who: "captain" }), "Hit and sunk! Four ships left to sink!");
  assert.equal(lineForShot("sunk", 12, "es"), "¡Tocado y hundido! ¡Te quedan 12 barcos por hundir!");
});

test("when the enemy sinks one of yours it says it is from your fleet", () => {
  const line = lineForLoss(2, "es", { who: "Ana" });
  assert.match(line, /tus barcos/);
  assert.match(line, /dos barcos a flote/);
  assert.match(lineForLoss(1, "es", { who: "Ana", k: 1 }), /tu flota.*Solo te queda un barco, Ana!/);
  assert.match(lineForLoss(3, "en"), /your ships.*Three ships still afloat|your ships.*You have three ships still afloat/);
  assert.equal(lineForLoss(0, "es"), null); // the end-of-game line says it then
});

test("a short call when your turn starts, in several wordings", () => {
  assert.equal(lineForTurn("es", { who: "capitán" }), "¡Tu turno, capitán!");
  const wordings = new Set([0, 1, 2, 3, 4].map((k) => lineForTurn("es", { who: "x", k })));
  assert.ok(wordings.size >= 3);
  assert.equal(lineForTurn("en", { who: "captain", k: 4 }), lineForTurn("en", { who: "captain", k: 0 }));
});

test("the last sink gives way to the end-of-game line", () => {
  assert.equal(lineForShot("sunk", 0, "es"), null);
  assert.equal(lineForShot("sunk", 0, "en"), null);
  assert.match(lineForEnd("victory", "es"), /Victoria/);
  assert.match(lineForEnd("defeat", "es"), /pique/);
  assert.match(lineForEnd("victory", "en"), /Victory/);
  assert.match(lineForEnd("defeat", "en"), /Down we go/);
});

test("numbers in words", () => {
  assert.equal(numberWord(3, "es"), "tres");
  assert.equal(numberWord(1, "en"), "one");
  assert.equal(numberWord(11, "es"), "11");
});

test("PARROT_LINES has the same lines and placeholders in both languages", () => {
  assert.deepEqual(Object.keys(PARROT_LINES.es).sort(), Object.keys(PARROT_LINES.en).sort());
  for (const [key, text] of Object.entries(PARROT_LINES.en)) {
    const es = PARROT_LINES.es[key];
    assert.equal(Array.isArray(es), Array.isArray(text), key);
    const all = (x) => (Array.isArray(x) ? x : [x]);
    assert.deepEqual([...new Set(all(es).flatMap(placeholders))].sort(), [...new Set(all(text).flatMap(placeholders))].sort(), key);
  }
});

test("plural categories follow each language", () => {
  assert.equal(pluralCategory(1, "es"), "one");
  assert.equal(pluralCategory(2, "es"), "other");
  assert.equal(pluralCategory(0, "en"), "other");
  assert.equal(pluralCategory(1, "en"), "one");
});
