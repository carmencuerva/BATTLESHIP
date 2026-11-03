// Screens and turn orchestration. Rules, legality and bots all run in Python (webglue);
// this file only decides what to draw and when to ask Python for the next move.

import { startArena } from "../pyodide-bootstrap.js";
import { cellRect, coord, lockBoard, renderBoard, UNKNOWN } from "./board.js";
import { COMPASS, DIVIDERS, LOGBOOK, MINIATURES, MODELS, POSTER, SEA, SPYGLASS, chartSvg, lanternSvg, sceneSvg } from "./cabin-art.js";
import {
  addShip,
  changeLength,
  chartQuad,
  chooseLayout,
  dangerLevels,
  DESTINATIONS,
  destinationPoint,
  FLEET_MAX,
  fitScene,
  LAYOUTS,
  LOGO,
  parseFleet,
  propPoint,
  quadTransform,
  removeShip,
  SPEAKER_OFF,
  SPEAKER_ON,
} from "./cabin.js";
import { MAX_COLUMNS } from "./coords.js";
import { closeEndScreen, showEndScreen } from "./endscreen.js";
import { bubbles, explode, launchMissile, splash } from "./fx.js";
import { esc, th } from "./html.js";
import { getLang, setLang, t, tn } from "./i18n.js";
import { leaderboardHtml, stageName } from "./leaderboard.js";
import { createParrot, PARROT_SVG } from "./parrot.js";
import { lineForEnd, lineForLoss, lineForShot, lineForTurn } from "./parrot-lines.js";
import { miniShip } from "./ships.js";
import { setMusic, updateMusic } from "./music.js";
import { getLevel, isMuted, setLevel, setMuted, sfx } from "./sound.js";
import { load, save } from "./store.js";

const app = document.getElementById("app");
const SPEEDS = { slow: 900, normal: 400, fast: 60 };

let arena = null;
let players = [];
let current = () => {}; // re-renders the visible screen (e.g. after a language change)
let keyHandler = null;
let screen = 0; // bumped by show(); long jobs stop when the screen they started on is gone
let match = null;
let tour = null; // state of the tournament screen
let ranking = null; // {status: "loading" | "ok" | "missing", data}
const settings = {
  mode: "hvb",
  opponent: "hard",
  botA: "medium",
  botB: "hard",
  // Names are remembered between visits (store.js forgets quietly if storage is blocked).
  nameMe: load("name", ""),
  nameA: load("hotseat", ["", ""])[0] ?? "",
  nameB: load("hotseat", ["", ""])[1] ?? "",
  // How to be addressed once promoted ("m": capitán, "f": capitana); Spanish only.
  forms: { me: "m", a: "m", b: "m", ...load("forms", {}) },
  size: 10,
  fleet: [5, 4, 3, 3, 2],
  speed: "normal",
};

// --- helpers ---------------------------------------------------------------------------

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function playerByName(name) {
  return players.find((p) => p.name === name);
}

function show(render) {
  screen += 1;
  current = render;
  keyHandler = null;
  document.body.classList.toggle("in-cabin", render === menuScreen); // the cabin fills the screen
  // the shanty everywhere except during a battle and at its end (see gameScreen, finishGame)
  if (!match || match.attacker == null) setMusic("shanty");
  render();
  scrollTo(0, 0); // a new screen starts at its top, not where the last one was scrolled to
}

document.addEventListener("keydown", (event) => keyHandler?.(event));

// --- header ----------------------------------------------------------------------------

const NAV = {
  "nav-play": ["nav_play", () => menuScreen],
  "nav-tournament": ["nav_tournament", () => tournamentScreen],
  "nav-ranking": ["nav_ranking", () => rankingScreen],
  "nav-about": ["nav_about", () => aboutScreen],
};

function renderHeader() {
  for (const [id, [key]] of Object.entries(NAV)) document.getElementById(id).textContent = t(key);
  document.getElementById("lang").textContent = getLang() === "es" ? "EN" : "ES";
  const sound = document.getElementById("sound");
  sound.innerHTML = isMuted() ? SPEAKER_OFF : SPEAKER_ON;
  sound.title = t(isMuted() ? "sound_on" : "sound_off");
  sound.setAttribute("aria-label", sound.title);
  sound.setAttribute("aria-pressed", String(!isMuted()));
  sound.classList.toggle("muted-hint", isMuted()); // a little note pulses: sound is off
  const levels = document.getElementById("levels");
  levels.title = t("levels_title");
  levels.setAttribute("aria-label", levels.title);
  document.getElementById("level-music-label").textContent = t("level_music");
  document.getElementById("level-voice-label").textContent = t("level_voice");
  document.getElementById("level-music").value = Math.round(getLevel("music") * 100);
  document.getElementById("level-voice").value = Math.round(getLevel("voice") * 100);
  document.getElementById("levels-hint").textContent = isMuted() ? t("levels_muted") : "";
}

// The sound switch, the volume button and its panel normally come with index.html. A
// browser that kept an older cached index.html would not have them, and the page must not
// stop for that: create whatever is missing.
function ensureSoundControls() {
  const nav = document.querySelector(".top nav");
  const lang = document.getElementById("lang");
  if (!document.getElementById("sound")) {
    const sound = document.createElement("button");
    sound.id = "sound";
    nav.insertBefore(sound, lang);
  }
  if (!document.getElementById("levels")) {
    const levels = document.createElement("button");
    levels.id = "levels";
    levels.setAttribute("aria-expanded", "false");
    levels.setAttribute("aria-controls", "levels-panel");
    levels.innerHTML = `<svg class="levels-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4v16M12 4v16M19 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55" />
      <rect x="2.5" y="12" width="5" height="3.4" rx="1.2" fill="currentColor" />
      <rect x="9.5" y="6" width="5" height="3.4" rx="1.2" fill="currentColor" />
      <rect x="16.5" y="14.5" width="5" height="3.4" rx="1.2" fill="currentColor" /></svg>`;
    nav.insertBefore(levels, lang);
  }
  if (!document.getElementById("levels-panel")) {
    const panel = document.createElement("div");
    panel.id = "levels-panel";
    panel.className = "levels-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <label><span id="level-music-label"></span><input id="level-music" type="range" min="0" max="100" step="5" /></label>
      <label><span id="level-voice-label"></span><input id="level-voice" type="range" min="0" max="100" step="5" /></label>
      <p id="levels-hint" class="levels-hint"></p>`;
    document.querySelector(".top").appendChild(panel);
  }
}
ensureSoundControls();
// The title with its drawn emblem (replacing whatever an older cached page had there).
const heading = document.querySelector(".top h1");
if (heading) heading.innerHTML = `${LOGO}<span class="logo-text">Battleship Arena</span>`;

// The general switch (also starts the music, see music.js) and the two sliders.
document.getElementById("sound").addEventListener("click", () => {
  setMuted(!isMuted());
  renderHeader();
});
const levelsPanel = document.getElementById("levels-panel");
const levelsButton = document.getElementById("levels");
function openLevels(open) {
  levelsPanel.hidden = !open;
  levelsButton.setAttribute("aria-expanded", String(open));
}
levelsButton.addEventListener("click", (event) => {
  event.stopPropagation();
  openLevels(levelsPanel.hidden);
});
levelsPanel.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => openLevels(false));
document.addEventListener("keydown", (event) => event.key === "Escape" && openLevels(false));
for (const kind of ["music", "voice"]) {
  document.getElementById(`level-${kind}`).addEventListener("input", (event) => setLevel(kind, event.target.value / 100));
}
document.getElementById("lang").addEventListener("click", () => {
  setLang(getLang() === "es" ? "en" : "es");
  renderHeader();
  current();
});
for (const [id, [, screenFn]] of Object.entries(NAV)) {
  document.getElementById(id).addEventListener("click", () => {
    if (!arena) return;
    if (match && !match.over && !confirm(t("confirm_leave"))) return;
    stopMatch();
    leaveGame();
    match = null;
    show(screenFn());
  });
}

// --- menu ------------------------------------------------------------------------------

// --- the captain's cabin (the "Set sail!" screen) ----------------------------------------
//
// The setup screen is the captain's cabin, seen standing in front of his table: the stern
// windows and the sea at the back, a bookshelf and the captain's chair, and on the table
// the chart (its three destinations choose the mode) and the objects that hold the other
// settings: the wanted poster (your name), the spyglass (the enemy captain), the ship models
// (the fleet), the compass (the wind), the dividers (the size of the sea) and the logbook
// (the pirate code). Every object is a real button wired to the same settings and checks as
// before; its panel opens next to it. The room is one picture (cabin-art.js) scaled to fit;
// the objects stand on it in the same coordinates, and their labels keep a readable size.

const WINDS = { slow: -40, normal: 20, fast: 80 }; // compass needle angle for each wind
const cabin = { panel: null, trigger: null, layout: null };
const sceneUrls = {};

// The room picture as an image (drawn once by the browser, then cached).
function sceneUrl(layout) {
  sceneUrls[layout] ??= URL.createObjectURL(new Blob([sceneSvg(layout)], { type: "image/svg+xml" }));
  return sceneUrls[layout];
}

function reducedMotionWanted() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const px = (n) => `${Math.round(n * 10) / 10}px`;

function shipsLabel(n) {
  return tn("ships", n);
}

// Danger as five notches, filled up to `level`.
function dangerHtml(level) {
  if (!level) return "";
  const notches = [1, 2, 3, 4, 5].map((i) => `<i${i <= level ? ' class="on"' : ""}></i>`).join("");
  return `<span class="danger" role="img" aria-label="${th("danger_of", { n: level })}">${notches}</span>`;
}

function captainLevels() {
  return dangerLevels(ranking?.data?.standings, players.map((p) => p.name));
}

// What the objects show on their labels, refreshed after every change.
function cabinSummaries() {
  const levels = captainLevels();
  let poster;
  if (settings.mode === "hvb") poster = esc(settings.nameMe || t("poster_nameless"));
  else if (settings.mode === "hvh") poster = th("poster_two", { a: settings.nameA || t("name_a"), b: settings.nameB || t("name_b") });
  else poster = th("poster_watch");
  let enemy;
  if (settings.mode === "hvb") enemy = `${esc(settings.opponent)} ${dangerHtml(levels[settings.opponent])}`;
  else if (settings.mode === "bvb") enemy = th("spy_duel", { a: settings.botA, b: settings.botB });
  else enemy = th("spy_none");
  return {
    poster,
    enemy,
    fleet: esc(shipsLabel(settings.fleet.length)),
    wind: th(`speed_${settings.speed}`),
    size: esc(`${settings.size}×${settings.size}`),
    voyage: th("prepare_summary", { size: settings.size, ships: shipsLabel(settings.fleet.length), wind: t(`speed_${settings.speed}`) }),
  };
}

function refreshCabin() {
  const s = cabinSummaries();
  const set = (sel, html) => {
    const el = app.querySelector(sel);
    if (el) el.innerHTML = html;
  };
  set(".poster-name", s.poster);
  set('[data-prop="poster"] .tag-value', s.poster);
  set('[data-prop="spyglass"] .tag-value', s.enemy);
  set('[data-prop="models"] .tag-value', s.fleet);
  set('[data-prop="compass"] .tag-value', s.wind);
  set('[data-prop="dividers"] .tag-value', s.size);
  set(".prepare small", s.voyage);
  const needle = app.querySelector(".compass .needle");
  if (needle) needle.style.transform = `rotate(${WINDS[settings.speed] ?? 0}deg)`;
}

function botOptions(selected) {
  return players
    .map((p) => `<option value="${esc(p.name)}"${p.name === selected ? " selected" : ""}>${esc(p.name)}</option>`)
    .join("");
}

function botNote(name) {
  const p = playerByName(name);
  const level = captainLevels()[name];
  return `<p class="bot-note">${esc(p?.description ?? "")} ${level ? `<span class="bot-danger">${th("danger")}: ${dangerHtml(level)}</span>` : ""}</p>`;
}

// A name field, plus (in Spanish) how the parrot should address that player.
function nameField(key, label, value) {
  const form = settings.forms[key];
  const choice =
    getLang() === "es"
      ? `<label class="form-choice">${th("form_label")}<select id="form-${key}">` +
        `<option value="m"${form === "m" ? " selected" : ""}>${th("title_captain")}</option>` +
        `<option value="f"${form === "f" ? " selected" : ""}>${th("title_captain_f")}</option></select></label>`
      : "";
  return `<div class="name-field"><label>${th(label)}<input id="name-${key}" maxlength="20" autocomplete="nickname" value="${esc(value)}" placeholder="${th("name_placeholder")}"></label>${choice}</div>`;
}

function panelHtml(kind) {
  if (kind === "poster") {
    const fields =
      settings.mode === "hvb"
        ? nameField("me", "ask_name", settings.nameMe)
        : nameField("a", "ask_name_a", settings.nameA) + nameField("b", "ask_name_b", settings.nameB);
    return `<h3>${th("wanted")}</h3>${fields}`;
  }
  if (kind === "spyglass") {
    if (settings.mode === "hvb") {
      return `<h3>${th("opponent")}</h3>
        <label class="field">${th("opponent")}<select id="opponent">${botOptions(settings.opponent)}</select></label>
        <div id="bot-note-opponent">${botNote(settings.opponent)}</div>`;
    }
    return `<h3>${th("spy_duel_title")}</h3>
      <label class="field">${th("bot_a")}<select id="bot-a">${botOptions(settings.botA)}</select></label>
      <div id="bot-note-bot-a">${botNote(settings.botA)}</div>
      <label class="field">${th("bot_b")}<select id="bot-b">${botOptions(settings.botB)}</select></label>
      <div id="bot-note-bot-b">${botNote(settings.botB)}</div>`;
  }
  if (kind === "voyage") {
    const models = settings.fleet
      .map(
        (length, i) => `
        <li class="model">
          ${miniShip(length)}
          <span class="model-length">${length}</span>
          <button type="button" class="tiny" data-ship="${i}" data-delta="-1" aria-label="${th("fleet_shorter", { n: length })}">−</button>
          <button type="button" class="tiny" data-ship="${i}" data-delta="1" aria-label="${th("fleet_longer", { n: length })}">+</button>
          <button type="button" class="tiny remove" data-remove="${i}" aria-label="${th("fleet_remove", { n: length })}"${settings.fleet.length === 1 ? " disabled" : ""}>×</button>
        </li>`,
      )
      .join("");
    const wind = (value) =>
      `<label class="wind${settings.speed === value ? " chosen" : ""}"><input type="radio" name="speed" value="${value}"${settings.speed === value ? " checked" : ""}> ${th(`speed_${value}`)}</label>`;
    return `<h3>${th("prepare")}</h3>
      <section class="voyage-part" id="part-fleet"><h4>${th("prop_models")}</h4>
        <ul class="models">${models}</ul>
        <button type="button" id="add-ship" class="tiny wide"${settings.fleet.length >= FLEET_MAX ? " disabled" : ""}>+ ${th("fleet_add")}</button>
        <label class="field">${th("fleet_typed")}<input id="fleet" value="${settings.fleet.join(",")}" inputmode="numeric"></label>
      </section>
      <section class="voyage-part" id="part-size"><h4>${th("prop_marks")}</h4>
        <span class="range-row"><input id="size" type="range" min="5" max="15" value="${settings.size}" aria-label="${th("board_size")}"><output id="size-out">${settings.size}×${settings.size}</output></span>
      </section>
      <section class="voyage-part" id="part-wind"><h4>${th("prop_compass")}</h4>
        <div class="winds" role="radiogroup" aria-label="${th("speed")}">${wind("slow")}${wind("normal")}${wind("fast")}</div>
        <p class="bot-note">${th("wind_help")}</p>
      </section>`;
  }
  // the logbook: the pirate code
  return `<h3>${th("code_title")}</h3><ol class="code">${[1, 2, 3, 4].map((n) => `<li>${th(`code_${n}`)}</li>`).join("")}</ol>`;
}

function closePanel({ restoreFocus = true } = {}) {
  const panel = app.querySelector("#cabin-panel");
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panel.innerHTML = "";
  app.querySelectorAll("[data-panel].open").forEach((b) => {
    b.classList.remove("open");
    b.setAttribute("aria-expanded", "false");
  });
  const back = cabin.trigger;
  cabin.panel = null;
  cabin.trigger = null;
  if (restoreFocus) back?.focus({ preventScroll: true });
}

// Opens the panel of an object beside it (a bottom sheet on phones) and wires its fields.
function openPanel(trigger, kind, focusPart = null) {
  if (trigger.getAttribute("aria-disabled") === "true") return;
  const panel = app.querySelector("#cabin-panel");
  if (cabin.panel === kind && cabin.trigger === trigger && !focusPart) {
    closePanel();
    return;
  }
  closePanel({ restoreFocus: false });
  cabin.panel = kind;
  cabin.trigger = trigger;
  trigger.classList.add("open");
  trigger.setAttribute("aria-expanded", "true");
  panel.innerHTML = `<button type="button" class="panel-close" aria-label="${th("close")}">×</button>${panelHtml(kind)}`;
  panel.setAttribute("aria-label", trigger.getAttribute("aria-label") ?? "");
  panel.hidden = false;
  placePanel(panel, trigger);
  wirePanel(panel, kind);
  const target = (focusPart && panel.querySelector(`#part-${focusPart}`)) || panel;
  if (focusPart) target.scrollIntoView({ block: "nearest" });
  (target.querySelector("input, select, button:not(.panel-close)") ?? panel.querySelector(".panel-close")).focus({ preventScroll: true });
}

// Beside the object when there is room (right, else left), otherwise below or above it.
function placePanel(panel, trigger) {
  const room = app.querySelector(".cabin").getBoundingClientRect();
  const at = trigger.getBoundingClientRect();
  const width = Math.min(360, room.width - 16);
  const l = at.left - room.left;
  const rgt = at.right - room.left;
  const tp = at.top - room.top;
  const bt = at.bottom - room.top;
  panel.style.width = px(width);
  panel.style.maxHeight = px(room.height - 16);
  const height = panel.offsetHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  let left;
  let top;
  if (rgt + 12 + width <= room.width - 8 || l - 12 - width >= 8) {
    left = rgt + 12 + width <= room.width - 8 ? rgt + 12 : l - 12 - width;
    top = clamp(tp, 8, room.height - height - 8);
  } else {
    left = clamp((l + rgt) / 2 - width / 2, 8, room.width - width - 8);
    top = bt + 8 + height <= room.height - 8 ? bt + 8 : Math.max(8, tp - 8 - height);
  }
  panel.style.left = px(left);
  panel.style.top = px(top);
}

function wirePanel(panel, kind) {
  panel.querySelector(".panel-close").addEventListener("click", () => closePanel());
  const on = (sel, type, fn) => panel.querySelector(sel)?.addEventListener(type, fn);
  const text = (id, key) =>
    on(`#${id}`, "input", (e) => {
      settings[key] = e.target.value.trim();
      refreshCabin();
    });
  text("name-me", "nameMe");
  text("name-a", "nameA");
  text("name-b", "nameB");
  for (const key of ["me", "a", "b"]) on(`#form-${key}`, "change", (e) => (settings.forms[key] = e.target.value));
  for (const [id, key] of [
    ["opponent", "opponent"],
    ["bot-a", "botA"],
    ["bot-b", "botB"],
  ]) {
    on(`#${id}`, "change", (e) => {
      settings[key] = e.target.value;
      panel.querySelector(`#bot-note-${id}`).innerHTML = botNote(settings[key]);
      refreshCabin();
    });
  }
  if (kind === "voyage") {
    const redraw = (part) => {
      refreshCabin();
      openPanel(cabin.trigger, "voyage", part);
    };
    panel.querySelectorAll("[data-ship]").forEach((b) =>
      b.addEventListener("click", () => {
        settings.fleet = changeLength(settings.fleet, Number(b.dataset.ship), Number(b.dataset.delta));
        redraw("fleet");
      }),
    );
    panel.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        settings.fleet = removeShip(settings.fleet, Number(b.dataset.remove));
        redraw("fleet");
      }),
    );
    on("#add-ship", "click", () => {
      settings.fleet = addShip(settings.fleet);
      redraw("fleet");
    });
    on("#fleet", "change", (e) => {
      const fleet = parseFleet(e.target.value);
      if (fleet) settings.fleet = fleet;
      redraw("fleet");
    });
    on("#size", "input", (e) => {
      settings.size = Number(e.target.value);
      panel.querySelector("#size-out").textContent = `${settings.size}×${settings.size}`;
      refreshCabin();
    });
    panel.querySelectorAll('input[name="speed"]').forEach((radio) =>
      radio.addEventListener("change", () => {
        settings.speed = radio.value;
        panel.querySelectorAll(".wind").forEach((w) => w.classList.toggle("chosen", w.contains(radio)));
        refreshCabin();
      }),
    );
  }
}

// Leaving the cabin for the battle: the room rushes towards the stern windows and the sea.
function embark(then) {
  if (reducedMotionWanted()) {
    then();
    return;
  }
  app.querySelector(".cabin")?.classList.add("embarking");
  const veil = document.createElement("div");
  veil.className = "embark-veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);
  setTimeout(() => {
    then();
    veil.classList.add("open");
    setTimeout(() => veil.remove(), 600);
  }, 620);
}

// Scales the room to the cabin's box; a new composition when the screen changes shape.
function fitCabin() {
  const box = app.querySelector(".cabin");
  if (!box) return;
  const { width, height } = box.getBoundingClientRect();
  if (chooseLayout(width, height) !== cabin.layout) {
    menuScreen();
    return;
  }
  const { k, x, y } = fitScene(cabin.layout, width, height);
  const layer = box.querySelector(".cabin-layer");
  layer.style.transform = `translate(${px(x)}, ${px(y)}) scale(${k})`;
  layer.style.setProperty("--k", String(k));
}

// The cabin fills the screen under the header.
function sizeCabin() {
  const header = document.querySelector(".top");
  document.documentElement.style.setProperty("--header-h", px(header?.offsetHeight ?? 0));
}

addEventListener("resize", () => {
  if (current !== menuScreen || !app.querySelector(".cabin")) return;
  closePanel({ restoreFocus: false });
  sizeCabin();
  fitCabin();
});

// One object of the cabin: a button standing at its spot, with its picture and its label.
function propHtml(layout, name, { art, aspect, panel, focus = null, label, value, disabled = false }) {
  const p = propPoint(layout, name);
  const style = `left:${px(p.x - p.w / 2)};top:${px(p.y - p.w * aspect)};width:${px(p.w)};height:${px(p.w * aspect)}`;
  return `
    <button type="button" class="prop ${name}${LAYOUTS[layout].props[name].tag === "above" ? " tag-above" : ""}" data-prop="${name}" data-panel="${panel}"${focus ? ` data-focus="${focus}"` : ""}
      aria-expanded="false" aria-label="${label}"${disabled ? ' aria-disabled="true"' : ""} style="${style}">
      ${art}
      <span class="prop-tag" aria-hidden="true"><span class="tag-label">${label}</span><span class="tag-value">${value}</span></span>
    </button>`;
}

function cabinHtml(layout) {
  const L = LAYOUTS[layout];
  const mode = settings.mode;
  const s = cabinSummaries();
  const { canvas: c, windows: w, table: tb } = L;
  const lanterns = L.lanterns
    .map((l) => {
      const height = ((l.drop + 150) * l.w) / 80;
      return `<div class="lantern" aria-hidden="true" style="left:${px(l.x - l.w / 2)};top:${px(l.y)};width:${px(l.w)};height:${px(height)}">
        <span class="lantern-glow" style="top:${px(((l.drop + 90) * l.w) / 80)}"></span>${lanternSvg(l.drop)}</div>`;
    })
    .join("");
  const destinations = ["hvb", "bvb", "hvh"]
    .map((m) => {
      const p = destinationPoint(layout, m);
      const size = 190 * p.scale;
      const chosen = m === mode;
      return `
        <label class="destination label-${DESTINATIONS[m].label}${chosen ? " chosen" : ""}" style="left:${px(p.x - size / 2)};top:${px(p.y - size * 0.86)};width:${px(size)};height:${px(size)}">
          <input type="radio" name="mode" value="${m}"${chosen ? " checked" : ""} aria-describedby="dest-tip-${m}">
          ${MINIATURES[m]}
          <span class="dest-label"><span class="dest-name">${th(`mode_${m}`)}</span><span class="dest-tip" id="dest-tip-${m}">${th(`dest_${m}`)}</span></span>
        </label>`;
    })
    .join("");
  const cq = chartQuad(layout);
  const poster = L.poster;
  const posterFoot = { x: (poster[2].x + poster[3].x) / 2, y: Math.max(poster[2].y, poster[3].y) };
  // standing on the table's front edge, growing upwards with their text
  const face = (x, width) => `left:${px(x - width / 2)};bottom:${px(L.size.h - tb.face + 10)};width:${px(width)}`;
  return `
    <div class="cabin-layer">
      <div class="sea" aria-hidden="true" style="left:${px(w.x0 - 40)};top:${px(w.y0 - 40)};width:${px(w.x1 - w.x0 + 80)};height:${px(w.y1 - w.y0 + 70)}">${SEA}</div>
      <img class="room" src="${sceneUrl(layout)}" alt="" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)}">
      <div class="cabin-title" style="left:${px(L.title.x)};top:${px(L.title.y)}">
        <h2 id="cabin-title">${th("menu_title")}</h2>
        <p>${th("menu_sub")}</p>
      </div>
      <div class="chart" style="transform:${quadTransform(1600, 920, cq)}">${chartSvg(mode, esc(t("chart_sea")))}</div>
      <div class="table-light" aria-hidden="true"></div>
      <div class="destinations" role="radiogroup" aria-label="${th("mode")}">${destinations}</div>
      <p class="chart-note" style="left:${px((cq[2].x + cq[3].x) / 2)};top:${px(L.chart.front + 10)}">${th(`dest_${mode}`)}</p>
      <button type="button" class="prop poster" data-prop="poster" data-panel="poster" aria-expanded="false" aria-label="${th("prop_poster")}"
        ${mode === "bvb" ? 'aria-disabled="true"' : ""} style="transform:${quadTransform(220, 300, poster)}">
        ${POSTER}
        <span class="wanted">${th("wanted")}</span>
        <span class="poster-name">${s.poster}</span>
        <span class="poster-reward">${th("reward")}</span>
      </button>
      <span class="prop-tag poster-tag" data-prop="poster" aria-hidden="true" style="left:${px(posterFoot.x)};top:${px(posterFoot.y + 10)}">
        <span class="tag-label">${th("prop_poster")}</span><span class="tag-value">${s.poster}</span></span>
      ${propHtml(layout, "models", { art: MODELS, aspect: 190 / 320, panel: "voyage", focus: "fleet", label: th("prop_models"), value: s.fleet })}
      ${propHtml(layout, "dividers", { art: DIVIDERS, aspect: 120 / 200, panel: "voyage", focus: "size", label: th("prop_marks"), value: s.size })}
      ${propHtml(layout, "compass", { art: COMPASS, aspect: 170 / 200, panel: "voyage", focus: "wind", label: th("prop_compass"), value: s.wind })}
      ${propHtml(layout, "spyglass", { art: SPYGLASS, aspect: 140 / 380, panel: "spyglass", label: th("prop_spyglass"), value: s.enemy, disabled: mode === "hvh" })}
      ${propHtml(layout, "logbook", { art: LOGBOOK, aspect: 170 / 260, panel: "code", label: th("prop_logbook"), value: th("code_title") })}
      ${lanterns}
      <button type="button" class="prepare" data-panel="voyage" aria-expanded="false" aria-label="${th("prepare")}" style="${face(L.face.prepare.x, L.face.prepare.w)}">
        <span>${th("prepare")}</span><small>${s.voyage}</small></button>
      <div class="launch" style="${face(L.face.start.x, L.face.start.w)}">
        <p id="menu-error" class="menu-error" role="alert"></p>
        <button id="start" class="start">${th("start")}</button>
      </div>
    </div>
    <div class="table-glow" aria-hidden="true"></div>
    <div id="cabin-panel" class="cabin-panel" role="dialog" hidden></div>`;
}

function menuScreen() {
  if (!ranking) loadRanking(); // for the enemy captains' danger marks
  cabin.panel = null;
  cabin.trigger = null;
  sizeCabin();
  app.innerHTML = `<section class="cabin" aria-labelledby="cabin-title"></section>`;
  const box = app.querySelector(".cabin");
  const { width, height } = box.getBoundingClientRect();
  cabin.layout = chooseLayout(width, height);
  box.dataset.layout = cabin.layout;
  box.innerHTML = cabinHtml(cabin.layout);
  fitCabin();
  refreshCabin();

  app.querySelectorAll('input[name="mode"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      settings.mode = radio.value;
      menuScreen();
      app.querySelector(`input[name="mode"][value="${radio.value}"]`)?.focus({ preventScroll: true });
    }),
  );
  app.querySelectorAll("[data-panel]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openPanel(button, button.dataset.panel, button.dataset.focus ?? null);
    }),
  );
  app.querySelector("#cabin-panel").addEventListener("click", (event) => event.stopPropagation());
  keyHandler = (event) => {
    if (event.key === "Escape") closePanel();
  };
  app.querySelector("#start").addEventListener("click", () => {
    const error = app.querySelector("#menu-error");
    if (!(settings.size <= MAX_COLUMNS)) {
      error.textContent = t("too_wide", { max: MAX_COLUMNS });
      return;
    }
    const check = arena.call("check_fleet", settings.size, settings.fleet);
    if (!check.ok) {
      error.textContent = problemText(check.problem, check.reason);
      return;
    }
    closePanel({ restoreFocus: false });
    embark(startMatch);
  });
}

// A click anywhere else closes the open panel.
document.addEventListener("click", () => {
  if (cabin.panel) closePanel({ restoreFocus: false });
});

function aboutScreen() {
  app.innerHTML = `
    <section class="panel">
      <h2>${th("about_title")}</h2>
      <p>${th("about_body")}</p>
      <p>${th("rules_short")}</p>
      <p><a href="${getLang() === "es" ? "docs/es/" : "docs/"}">${th("docs_link")}</a> ·
        <a href="https://github.com/carmencuerva/BATTLESHIP">GitHub</a></p>
      <ul class="players">${players
        .map((p) => `<li>${esc(p.icon)} <b>${esc(p.name)}</b> — ${esc(p.description)} <small>(${esc(p.authors.join(", "))})</small></li>`)
        .join("")}</ul>
    </section>`;
}

// --- ranking (the CI tournament) -------------------------------------------------------

function rankingScreen() {
  let body;
  if (!ranking || ranking.status === "loading") body = `<div class="spinner"></div>`;
  else if (ranking.status === "missing") body = `<p class="help">${th("ranking_missing")}</p>`;
  else body = leaderboardHtml(ranking.data);
  app.innerHTML = `
    <section class="panel">
      <h2>${th("ranking_title")}</h2>
      <p>${th("ranking_help")}</p>
      ${body}
    </section>`;
  if (!ranking) loadRanking();
}

async function loadRanking() {
  ranking = { status: "loading" };
  try {
    const response = await fetch("leaderboard.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ranking = { status: "ok", data: await response.json() };
  } catch (error) {
    console.warn("no leaderboard.json:", error);
    ranking = { status: "missing" };
  }
  if (current === rankingScreen) rankingScreen();
  if (current === menuScreen && !cabin.panel) refreshCabin(); // the danger marks
}

// --- tournament in the browser ---------------------------------------------------------

function tournamentScreen() {
  if (!tour) {
    tour = {
      players: players.map((p) => p.name),
      games: 10,
      knockout: 6,
      seed: 0,
      format: "league",
      status: "idle", // idle | running | stopped | done
      stage: "league",
      done: 0,
      total: 0,
      result: null,
      error: "",
    };
  }
  const running = tour.status === "running";
  const picks = players
    .map(
      (p) =>
        `<label class="radio"><input type="checkbox" class="pick" value="${esc(p.name)}"` +
        `${tour.players.includes(p.name) ? " checked" : ""}${running ? " disabled" : ""}> ` +
        `${esc(p.icon)} ${esc(p.name)}</label>`,
    )
    .join("");
  const format = (value) =>
    `<option value="${value}"${tour.format === value ? " selected" : ""}>${th(`format_${value}`)}</option>`;
  const dis = running ? " disabled" : "";

  let status = "";
  if (running || tour.status === "stopped") {
    const pct = tour.total ? Math.round((100 * tour.done) / tour.total) : 0;
    status = `
      <p id="tour-progress">${progressText()}</p>
      <progress id="tour-bar" max="100" value="${pct}"></progress>`;
  } else if (tour.status === "done") {
    status = `<p>${th("tournament_done", { games: tour.total })}</p>${leaderboardHtml(tour.result)}`;
  }

  app.innerHTML = `
    <section class="panel menu">
      <h2>${th("tournament_title")}</h2>
      <p class="help">${th("tournament_help", { size: settings.size, fleet: settings.fleet.join(",") })}</p>
      <fieldset><legend>${th("tournament_players")}</legend>${picks}</fieldset>
      <div class="fields">
        <label>${th("games_per_pair")}<input id="tour-games" type="number" min="2" max="200" step="2" value="${tour.games}"${dis}></label>
        <label>${th("seed")}<input id="tour-seed" type="number" min="0" value="${tour.seed}"${dis}></label>
        <label>${th("format")}<select id="tour-format"${dis}>${format("league")}${format("simple")}${format("championship")}</select></label>
        <label class="ko-field"${tour.format === "championship" ? "" : " hidden"}>${th("knockout_games")}<input id="tour-ko" type="number" min="2" max="100" step="2" value="${tour.knockout}"${dis}></label>
      </div>
      ${running ? `<button id="tour-stop">${th("stop")}</button>` : `<button id="tour-run" class="primary">${th("run_tournament")}</button>`}
      <p class="error">${esc(tour.error)}</p>
      ${status}
    </section>`;

  app.querySelector("#tour-stop")?.addEventListener("click", () => {
    tour.status = "stopped";
  });
  app.querySelector("#tour-format").addEventListener("change", (event) => {
    app.querySelector(".ko-field").hidden = event.target.value !== "championship";
  });
  app.querySelector("#tour-run")?.addEventListener("click", () => {
    tour.players = [...app.querySelectorAll(".pick:checked")].map((box) => box.value);
    tour.games = Number(app.querySelector("#tour-games").value);
    tour.knockout = Number(app.querySelector("#tour-ko").value);
    tour.seed = Number(app.querySelector("#tour-seed").value);
    tour.format = app.querySelector("#tour-format").value;
    runTournament();
  });
}

function progressText() {
  const vars = { done: tour.done, total: tour.total, stage: stageName(tour.stage) };
  return t(tour.status === "running" ? "tournament_progress" : "tournament_stopped", vars);
}

// Python decides every stage (league, then knockout rounds); this loop only asks for the
// next games, plays them one by one and reports back.
async function runTournament() {
  const config = {
    players: tour.players,
    games_per_pair: tour.games,
    knockout_games: tour.knockout,
    seed: tour.seed,
    format: tour.format,
    size: settings.size,
    fleet: settings.fleet,
  };
  const played = [];
  let step = arena.call("tournament_next", config, played);
  if (step.error) {
    tour.error = step.error;
    tournamentScreen();
    return;
  }
  Object.assign(tour, { status: "running", stage: step.stage, done: 0, total: step.total, result: null, error: "" });
  const mine = screen;
  tournamentScreen();
  while (!step.done) {
    tour.stage = step.stage;
    for (const [i, j, spec] of step.games) {
      // Yield to the browser so the page stays responsive and the progress bar repaints.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (screen !== mine) {
        tour.status = "stopped"; // the user went to another screen
        return;
      }
      if (tour.status !== "running") {
        tournamentScreen();
        return;
      }
      played.push([i, j, spec, arena.call("tournament_game", [step.players[i], step.players[j]], spec)]);
      tour.done = played.length;
      const bar = app.querySelector("#tour-bar");
      if (bar) bar.value = Math.round((100 * tour.done) / tour.total);
      const label = app.querySelector("#tour-progress");
      if (label) label.textContent = progressText();
    }
    step = arena.call("tournament_next", config, played);
  }
  tour.result = arena.call("tournament_result", config, played);
  tour.status = "done";
  if (screen === mine) tournamentScreen();
}

// --- match setup -----------------------------------------------------------------------

function stopMatch() {
  if (!match) return;
  clearTimeout(match.timer);
  for (const side of match.sides) {
    if (side.handle != null) arena.call("release_bot", side.handle);
    side.handle = null;
  }
}

let matchCount = 0;

function startMatch() {
  stopMatch();
  closeEndScreen();
  const { mode } = settings;
  const kinds = { hvb: ["human", "bot"], bvb: ["bot", "bot"], hvh: ["human", "human"] }[mode];
  const bots = { hvb: [null, settings.opponent], bvb: [settings.botA, settings.botB], hvh: [null, null] }[mode];
  if (mode === "hvb") save("name", settings.nameMe);
  if (mode === "hvh") save("hotseat", [settings.nameA, settings.nameB]);
  save("forms", settings.forms);
  const forms = { hvb: [settings.forms.me, "m"], bvb: ["m", "m"], hvh: [settings.forms.a, settings.forms.b] }[mode];
  // The names people typed in (empty if they left the field blank).
  const typed = kinds.map((kind, i) => {
    if (kind === "bot") return "";
    return mode === "hvb" ? settings.nameMe : i === 0 ? settings.nameA : settings.nameB;
  });
  const names = kinds.map((kind, i) => {
    if (kind === "bot") {
      const label = bots[i];
      return mode === "bvb" && bots[0] === bots[1] ? `${label} (${"AB"[i]})` : label;
    }
    if (typed[i]) return typed[i];
    return mode === "hvb" ? t("you") : t(i === 0 ? "name_a" : "name_b");
  });
  match = {
    id: ++matchCount,
    mode,
    size: settings.size,
    fleet: settings.fleet.slice(),
    sides: kinds.map((kind, i) => ({
      kind,
      name: names[i],
      icon: kind === "bot" ? playerByName(bots[i])?.icon ?? "🤖" : "🧑",
      bot: bots[i],
      typed: typed[i], // a real name to call the player by
      rank: "deckhand", // promoted to "captain" after sinking a first ship
      form: forms[i],
      handle: null,
      board: null,
    })),
    attacker: null,
    viewer: 0,
    log: [],
    shots: [0, 0],
    last: [null, null],
    over: null,
    locked: false, // hot-seat: waiting for the device to change hands
    busy: false, // a missile is in the air
    pending: null, // touch: the cell picked by a first tap, fired by a second
    fresh: null, // the shot to animate on the next draw
    endShown: false,
    turn: 0, // bumped each time the cannon changes hands
    called: -1, // the last turn the parrot announced
    hushTurn: false, // a shot is being announced: no "your turn" until it has been said
    hints: true,
    xray: mode === "bvb",
    timer: null,
  };

  for (const [i, side] of match.sides.entries()) {
    if (side.kind !== "bot") continue;
    const built = arena.call("create_bot", side.bot, randomSeed());
    if (built.error) return forfeit(i, built.error);
    side.handle = built.handle;
    const placed = arena.call("bot_placement", side.handle, match.size, match.fleet);
    if (placed.error) return forfeit(i, placed.error);
    side.board = arena.call("new_board", match.size, match.fleet, placed.placement);
  }
  nextPlacement();
}

function nextPlacement() {
  const i = match.sides.findIndex((side) => !side.board);
  if (i === -1) return beginBattle();
  if (match.mode === "hvh" && i > 0) show(() => passScreen(i, () => show(() => placementScreen(i))));
  else show(() => placementScreen(i));
}

// --- placement editor -------------------------------------------------------------------

// Pirate wording for a bad fleet or placement. The codes come from webglue (Python); this
// only picks the sentence and fills in the cell as "C7".
function problemText(problem, reason = "") {
  if (!problem) return "";
  const vars = { reason, length: problem.length ?? "" };
  if (problem.cell) {
    const [r, c] = problem.cell;
    vars.cell = r >= 0 && c >= 0 && c < MAX_COLUMNS ? coord(r, c) : "?";
  }
  return t(`why_${problem.code}`, vars);
}

// The tutorial's steps: what each one highlights (its words are tutor_1… in i18n.js).
const TUTOR_STEPS = [[".ship-list", "#place-board"], ["#rotate"], ["#random"], ["#clear"], ["#place-board"], ["#ready"]];

function placementScreen(i) {
  const side = match.sides[i];
  const { size, fleet } = match;
  // drag: {k, x0, y0, moved, fromBoard} while a ship is being dragged.
  // tutor: the step of the parrot's tutorial on show (0..), or null when it is closed.
  const ed = { placement: fleet.map(() => null), selected: 0, orient: "H", hover: null, problem: null, drag: null };
  ed.tutor = load("tutorial", "") === "done" ? null : 0;
  let ghost = null;
  let swallowClick = false; // the click that ends a drag must not also place or pick up
  let quiet = null; // "r,c" where a ship was just put down: no preview there until the pointer moves on

  const layout = (placement) => arena.call("layout", size, fleet, placement);
  const nextUnplaced = () => {
    const k = ed.placement.findIndex((entry) => entry === null);
    return k === -1 ? null : k;
  };
  const candidate = () => {
    if (ed.hover === null || ed.selected === null) return null;
    const placement = ed.placement.slice();
    placement[ed.selected] = [ed.hover[0], ed.hover[1], ed.orient];
    return placement;
  };
  const setHover = (at) => {
    const key = at ? `${at[0]},${at[1]}` : null;
    if (key === quiet) at = null; // the pointer still rests on the ship it just placed
    else quiet = null;
    if (at === ed.hover || (at && ed.hover && at[0] === ed.hover[0] && at[1] === ed.hover[1])) return;
    ed.hover = at;
    drawBoard();
  };

  // The note in the scroll: why the ship under the cursor cannot go there, the last
  // refusal, or what to do next.
  function drawNote(preview, complete) {
    const note = app.querySelector("#place-note");
    const problem = preview && !preview.ok ? preview.problem : ed.problem;
    note.className = `note ${problem ? "warn" : complete ? "ok" : ""}`;
    if (problem) note.textContent = problemText(problem, preview?.reason ?? "");
    else if (complete) note.textContent = t("place_done");
    else if (ed.selected !== null) {
      const orient = t(ed.orient === "H" ? "horizontal" : "vertical");
      note.textContent = t("place_next", { length: fleet[ed.selected], orient });
    } else note.textContent = "";
  }

  function drawBoard() {
    const base = layout(ed.placement);
    const cand = candidate();
    let preview = null;
    if (cand) {
      const result = layout(cand);
      preview = { cells: result.ships[ed.selected] ?? [], ok: result.ok, problem: result.problem, reason: result.reason };
    }
    renderBoard(app.querySelector("#place-board"), {
      size,
      fleet: base.ships.filter(Boolean),
      preview,
      clickable: true,
      onHover: (r, c) => ed.drag || setHover([r, c]),
      onLeave: () => ed.drag || setHover(null),
      onContext: rotate,
      onClick: (r, c) => {
        if (swallowClick) return;
        click(r, c, base, preview);
      },
    });
    app.querySelector("#ready").disabled = !base.complete;
    drawNote(preview, base.complete);
  }

  function click(r, c, base, preview) {
    const owner = base.ships.findIndex((cells) => cells?.some(([x, y]) => x === r && y === c));
    if (owner !== -1) {
      ed.placement[owner] = null; // back to the hold
      ed.selected = owner;
      ed.problem = null;
    } else if (ed.selected !== null && preview?.ok) {
      ed.placement[ed.selected] = [r, c, ed.orient];
      ed.selected = nextUnplaced();
      ed.problem = null;
      ed.hover = null;
      quiet = `${r},${c}`;
    } else if (preview && !preview.ok) {
      ed.problem = preview.problem;
    }
    drawAll();
  }

  function rotate() {
    ed.orient = ed.orient === "H" ? "V" : "H";
    drawAll();
  }

  // --- dragging (mouse, pen and touch alike, through pointer events) ---

  function startDrag(k, event, fromBoard) {
    if (event.button > 0) return; // right click rotates instead
    // Touch captures the pointer on the pressed element; it is redrawn while dragging, so
    // let go of the capture (the drag listens on the window) or the browser cancels it.
    try {
      event.target.releasePointerCapture?.(event.pointerId);
    } catch {
      // no capture to release
    }
    ed.drag = { k, x0: event.clientX, y0: event.clientY, moved: false, fromBoard, pointer: event.pointerId };
    addEventListener("pointermove", onDragMove);
    addEventListener("pointerup", onDragEnd);
    addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(event) {
    const drag = ed.drag;
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) < 6) return; // still a tap
      drag.moved = true;
      if (drag.fromBoard) ed.placement[drag.k] = null;
      ed.selected = drag.k;
      ed.problem = null;
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.innerHTML = miniShip(fleet[drag.k]);
      document.body.appendChild(ghost);
      document.body.classList.add("dragging-ship");
      drawAll();
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 14}px)`;
    aimAt(drag.x, drag.y);
    if (!drag.scrolling) {
      drag.scrolling = true;
      requestAnimationFrame(edgeScroll);
    }
  }

  function aimAt(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest("#place-board .cell");
    setHover(cell ? [Number(cell.dataset.r), Number(cell.dataset.c)] : null);
  }

  // While a finger rests near the top or bottom of the screen, keep scrolling (a still
  // finger sends no events) so the board can be reached on a phone.
  function edgeScroll() {
    const drag = ed.drag;
    if (!drag) return;
    const edge = 70;
    let step = 0;
    if (drag.y < edge) step = -Math.ceil((edge - drag.y) / 3);
    else if (drag.y > innerHeight - edge) step = Math.ceil((drag.y - innerHeight + edge) / 3);
    if (step) {
      scrollBy(0, step);
      aimAt(drag.x, drag.y); // the page moved under the finger
    }
    requestAnimationFrame(edgeScroll);
  }

  function onDragEnd(event) {
    if (ed.drag && event.pointerId !== ed.drag.pointer) return;
    removeEventListener("pointermove", onDragMove);
    removeEventListener("pointerup", onDragEnd);
    removeEventListener("pointercancel", onDragEnd);
    const drag = ed.drag;
    ed.drag = null;
    ghost?.remove();
    ghost = null;
    document.body.classList.remove("dragging-ship");
    if (!drag?.moved) return; // a tap: the normal click handlers take it from here
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    const cand = candidate();
    if (cand) {
      const result = layout(cand);
      if (result.ok) {
        ed.placement[drag.k] = [ed.hover[0], ed.hover[1], ed.orient];
        ed.selected = nextUnplaced();
        quiet = `${ed.hover[0]},${ed.hover[1]}`;
      } else {
        ed.problem = result.problem; // explained in the scroll; the ship stays in the hold
      }
    }
    ed.hover = null;
    drawAll();
  }

  // The parrot's tutorial: one instruction at a time, in a big bubble beside the parrot
  // (in its own strip above the board, so it never covers it), with the control it talks
  // about highlighted.
  function tutorHtml() {
    if (ed.tutor === null) return "";
    const n = ed.tutor + 1;
    const last = n === TUTOR_STEPS.length;
    return `
      <div class="tutor" role="region" aria-label="${th("tutor_help")}">
        <div class="tutor-parrot" aria-hidden="true">${PARROT_SVG}</div>
        <div class="tutor-bubble">
          <p class="tutor-step">${th("tutor_step", { n, total: TUTOR_STEPS.length })}</p>
          <p class="tutor-text" aria-live="polite">${th(`tutor_${n}`)}</p>
          <div class="tutor-buttons">
            ${last ? `<button id="tutor-next" class="primary">${th("tutor_done")}</button>` : `<button id="tutor-next" class="primary">${th("tutor_next")}</button><button id="tutor-skip">${th("tutor_skip")}</button>`}
          </div>
        </div>
      </div>`;
  }

  function closeTutor() {
    ed.tutor = null;
    save("tutorial", "done");
    drawAll();
    app.querySelector("#tutor-help")?.focus({ preventScroll: true });
  }

  function wireTutor() {
    app.querySelector("#tutor-help")?.addEventListener("click", () => {
      ed.tutor = 0;
      drawAll();
      app.querySelector("#tutor-next")?.focus({ preventScroll: true });
    });
    if (ed.tutor === null) return;
    for (const sel of TUTOR_STEPS[ed.tutor]) app.querySelector(sel)?.classList.add("tutor-target");
    app.querySelector("#tutor-skip")?.addEventListener("click", closeTutor);
    app.querySelector("#tutor-next").addEventListener("click", () => {
      if (ed.tutor + 1 >= TUTOR_STEPS.length) {
        closeTutor();
        return;
      }
      ed.tutor += 1;
      drawAll();
      app.querySelector("#tutor-next")?.focus({ preventScroll: true });
    });
  }

  function drawAll() {
    const ships = fleet
      .map((length, k) => {
        const placed = Boolean(ed.placement[k]);
        const classes = ["ship-pick", placed ? "placed" : "", ed.selected === k ? "selected" : ""];
        const afloat = placed ? `<small>✓ ${th("in_water")}</small>` : "";
        return `<button class="${classes.join(" ")}" data-k="${k}">${miniShip(length)}<span>${length}</span>${afloat}</button>`;
      })
      .join("");
    app.innerHTML = `
      <section class="panel placement">
        <div class="place-head">
          <h2>${th("place_title", { name: side.name })}</h2>
          ${ed.tutor === null ? `<button id="tutor-help" class="tutor-help" title="${th("tutor_help")}" aria-label="${th("tutor_help")}">?</button>` : ""}
        </div>
        ${tutorHtml()}
        <div class="place-layout">
          <div class="board-frame"><div id="place-board"></div></div>
          <aside class="scroll orders">
            <div class="scroll-roll top"></div>
            <div class="scroll-body">
              <p id="place-note" class="note" role="status" aria-live="polite"></p>
              <div class="orders-hold">
                <h4>${th("hold_title")}</h4>
                <div class="ship-list">${ships}</div>
                <p class="orient">${th(ed.orient === "H" ? "horizontal" : "vertical")}</p>
                <div class="buttons">
                  <button id="rotate">${th("rotate")} (R)</button>
                  <button id="random">${th("random")}</button>
                  <button id="clear">${th("clear")}</button>
                </div>
                <button id="ready" class="primary board-button">${th("ready")}</button>
              </div>
            </div>
            <div class="scroll-roll bottom"></div>
          </aside>
        </div>
      </section>`;
    app.querySelectorAll(".ship-pick").forEach((button) => {
      const k = Number(button.dataset.k);
      button.addEventListener("pointerdown", (event) => startDrag(k, event, Boolean(ed.placement[k])));
      button.addEventListener("click", () => {
        if (swallowClick) return;
        ed.placement[k] = null;
        ed.selected = k;
        ed.problem = null;
        drawAll();
      });
    });
    app.querySelector("#place-board").addEventListener("pointerdown", (event) => {
      const cell = event.target.closest(".cell");
      if (!cell) return;
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      const owner = layout(ed.placement).ships.findIndex((cells) => cells?.some(([x, y]) => x === r && y === c));
      if (owner !== -1) startDrag(owner, event, true);
    });
    app.querySelector("#rotate").addEventListener("click", rotate);
    app.querySelector("#random").addEventListener("click", () => {
      ed.placement = arena.call("random_layout", size, fleet, randomSeed());
      ed.selected = null;
      ed.problem = null;
      drawAll();
    });
    app.querySelector("#clear").addEventListener("click", () => {
      ed.placement = fleet.map(() => null);
      ed.selected = 0;
      ed.problem = null;
      drawAll();
    });
    app.querySelector("#ready").addEventListener("click", () => {
      side.board = arena.call("new_board", size, fleet, ed.placement);
      nextPlacement();
    });
    wireTutor();
    drawBoard();
  }

  keyHandler = (event) => {
    if (event.key === "r" || event.key === "R") rotate();
  };
  current = drawAll; // a language switch must not reset the editor
  drawAll();
}

// --- hot-seat ---------------------------------------------------------------------------

function passScreen(i, then) {
  // The parrot belongs to the game screen; it comes back with it after the hand-over.
  layout?.parrot.destroy();
  layout = null;
  const name = match.sides[i].name;
  const other = match.sides[1 - i].name;
  app.innerHTML = `
    <section class="panel pass">
      <h2>${th("pass_title", { name })}</h2>
      <p>${th("pass_help", { other })}</p>
      <button id="pass-ok" class="primary">${th("pass_ready", { name })}</button>
    </section>`;
  app.querySelector("#pass-ok").addEventListener("click", then);
}

// --- battle -----------------------------------------------------------------------------
//
// The game screen is built once per match (and per viewer in hot-seat games) so the parrot
// and running animations survive redraws; gameScreen() then refreshes boards and labels.
// Effects follow the game: a shot is decided by Python first, then the missile flies, then
// the new board is drawn with the matching effect (splash, flames or sinking ship).

const MISSILE_MS = { slow: 800, normal: 600, fast: 280 };
const HUMAN_MISSILE_MS = 620;
let layout = null; // {key, dock, parrot, active, logOpen}

function boardSides() {
  const me = match.mode === "bvb" ? null : match.viewer;
  const left = me ?? 0;
  return { me, left, right: 1 - left };
}

function boardEl(side) {
  const { left } = boardSides();
  return app.querySelector(side === left ? "#board-left" : "#board-right");
}

// The parrot speaks rarely (see parrot-lines.js); its words always appear in the bubble
// too, and are also said out loud when sound is on. Set with textContent, never as HTML.
// `mood` (turn, sunk, lost, victory, defeat) sets the tone of its voice and bubble.
function speakLine(text, mood) {
  if (!text) return false;
  layout?.parrot.say(text, { mood, voice: text });
  return true;
}

// How the parrot calls a player: by name in hot-seat games, otherwise by rank.
function who(side) {
  return match.mode === "hvh" ? side.name : t(`title_${title(side)}`);
}

// "Your turn!" once each time the cannon passes to a person who is at the screen.
let turnCalls = 0; // to vary the wording
function announceTurn() {
  const m = match;
  if (!m || m.over || m.locked || m.busy || m.hushTurn || m.called === m.turn) return;
  const side = m.sides[m.attacker];
  if (side?.kind !== "human" || m.attacker !== m.viewer) return;
  m.called = m.turn;
  speakLine(lineForTurn(getLang(), { who: who(side), k: turnCalls++ }), "turn");
}

// How the end screen addresses a human: "deckhand Ana", "Captain Ana", or just the rank.
function title(side) {
  return side.rank === "captain" && side.form === "f" ? "captain_f" : side.rank;
}

function addr(side) {
  if (side.typed) return t(`title_${title(side)}_named`, { name: side.typed });
  return match.mode === "hvh" ? side.name : t(`title_${title(side)}`);
}

// Victory or defeat, for the player the screen belongs to: only a human playing a bot can
// lose; otherwise the screen celebrates the winner.
function endKind(m) {
  return m.mode === "hvb" && m.sides[m.over.winner].kind !== "human" ? "defeat" : "victory";
}

function leaveGame() {
  closeEndScreen();
  layout?.parrot.destroy();
  layout = null;
}

function beginBattle() {
  match.attacker = Math.random() < 0.5 ? 0 : 1;
  match.turn = 1;
  match.viewer = match.mode === "hvb" ? 0 : match.attacker;
  match.log.push({ key: "first_shooter", vars: { name: match.sides[match.attacker].name } });
  if (match.mode === "hvh") show(() => passScreen(match.attacker, () => show(gameScreen)));
  else show(gameScreen);
  // A bot that opens waits a little longer; a hot-seat game has just had its hand-over.
  continueTurn(match.mode !== "hvh");
}

function forfeit(i, reason) {
  match.over = { winner: 1 - i, forfeit: i, reason };
  stopMatch();
  match.log.push({ key: "forfeit", vars: { name: match.sides[i].name, reason } });
  show(gameScreen);
  speakLine(lineForEnd(endKind(match), getLang()), endKind(match));
  finishGame(1400);
}

async function fire(shot) {
  const m = match;
  const a = m.attacker;
  const d = 1 - a;
  const res = arena.call("shoot", m.sides[d].board, shot, a);
  if (res.error) {
    if (m.sides[a].kind === "bot") forfeit(a, res.error);
    return;
  }

  // 1. The missile flies while nothing else may happen (no second shot, no bot move).
  m.busy = true;
  const target = boardEl(d);
  const origin = boardEl(a);
  if (target) lockBoard(target);
  if (target && origin) {
    const duration = m.sides[a].kind === "bot" ? MISSILE_MS[settings.speed] ?? MISSILE_MS.normal : HUMAN_MISSILE_MS;
    sfx.launch();
    await launchMissile(origin.getBoundingClientRect(), cellRect(target, ...shot), duration);
  }
  if (match !== m) return; // the player left or restarted meanwhile

  // 2. Commit the result Python already computed.
  const outcome = res.result.outcome;
  m.sides[d].board = res.board;
  m.shots[a] += 1;
  m.last[d] = shot;
  const logKey = { miss: "shot_miss", hit: "shot_hit", sunk: "shot_sunk" }[outcome];
  m.log.push({ key: logKey, vars: { name: m.sides[a].name, cell: coord(...shot), length: res.result.length } });
  const changed = res.next !== a;
  if (res.terminal) {
    m.over = { winner: a };
  } else {
    m.attacker = res.next;
    if (changed) m.turn += 1;
    if (m.mode === "hvh" && changed) m.locked = true; // the device changes hands first
  }
  m.busy = false;

  // 3. Draw the new boards once, with this shot's effect, then announce it.
  m.fresh = { side: d, cell: shot, outcome };
  m.hushTurn = true;
  gameScreen();
  m.hushTurn = false;
  m.fresh = null;
  const landed = boardEl(d);
  if (landed) {
    const rect = cellRect(landed, ...shot);
    if (outcome === "miss") {
      splash(rect);
      sfx.splash();
    } else {
      explode(rect, outcome === "sunk");
      sfx.explosion(outcome === "sunk");
    }
    const sinking = landed.querySelector(".ship.sinking");
    if (sinking) {
      bubbles(sinking.getBoundingClientRect());
      sfx.sink();
    }
  }
  const shooter = m.sides[a];
  if (outcome === "sunk" && shooter.kind === "human") shooter.rank = "captain"; // promoted
  // Silent on water and plain hits. When a person sinks a ship: how many enemy ships are
  // still afloat, as the engine counts them. When a bot sinks a person's ship: that it was
  // one of theirs, and how many they have left. The last sink gives way to the end-of-game
  // line. In hot-seat games only the shooter's own shot is spoken of, never anything about
  // the other player's board.
  const afloat = arena.call("status", res.board).view.remaining.length;
  const lang = getLang();
  let said = false;
  if (outcome === "sunk" && shooter.kind === "human") {
    said = speakLine(lineForShot(outcome, afloat, lang, { who: who(shooter), k: m.shots[a] }), "sunk");
  } else if (outcome === "sunk" && m.mode === "hvb" && m.sides[d].kind === "human") {
    said = speakLine(lineForLoss(afloat, lang, { who: who(m.sides[d]), k: m.shots[a] }), "lost");
  }
  if (res.terminal) said = speakLine(lineForEnd(endKind(m), lang), endKind(m));
  if (said) m.called = m.turn; // that shot's news is enough: no "your turn" on top
  else announceTurn();

  if (res.terminal) {
    stopMatch();
    finishGame(1900);
    return;
  }
  continueTurn(changed, outcome);
}

function continueTurn(changed, outcome) {
  if (match.over) return;
  const side = match.sides[match.attacker];
  if (side.kind === "bot") {
    // Leave time to read the parrot and to watch a ship go down.
    const pause = (SPEEDS[settings.speed] ?? SPEEDS.normal) + (changed ? 450 : 0) + (outcome === "sunk" ? 700 : 0);
    match.timer = setTimeout(botTurn, pause);
  } else if (match.mode === "hvh" && changed) {
    match.timer = setTimeout(() => {
      const next = match.attacker;
      show(() =>
        passScreen(next, () => {
          match.viewer = next;
          match.locked = false;
          show(gameScreen);
        }),
      );
    }, 1800);
  }
}

function botTurn() {
  if (!match || match.over) return;
  const a = match.attacker;
  const side = match.sides[a];
  const view = arena.call("status", match.sides[1 - a].board).view;
  const res = arena.call("bot_shot", side.handle, view);
  if (res.error) return forfeit(a, res.error);
  side.lastInfo = res.info;
  fire(res.shot);
}

function humanShot(r, c, view, how = {}) {
  const me = match.viewer;
  if (match.over || match.locked || match.busy) return;
  if (match.attacker !== me || match.sides[me].kind !== "human") return;
  if (view.cells[r][c] !== UNKNOWN) return;
  // A finger cannot hover: the first tap only picks the cell, a second tap on it fires.
  if (how.touch && !(match.pending && match.pending[0] === r && match.pending[1] === c)) {
    match.pending = [r, c];
    gameScreen();
    return;
  }
  match.pending = null;
  fire([r, c]);
}

// --- end of the game ---------------------------------------------------------------------

function finishGame(delay) {
  const m = match;
  if (m.endShown) return; // exactly one end sequence per match
  m.endShown = true;
  setMusic(endKind(m)); // the battle music gives way to the fanfare or the lament
  setTimeout(() => {
    if (match === m) showEnd(m);
  }, delay);
}

function showEnd(m) {
  const w = m.over.winner;
  const winner = m.sides[w];
  const loser = m.sides[1 - w];
  const kind = endKind(m);
  let sub;
  if (m.over.forfeit != null) sub = t("end_forfeit", { name: loser.name });
  else if (kind === "defeat") sub = t("end_defeat_sub", { name: winner.name, shots: m.shots[w], who: addr(loser) });
  else if (m.mode === "hvb") sub = t("end_victory_sub", { shots: m.shots[w], who: addr(winner) });
  else sub = t("end_winner_sub", { name: winner.name, shots: m.shots[w] });
  showEndScreen(
    kind,
    {
      title: t(kind === "victory" ? "victory" : "defeat"),
      sub,
      again: t("play_again"),
      menu: t("back_menu"),
      boards: t("end_boards"),
    },
    {
      onAgain: startMatch,
      onMenu: () => {
        leaveGame();
        match = null;
        show(menuScreen);
      },
    },
  );
}

// --- the game screen ---------------------------------------------------------------------

function ensureLayout() {
  const { left } = boardSides();
  const key = `${match.id}:${left}`;
  if (layout?.key === key && app.contains(layout.root)) return false;
  layout?.parrot.destroy();
  const panel = (id) => `
    <div class="board-panel" id="panel-${id}">
      <div class="nameplate" id="plate-${id}"></div>
      <div class="board-frame"><div id="board-${id}"></div></div>
      <div class="afloat" id="afloat-${id}"></div>
    </div>`;
  app.innerHTML = `
    <section class="game">
      <div class="arena">
        ${panel("left")}
        <div class="commentator" id="parrot-dock"></div>
        ${panel("right")}
      </div>
      <div class="game-side" id="game-side"></div>
    </section>`;
  // The parrot sits still on its perch between the boards (see parrot.js).
  layout = { key, root: app.querySelector(".game"), parrot: createParrot(app.querySelector("#parrot-dock")), active: null, logOpen: false };
  return true;
}

function plateHtml(side, caption, active) {
  return `
    <img class="hat" src="img/hat.webp" alt="" draggable="false">
    <span class="pname">${esc(side.icon)} ${esc(side.name)}</span>
    <span class="caption">${caption}</span>
    ${active ? `<span class="sr-only">${th("turn_of", { name: side.name })}</span>` : ""}`;
}

// Moves the pirate hat from one name to the other with a little hop.
function flyHat(fromRect, toHat) {
  if (!fromRect || !toHat || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const toRect = toHat.getBoundingClientRect();
  if (!toRect.width) return;
  const ghost = toHat.cloneNode();
  ghost.className = "hat-flying";
  Object.assign(ghost.style, {
    left: `${fromRect.left}px`,
    top: `${fromRect.top}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`,
  });
  document.body.appendChild(ghost);
  toHat.style.visibility = "hidden";
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) rotate(${dx >= 0 ? 200 : -200}deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg)` },
    ],
    { duration: 650, easing: "cubic-bezier(.45,.05,.4,1)" },
  );
  flight.onfinish = () => {
    ghost.remove();
    toHat.style.visibility = "";
  };
}

function gameScreen() {
  const built = ensureLayout();
  const { sides, mode, over } = match;
  if (!over) setMusic("battle");
  const { me, left, right } = boardSides();
  const status = sides.map((side) => (side.board ? arena.call("status", side.board) : null));

  // Names above the boards: the player who shoots next wears the hat.
  const active = over ? over.winner : match.attacker;
  const plates = { [left]: app.querySelector("#plate-left"), [right]: app.querySelector("#plate-right") };
  const previous = layout.active;
  const fromRect = previous != null && previous !== active ? plates[previous].querySelector(".hat")?.getBoundingClientRect() : null;
  for (const side of [left, right]) {
    const caption = me != null ? th(side === me ? "your_fleet" : "enemy_waters") : th("fleet_short");
    plates[side].innerHTML = plateHtml(sides[side], caption, side === active);
    plates[side].classList.toggle("active", side === active);
  }
  if (fromRect && active != null) flyHat(fromRect, plates[active].querySelector(".hat"));
  layout.active = active;

  // X-ray: the heat map a bot shot from last time (its optional last_info), drawn over the
  // board it is attacking. Only bots that publish a "heatmap" have one.
  const heatOn = (d) => {
    const attacker = sides[1 - d];
    return match.xray && !over && attacker.kind === "bot" ? attacker.lastInfo?.heatmap ?? null : null;
  };
  const freshFor = (d) => (match.fresh?.side === d ? match.fresh : null);

  if (status[left]) {
    renderBoard(app.querySelector("#board-left"), {
      size: match.size,
      view: status[left].view,
      fleet: status[left].fleet,
      theme: "light",
      heat: heatOn(left),
      last: match.last[left],
      fresh: freshFor(left),
    });
  }
  if (status[right]) {
    const myTurn = !over && !match.locked && !match.busy && me != null && match.attacker === me;
    renderBoard(app.querySelector("#board-right"), {
      size: match.size,
      view: status[right].view,
      fleet: me == null || over ? status[right].fleet : null,
      sunk: status[right].sunk,
      theme: "dark",
      hints: match.hints && me != null ? status[right].hints : null,
      heat: heatOn(right),
      last: match.last[right],
      fresh: freshFor(right),
      clickable: myTurn,
      crosshair: myTurn,
      pending: myTurn ? match.pending : null,
      pendingHint: t("tap_again"),
      onClick: (r, c, how) => humanShot(r, c, status[right].view, how),
    });
  }
  for (const [side, id] of [
    [left, "#afloat-left"],
    [right, "#afloat-right"],
  ]) {
    const box = app.querySelector(id);
    if (!status[side]) {
      box.innerHTML = "";
      continue;
    }
    const theme = side === left ? "light" : "dark";
    box.innerHTML = `<span class="afloat-label">${th("afloat")}</span>
      <span class="afloat-ships">${status[side].view.remaining.map((n) => miniShip(n, theme)).join("")}</span>
      <span class="shots-count">🎯 ${match.shots[1 - side]}</span>`;
  }

  // Controls and the ship's log (the log is a record, the parrot does the talking).
  const hasBot = sides.some((side) => side.kind === "bot");
  const xrayNames = sides.filter((side) => side.kind === "bot" && side.lastInfo?.heatmap).map((side) => side.name);
  const log = match.log
    .slice()
    .reverse()
    .map((entry) => `<li>${th(entry.key, entry.vars)}</li>`)
    .join("");
  const sidePanel = app.querySelector("#game-side");
  sidePanel.innerHTML = `
    <div class="controls">
      <label class="toggle"><input type="checkbox" id="hints"${match.hints ? " checked" : ""}> ${th("hints")}</label>
      ${hasBot ? `<label class="toggle"><input type="checkbox" id="xray"${match.xray ? " checked" : ""}> ${th("xray")}</label>` : ""}
      <span class="grow"></span>
      ${
        over
          ? `<button id="celebrate">${th("end_replay")}</button>
             <button id="again" class="primary">${th("play_again")}</button>
             <button id="menu">${th("back_menu")}</button>`
          : `<button id="abandon">${th("abandon")}</button>`
      }
    </div>
    ${match.xray && hasBot ? `<p class="help">${xrayNames.length ? th("xray_help", { names: xrayNames.join(", ") }) : th("xray_none")}</p>` : ""}
    <details class="log"${layout.logOpen ? " open" : ""}><summary>📜 ${th("log_title")}</summary><ol>${log}</ol></details>`;

  sidePanel.querySelector("#hints").addEventListener("change", (event) => {
    match.hints = event.target.checked;
    gameScreen();
  });
  sidePanel.querySelector("#xray")?.addEventListener("change", (event) => {
    match.xray = event.target.checked;
    gameScreen();
  });
  sidePanel.querySelector(".log").addEventListener("toggle", (event) => {
    if (layout) layout.logOpen = event.target.open;
  });
  sidePanel.querySelector("#abandon")?.addEventListener("click", () => {
    stopMatch();
    leaveGame();
    match = null;
    show(menuScreen);
  });
  sidePanel.querySelector("#celebrate")?.addEventListener("click", () => showEnd(match));
  sidePanel.querySelector("#again")?.addEventListener("click", startMatch);
  sidePanel.querySelector("#menu")?.addEventListener("click", () => {
    leaveGame();
    match = null;
    show(menuScreen);
  });

  // "Your turn!" when the battle starts with you, and in hot-seat games once the next
  // player has the device (after a shot, fire() decides).
  if (built) announceTurn();
}

// --- boot -------------------------------------------------------------------------------

async function boot() {
  setLang(getLang());
  renderHeader();
  updateMusic(); // silent until the first click with sound on
  const loading = (key) => {
    current = () => loading(key);
    app.innerHTML = `<div class="loading"><div class="spinner"></div><p>${th(key)}</p></div>`;
  };
  loading("loading_python");
  try {
    arena = await startArena(loading);
    const defaults = arena.call("defaults");
    settings.size = defaults.size;
    settings.fleet = defaults.fleet;
    players = arena.call("list_players").players;
    const names = players.map((p) => p.name);
    for (const key of ["opponent", "botA", "botB"]) {
      if (!names.includes(settings[key])) settings[key] = names[names.length - 1];
    }
    for (const src of ["img/pirate-happy.webp", "img/pirate-sad.webp"]) new Image().src = src; // end screens
    show(menuScreen);
  } catch (error) {
    console.error(error);
    current = () => {
      app.innerHTML = `<p class="error">${th("load_failed")} ${esc(error.message)}</p>`;
    };
    current();
  }
}

boot();
