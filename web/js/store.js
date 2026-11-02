// Small per-browser memory (the player's names, preferences). Every access is guarded:
// localStorage may be missing, full or blocked (private windows), and the page must work
// the same without it — it just forgets.

const PREFIX = "battleship:";

export function load(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
