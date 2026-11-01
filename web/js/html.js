// HTML escaping shared by every screen: all text that came from Python or the user goes
// through esc() (or th(), which escapes the variables of a translated string).

import { t } from "./i18n.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// t() with every variable HTML-escaped, for use inside innerHTML.
export function th(key, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  return t(key, safe);
}
