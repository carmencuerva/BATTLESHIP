// Everything the parrot says, in one table: change the pirate wording here and only here.
// The parrot speaks rarely: when a ship goes down, when the battle starts and when it ends.
// It says nothing on water or on a plain hit (the board's effects show those).
//
// Keys ending in _one / _other are plural forms, picked by the language's own rules
// (see pluralCategory in i18n.js). {n} is the number of enemy ships still afloat.

import { pluralCategory } from "./i18n.js";

export const PARROT_LINES = {
  es: {
    sunk_left_one: "¡Hundido! Queda {n} barco por hundir.",
    sunk_left_other: "¡Hundido! Quedan {n} barcos por hundir.",
    start: "¡Leven anclas! ¡A por ellos!",
    victory: "¡Victoria! ¡Pieza de ocho, pieza de ocho!",
    defeat: "¡Arr! Nos vamos a pique…",
  },
  en: {
    sunk_left_one: "Sunk! {n} ship left to sink.",
    sunk_left_other: "Sunk! {n} ships left to sink.",
    start: "Weigh anchor! At 'em!",
    victory: "Victory! Pieces of eight, pieces of eight!",
    defeat: "Arr! Down we go…",
  },
};

function line(lang, key, vars = {}) {
  const table = PARROT_LINES[lang] ?? PARROT_LINES.en;
  const text = table[key] ?? PARROT_LINES.en[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

// What the parrot says after a shot: only on a sink, with the enemy ships still afloat
// (`afloat`, as counted by the engine). The last sink gives way to the end-of-game line,
// so it returns null then, as it does for water and plain hits.
export function lineForShot(outcome, afloat, lang) {
  if (outcome !== "sunk" || afloat <= 0) return null;
  return line(lang, `sunk_left_${pluralCategory(afloat, lang) === "one" ? "one" : "other"}`, { n: afloat });
}

export function lineForStart(lang) {
  return line(lang, "start");
}

// "victory" or "defeat", from the point of view of the player the screen belongs to.
export function lineForEnd(kind, lang) {
  return line(lang, kind === "defeat" ? "defeat" : "victory");
}
