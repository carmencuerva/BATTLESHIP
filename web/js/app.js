// Screens and turn orchestration. Rules, legality and bots all run in Python (webglue);
// this file only decides what to draw and when to ask Python for the next move.

import { startArena } from "../pyodide-bootstrap.js";
import { cellRect, coord, lockBoard, renderBoard, UNKNOWN } from "./board.js";
import { closeEndScreen, showEndScreen } from "./endscreen.js";
import { bubbles, explode, launchMissile, splash } from "./fx.js";
import { esc, th } from "./html.js";
import { getLang, setLang, t } from "./i18n.js";
import { leaderboardHtml } from "./leaderboard.js";
import { createParrot } from "./parrot.js";
import { miniShip } from "./ships.js";

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
  nameA: "",
  nameB: "",
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
  render();
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

function playerOptions(selected) {
  return players
    .map(
      (p) =>
        `<option value="${esc(p.name)}"${p.name === selected ? " selected" : ""}>` +
        `${esc(p.icon)} ${esc(p.name)}${p.description ? ` — ${esc(p.description)}` : ""}</option>`,
    )
    .join("");
}

function menuScreen() {
  const mode = (value) =>
    `<label class="radio"><input type="radio" name="mode" value="${value}"` +
    `${settings.mode === value ? " checked" : ""}> ${th(`mode_${value}`)}</label>`;
  let fields = "";
  if (settings.mode === "hvb") {
    fields = `<label>${th("opponent")}<select id="opponent">${playerOptions(settings.opponent)}</select></label>`;
  } else if (settings.mode === "bvb") {
    fields =
      `<label>${th("bot_a")}<select id="bot-a">${playerOptions(settings.botA)}</select></label>` +
      `<label>${th("bot_b")}<select id="bot-b">${playerOptions(settings.botB)}</select></label>`;
  } else {
    fields =
      `<label>${th("name_a")}<input id="name-a" maxlength="20" value="${esc(settings.nameA)}" placeholder="${th("name_a")}"></label>` +
      `<label>${th("name_b")}<input id="name-b" maxlength="20" value="${esc(settings.nameB)}" placeholder="${th("name_b")}"></label>`;
  }
  const speed = (value) =>
    `<option value="${value}"${settings.speed === value ? " selected" : ""}>${th(`speed_${value}`)}</option>`;

  app.innerHTML = `
    <section class="panel menu">
      <h2>${th("menu_title")}</h2>
      <fieldset><legend>${th("mode")}</legend>${mode("hvb")}${mode("bvb")}${mode("hvh")}</fieldset>
      <div class="fields">${fields}</div>
      <div class="fields">
        <label>${th("board_size")}<input id="size" type="number" min="5" max="15" value="${settings.size}"></label>
        <label>${th("fleet")}<input id="fleet" value="${settings.fleet.join(",")}"></label>
        <label>${th("speed")}<select id="speed">${speed("slow")}${speed("normal")}${speed("fast")}</select></label>
      </div>
      <p class="rules">${th("rules_short")}</p>
      <button id="start" class="primary">${th("start")}</button>
      <p id="menu-error" class="error"></p>
    </section>`;

  const readForm = () => {
    settings.opponent = app.querySelector("#opponent")?.value ?? settings.opponent;
    settings.botA = app.querySelector("#bot-a")?.value ?? settings.botA;
    settings.botB = app.querySelector("#bot-b")?.value ?? settings.botB;
    settings.nameA = app.querySelector("#name-a")?.value.trim() ?? settings.nameA;
    settings.nameB = app.querySelector("#name-b")?.value.trim() ?? settings.nameB;
    settings.size = Number(app.querySelector("#size").value);
    settings.fleet = app
      .querySelector("#fleet")
      .value.split(",")
      .map((x) => Number(x.trim()));
    settings.speed = app.querySelector("#speed").value;
  };
  app.querySelectorAll('input[name="mode"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      readForm();
      settings.mode = radio.value;
      menuScreen();
    }),
  );
  app.querySelector("#start").addEventListener("click", () => {
    readForm();
    const check = arena.call("check_fleet", settings.size, settings.fleet);
    if (!check.ok) {
      app.querySelector("#menu-error").textContent = t("bad_fleet", { reason: check.reason });
      return;
    }
    startMatch();
  });
}

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
}

// --- tournament in the browser ---------------------------------------------------------

function tournamentScreen() {
  if (!tour) {
    tour = {
      players: players.map((p) => p.name),
      games: 10,
      seed: 0,
      format: "league",
      status: "idle", // idle | running | stopped | done
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
      <p id="tour-progress">${th(running ? "tournament_progress" : "tournament_stopped", { done: tour.done, total: tour.total })}</p>
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
        <label>${th("format")}<select id="tour-format"${dis}>${format("league")}${format("simple")}</select></label>
      </div>
      ${running ? `<button id="tour-stop">${th("stop")}</button>` : `<button id="tour-run" class="primary">${th("run_tournament")}</button>`}
      <p class="error">${esc(tour.error)}</p>
      ${status}
    </section>`;

  app.querySelector("#tour-stop")?.addEventListener("click", () => {
    tour.status = "stopped";
  });
  app.querySelector("#tour-run")?.addEventListener("click", () => {
    tour.players = [...app.querySelectorAll(".pick:checked")].map((box) => box.value);
    tour.games = Number(app.querySelector("#tour-games").value);
    tour.seed = Number(app.querySelector("#tour-seed").value);
    tour.format = app.querySelector("#tour-format").value;
    runTournament();
  });
}

async function runTournament() {
  const config = {
    players: tour.players,
    games_per_pair: tour.games,
    seed: tour.seed,
    format: tour.format,
    size: settings.size,
    fleet: settings.fleet,
  };
  const plan = arena.call("tournament_plan", config);
  if (plan.error) {
    tour.error = plan.error;
    tournamentScreen();
    return;
  }
  Object.assign(tour, { status: "running", done: 0, total: plan.games.length, result: null, error: "" });
  const mine = screen;
  tournamentScreen();
  const records = [];
  for (const [i, j, spec] of plan.games) {
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
    records.push(arena.call("tournament_game", [plan.players[i], plan.players[j]], spec));
    tour.done = records.length;
    const pct = Math.round((100 * tour.done) / tour.total);
    const bar = app.querySelector("#tour-bar");
    if (bar) bar.value = pct;
    const label = app.querySelector("#tour-progress");
    if (label) label.textContent = t("tournament_progress", { done: tour.done, total: tour.total });
  }
  tour.result = arena.call("tournament_standings", config, plan.games, records);
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
  const names = kinds.map((kind, i) => {
    if (kind === "bot") {
      const label = bots[i];
      return mode === "bvb" && bots[0] === bots[1] ? `${label} (${"AB"[i]})` : label;
    }
    if (mode === "hvb") return t("you");
    return (i === 0 ? settings.nameA : settings.nameB) || t(i === 0 ? "name_a" : "name_b");
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
    fresh: null, // the shot to animate on the next draw
    endShown: false,
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

function placementScreen(i) {
  const side = match.sides[i];
  const { size, fleet } = match;
  const ed = { placement: fleet.map(() => null), selected: 0, orient: "H", hover: null, message: "" };

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

  function drawBoard() {
    const base = layout(ed.placement);
    const cand = candidate();
    let preview = null;
    if (cand) {
      const result = layout(cand);
      preview = { cells: result.ships[ed.selected] ?? [], ok: result.ok, reason: result.reason };
    }
    renderBoard(app.querySelector("#place-board"), {
      size,
      fleet: base.ships.filter(Boolean),
      preview,
      clickable: true,
      onHover: (r, c) => {
        if (ed.hover && ed.hover[0] === r && ed.hover[1] === c) return;
        ed.hover = [r, c];
        drawBoard();
      },
      onLeave: () => {
        ed.hover = null;
        drawBoard();
      },
      onContext: rotate,
      onClick: (r, c) => click(r, c, base, preview),
    });
    app.querySelector("#ready").disabled = !base.complete;
    app.querySelector("#place-msg").textContent = ed.message;
  }

  function click(r, c, base, preview) {
    const owner = base.ships.findIndex((cells) => cells?.some(([x, y]) => x === r && y === c));
    if (owner !== -1) {
      ed.placement[owner] = null;
      ed.selected = owner;
      ed.message = "";
    } else if (ed.selected !== null && preview?.ok) {
      ed.placement[ed.selected] = [r, c, ed.orient];
      ed.selected = nextUnplaced();
      ed.message = "";
    } else if (preview && !preview.ok) {
      ed.message = preview.reason ?? "";
    }
    drawAll();
  }

  function rotate() {
    ed.orient = ed.orient === "H" ? "V" : "H";
    drawAll();
  }

  function drawAll() {
    const ships = fleet
      .map((length, k) => {
        const classes = ["ship-pick", ed.placement[k] ? "placed" : "", ed.selected === k ? "selected" : ""];
        return `<button class="${classes.join(" ")}" data-k="${k}">${miniShip(length)}<span>${length}</span></button>`;
      })
      .join("");
    app.innerHTML = `
      <section class="panel placement">
        <h2>${th("place_title", { name: side.name })}</h2>
        <p class="help">${th("place_help")}</p>
        <div class="place-layout">
          <div class="board-frame"><div id="place-board"></div></div>
          <div class="side">
            <div class="ship-list">${ships}</div>
            <p>${th(ed.orient === "H" ? "horizontal" : "vertical")}</p>
            <div class="buttons">
              <button id="rotate">${th("rotate")} (R)</button>
              <button id="random">${th("random")}</button>
              <button id="clear">${th("clear")}</button>
            </div>
            <button id="ready" class="primary">${th("ready")}</button>
            <p id="place-msg" class="error"></p>
          </div>
        </div>
      </section>`;
    app.querySelectorAll(".ship-pick").forEach((button) =>
      button.addEventListener("click", () => {
        const k = Number(button.dataset.k);
        ed.placement[k] = null;
        ed.selected = k;
        drawAll();
      }),
    );
    app.querySelector("#rotate").addEventListener("click", rotate);
    app.querySelector("#random").addEventListener("click", () => {
      ed.placement = arena.call("random_layout", size, fleet, randomSeed());
      ed.selected = null;
      ed.message = "";
      drawAll();
    });
    app.querySelector("#clear").addEventListener("click", () => {
      ed.placement = fleet.map(() => null);
      ed.selected = 0;
      drawAll();
    });
    app.querySelector("#ready").addEventListener("click", () => {
      side.board = arena.call("new_board", size, fleet, ed.placement);
      nextPlacement();
    });
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

// The parrot speaks plain text (it is set with textContent, never as HTML).
function say(key, vars = {}, options = {}) {
  layout?.parrot.say(t(key, vars), options);
}

function sayTurn() {
  const side = match.sides[match.attacker];
  if (match.mode === "hvb") say(side.kind === "human" ? "p_your_turn" : "p_opp_turn", {}, { mood: "turn" });
  else if (match.mode === "hvh") say("p_your_turn_named", { name: side.name }, { mood: "turn" });
  else say("p_turn_of", { name: side.name }, { mood: "turn" });
}

function leaveGame() {
  closeEndScreen();
  layout?.parrot.destroy();
  layout = null;
}

function beginBattle() {
  match.attacker = Math.random() < 0.5 ? 0 : 1;
  match.viewer = match.mode === "hvb" ? 0 : match.attacker;
  match.log.push({ key: "first_shooter", vars: { name: match.sides[match.attacker].name } });
  if (match.mode === "hvh") show(() => passScreen(match.attacker, () => show(gameScreen)));
  else show(gameScreen);
  continueTurn(true);
}

function forfeit(i, reason) {
  match.over = { winner: 1 - i, forfeit: i, reason };
  stopMatch();
  show(gameScreen);
  say("p_forfeit", { name: match.sides[i].name }, { mood: "info", sub: reason });
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
    if (m.mode === "hvh" && changed) m.locked = true; // the device changes hands first
  }
  m.busy = false;

  // 3. Draw the new boards once, with this shot's effect, then announce it.
  m.fresh = { side: d, cell: shot, outcome };
  gameScreen();
  m.fresh = null;
  const landed = boardEl(d);
  if (landed) {
    const rect = cellRect(landed, ...shot);
    if (outcome === "miss") splash(rect);
    else explode(rect, outcome === "sunk");
    const sinking = landed.querySelector(".ship.sinking");
    if (sinking) bubbles(sinking.getBoundingClientRect());
  }
  if (outcome === "miss") say("p_miss", {}, { mood: "miss" });
  else if (outcome === "hit") say("p_hit", {}, { mood: "hit" });
  else say("p_sunk", {}, { mood: "sunk", sub: t("p_sunk_sub", { length: res.result.length }) });

  if (res.terminal) {
    stopMatch();
    finishGame(1900);
    return;
  }
  if (changed && m.mode !== "hvh") sayTurn();
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

function humanShot(r, c, view) {
  const me = match.viewer;
  if (match.over || match.locked || match.busy) return;
  if (match.attacker !== me || match.sides[me].kind !== "human") return;
  if (view.cells[r][c] !== UNKNOWN) return;
  fire([r, c]);
}

// --- end of the game ---------------------------------------------------------------------

function finishGame(delay) {
  const m = match;
  if (m.endShown) return; // exactly one end sequence per match
  m.endShown = true;
  setTimeout(() => {
    if (match === m) showEnd(m);
  }, delay);
}

function showEnd(m) {
  const w = m.over.winner;
  const winner = m.sides[w];
  const loser = m.sides[1 - w];
  // Only a human playing a bot can lose; otherwise the screen celebrates the winner.
  const kind = m.mode === "hvb" && winner.kind !== "human" ? "defeat" : "victory";
  let sub;
  if (m.over.forfeit != null) sub = t("end_forfeit", { name: loser.name });
  else if (kind === "defeat") sub = t("end_defeat_sub", { name: winner.name, shots: m.shots[w] });
  else if (m.mode === "hvb") sub = t("end_victory_sub", { shots: m.shots[w] });
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
  if (layout?.key === key && app.contains(layout.dock)) return false;
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
  const dock = app.querySelector("#parrot-dock");
  layout = { key, dock, parrot: createParrot(dock), active: null, logOpen: false };
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
      onClick: (r, c) => humanShot(r, c, status[right].view),
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

  if (built && !over && match.attacker != null && !match.locked) sayTurn();
}

// --- boot -------------------------------------------------------------------------------

async function boot() {
  setLang(getLang());
  renderHeader();
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
