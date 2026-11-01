import assert from "node:assert/strict";
import { test } from "node:test";

import { STRINGS, t } from "../../web/js/i18n.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("English and Spanish define the same keys", () => {
  assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort());
});

test("translations use the same placeholders", () => {
  for (const [key, text] of Object.entries(STRINGS.en)) {
    assert.deepEqual(placeholders(STRINGS.es[key]), placeholders(text), key);
  }
});

test("t() fills placeholders and falls back to the key", () => {
  assert.equal(t("winner", { name: "hard" }), STRINGS.en.winner.replace("{name}", "hard"));
  assert.equal(t("no_such_key"), "no_such_key");
  assert.match(t("winner"), /\{name\}/); // a missing variable stays visible
});
