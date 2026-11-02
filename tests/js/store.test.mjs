import assert from "node:assert/strict";
import { test } from "node:test";

import { load, save } from "../../web/js/store.js";

function withStorage(storage, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved);
    else delete globalThis.localStorage;
  }
}

test("values round-trip through localStorage under a prefix", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  withStorage(storage, () => {
    assert.equal(save("name", "Ana"), true);
    assert.equal(load("name", ""), "Ana");
    assert.deepEqual((save("hotseat", ["Ana", "Carmen"]), load("hotseat", [])), ["Ana", "Carmen"]);
    assert.ok([...data.keys()].every((k) => k.startsWith("battleship:")));
  });
});

test("a missing, broken or full storage never throws", () => {
  withStorage(undefined, () => {
    assert.equal(load("name", "fallback"), "fallback");
    assert.equal(save("name", "x"), false);
  });
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  withStorage(broken, () => {
    assert.equal(load("name", "fallback"), "fallback");
    assert.equal(save("name", "x"), false);
  });
  withStorage({ getItem: () => "{not json", setItem() {} }, () => {
    assert.deepEqual(load("forms", {}), {});
  });
});
