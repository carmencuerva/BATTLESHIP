// Everything the parrot says, in one table: change the pirate wording here and only here.
// The parrot speaks only at a few moments: when your turn starts, when you sink an enemy
// ship (saying how many are left), when the enemy sinks one of yours (saying it is from
// your fleet), and at the end. It says nothing on water or on a plain hit.
//
// A line can have several wordings (a list): `k` picks one, so it does not repeat itself.
// Keys ending in _one / _other are plural forms, picked by the language's own rules (see
// pluralCategory in i18n.js). {who} is how it calls the player ("capitán", "Ana"…), {count}
// is a number written in words ("tres").

import { pluralCategory } from "./i18n.js";

export const PARROT_LINES = {
  es: {
    turn: ["¡Tu turno, {who}!", "¡A los cañones, {who}!", "¡Fuego a discreción, {who}!", "¡Te toca, {who}! ¡Apunta bien!"],
    sunk: ["¡Tocado y hundido!", "¡Otro al fondo!", "¡A pique! ¡Bien hecho!", "¡Al fondo del mar!"],
    sunk_left_one: "¡Solo queda uno, {who}!",
    sunk_left_other: "¡Te quedan {count} barcos por hundir!",
    lost: ["¡Ay, ay, ay! ¡Han hundido uno de tus barcos!", "¡Rayos! ¡Nos han hundido un barco de tu flota!", "¡Cuidado! ¡Han echado a pique uno de los tuyos!"],
    lost_left_one: "¡Solo te queda un barco, {who}!",
    lost_left_other: "Te quedan {count} barcos a flote.",
    victory: "¡Victoria! ¡Pieza de ocho, pieza de ocho!",
    defeat: "¡Arr! Nos vamos a pique…",
  },
  en: {
    turn: ["Your turn, {who}!", "To the cannons, {who}!", "Fire at will, {who}!", "Your go, {who}! Aim true!"],
    sunk: ["Hit and sunk!", "Another one down!", "Down she goes! Well done!", "To the bottom of the sea!"],
    sunk_left_one: "Only one left, {who}!",
    sunk_left_other: "{count} ships left to sink!",
    lost: ["Oh no, no, no! They sank one of your ships!", "Blast it! One ship of your fleet is gone!", "Look out! They sent one of ours to the bottom!"],
    lost_left_one: "You have just one ship left, {who}!",
    lost_left_other: "You have {count} ships still afloat.",
    victory: "Victory! Pieces of eight, pieces of eight!",
    defeat: "Arr! Down we go…",
  },
};

const NUMBERS = {
  es: ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"],
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"],
};

// "tres" / "three"; bigger numbers stay as digits.
export function numberWord(n, lang) {
  return (NUMBERS[lang] ?? NUMBERS.en)[n] ?? String(n);
}

function line(lang, key, vars = {}, k = 0) {
  const table = PARROT_LINES[lang] ?? PARROT_LINES.en;
  const entry = table[key] ?? PARROT_LINES.en[key];
  const text = Array.isArray(entry) ? entry[((k % entry.length) + entry.length) % entry.length] : entry;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

const plural = (n, lang) => (pluralCategory(n, lang) === "one" ? "one" : "other");

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function counted(lang, key, n, who) {
  const text = line(lang, `${key}_${plural(n, lang)}`, { who, count: numberWord(n, lang) });
  // "¡Te quedan tres…" is fine, but "Three ships left…" must start with a capital.
  return capitalise(text);
}

// After your shot: only on a sink, with the enemy ships still afloat (`afloat`, as the
// engine counts them). The last sink gives way to the end-of-game line, so it returns null
// then, as it does for water and plain hits.
export function lineForShot(outcome, afloat, lang, { who = "", k = 0 } = {}) {
  if (outcome !== "sunk" || afloat <= 0) return null;
  return `${line(lang, "sunk", {}, k)} ${counted(lang, "sunk_left", afloat, who)}`;
}

// When the enemy sinks one of your ships; `afloat` is how many of yours are left.
export function lineForLoss(afloat, lang, { who = "", k = 0 } = {}) {
  if (afloat <= 0) return null;
  return `${line(lang, "lost", {}, k)} ${counted(lang, "lost_left", afloat, who)}`;
}

// A short call when your turn starts.
export function lineForTurn(lang, { who = "", k = 0 } = {}) {
  return line(lang, "turn", { who }, k);
}

// "victory" or "defeat", from the point of view of the player the screen belongs to.
export function lineForEnd(kind, lang) {
  return line(lang, kind === "defeat" ? "defeat" : "victory");
}
