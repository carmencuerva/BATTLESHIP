// Screens and turn orchestration. Rules, legality and bots all run in Python (webglue);
// this file only decides what to draw and when to ask Python for the next move.

import { startArena } from "../pyodide-bootstrap.js";
import { coord, renderBoard, UNKNOWN } from "./board.js";
import { getLang, setLang, t } from "./i18n.js";

const app = document.getElementById("app");
const SPEEDS = { slow: 900, normal: 400, fast: 60 };

let arena = null;
let players = [];
let current = () => {}; // re-renders the visible screen (e.g. after a language change)
let keyHandler = null;
let match = null;
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

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// t() with every variable HTML-escaped, for use inside innerHTML.
function th(key, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  return t(key, safe);
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function playerByName(name) {
  return players.find((p) => p.name === name);
}

function show(render) {
  current = render;
  keyHandler = null;
  render();
}

document.addEventListener("keydown", (event) => keyHandler?.(event));

// --- header ----------------------------------------------------------------------------

function renderHeader() {
  document.getElementById("nav-play").textContent = t("nav_play");
  document.getElementById("nav-about").textContent = t("nav_about");
  document.getElementById("lang").textContent = getLang() === "es" ? "EN" : "ES";
}

document.getElementById("lang").addEventListener("click", () => {
  setLang(getLang() === "es" ? "en" : "es");
  renderHeader();
  current();
});
document.getElementById("nav-play").addEventListener("click", () => {
  if (arena) {
    stopMatch();
    show(menuScreen);
  }
});
document.getElementById("nav-about").addEventListener("click", () => {
  if (match && !match.over) return; // do not leave a live game by accident
  show(aboutScreen);
});

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
      <ul class="players">${players
        .map((p) => `<li>${esc(p.icon)} <b>${esc(p.name)}</b> — ${esc(p.description)} <small>(${esc(p.authors.join(", "))})</small></li>`)
        .join("")}</ul>
    </section>`;
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

function startMatch() {
  stopMatch();
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
    locked: false,
    hints: true,
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
        return `<button class="${classes.join(" ")}" data-k="${k}"><span class="bar" style="--len:${length}"></span>${length}</button>`;
      })
      .join("");
    app.innerHTML = `
      <section class="panel placement">
        <h2>${th("place_title", { name: side.name })}</h2>
        <p class="help">${th("place_help")}</p>
        <div class="place-layout">
          <div id="place-board"></div>
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

function beginBattle() {
  match.attacker = Math.random() < 0.5 ? 0 : 1;
  match.viewer = match.mode === "hvb" ? 0 : match.attacker;
  match.log.push({ key: "first_shooter", vars: { name: match.sides[match.attacker].name } });
  if (match.mode === "hvh") show(() => passScreen(match.attacker, () => show(gameScreen)));
  else show(gameScreen);
  continueTurn(false);
}

function forfeit(i, reason) {
  match.over = { winner: 1 - i, forfeit: i, reason };
  stopMatch();
  show(gameScreen);
}

function fire(shot) {
  const a = match.attacker;
  const d = 1 - a;
  const res = arena.call("shoot", match.sides[d].board, shot, a);
  if (res.error) {
    if (match.sides[a].kind === "bot") forfeit(a, res.error);
    return;
  }
  match.sides[d].board = res.board;
  match.shots[a] += 1;
  match.last[d] = shot;
  const key = { miss: "shot_miss", hit: "shot_hit", sunk: "shot_sunk" }[res.result.outcome];
  match.log.push({ key, vars: { name: match.sides[a].name, cell: coord(...shot), length: res.result.length } });
  if (res.terminal) {
    match.over = { winner: a };
    stopMatch();
    show(gameScreen);
    return;
  }
  match.attacker = res.next;
  gameScreen();
  continueTurn(res.next !== a);
}

function continueTurn(changed) {
  if (match.over) return;
  const side = match.sides[match.attacker];
  if (side.kind === "bot") {
    match.timer = setTimeout(botTurn, SPEEDS[settings.speed] ?? SPEEDS.normal);
  } else if (match.mode === "hvh" && changed) {
    match.locked = true;
    gameScreen();
    match.timer = setTimeout(() => {
      const next = match.attacker;
      show(() =>
        passScreen(next, () => {
          match.viewer = next;
          match.locked = false;
          show(gameScreen);
        }),
      );
    }, 1200);
  }
}

function botTurn() {
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
  if (match.over || match.locked || match.attacker !== me || match.sides[me].kind !== "human") return;
  if (view.cells[r][c] !== UNKNOWN) return;
  fire([r, c]);
}

function remainingHtml(view) {
  return view.remaining.map((length) => `<span class="bar" style="--len:${length}" title="${length}"></span>`).join("");
}

function boardPanel(id, title, status, extra = "") {
  return `
    <div class="board-panel">
      <h3>${title}</h3>
      <div id="${id}"></div>
      <div class="afloat"><span>${th("afloat")}:</span> ${remainingHtml(status.view)} ${extra}</div>
    </div>`;
}

function gameScreen() {
  const { sides, mode, over } = match;
  const status = sides.map((side) => (side.board ? arena.call("status", side.board) : null));
  const me = mode === "bvb" ? null : match.viewer;

  let banner = "";
  if (over) {
    const text =
      over.forfeit != null
        ? `${th("forfeit", { name: sides[over.forfeit].name, reason: over.reason })}<br>${th("winner", { name: sides[over.winner].name })}`
        : th("winner", { name: sides[over.winner].name });
    banner = `<div class="banner">${text}
      <div class="buttons"><button id="again" class="primary">${th("play_again")}</button>
      <button id="menu">${th("back_menu")}</button></div></div>`;
  } else if (match.attacker != null) {
    const attacker = sides[match.attacker];
    banner =
      attacker.kind === "human" && match.attacker === me && !match.locked
        ? `<div class="turn mine">${th("turn_you")}</div>`
        : `<div class="turn">${th("turn_of", { name: `${attacker.icon} ${attacker.name}` })}</div>`;
  }

  // Left: the viewer's own fleet (or side 0 for spectators). Right: the other side.
  const left = me ?? 0;
  const right = 1 - left;
  const leftTitle = me != null ? th("your_fleet") : th("fleet_of", { name: `${sides[0].icon} ${sides[0].name}` });
  const rightTitle =
    me != null ? th("enemy_waters") : th("fleet_of", { name: `${sides[1].icon} ${sides[1].name}` });
  const log = match.log
    .slice(-10)
    .reverse()
    .map((entry) => `<li>${th(entry.key, entry.vars)}</li>`)
    .join("");

  app.innerHTML = `
    <section class="game">
      ${banner}
      <div class="boards">
        ${status[left] ? boardPanel("board-left", leftTitle, status[left], `· ${th("shots")}: ${match.shots[right]}`) : ""}
        ${status[right] ? boardPanel("board-right", rightTitle, status[right], `· ${th("shots")}: ${match.shots[left]}`) : ""}
      </div>
      <div class="game-side">
        <label class="check"><input type="checkbox" id="hints"${match.hints ? " checked" : ""}> ${th("hints")}</label>
        <ol class="log">${log}</ol>
        ${over ? "" : `<button id="abandon">${th("abandon")}</button>`}
      </div>
    </section>`;

  if (status[left]) {
    renderBoard(app.querySelector("#board-left"), {
      size: match.size,
      view: status[left].view,
      fleet: status[left].fleet,
      last: match.last[left],
    });
  }
  if (status[right]) {
    const myTurn = !over && !match.locked && me != null && match.attacker === me;
    renderBoard(app.querySelector("#board-right"), {
      size: match.size,
      view: status[right].view,
      fleet: me == null || over ? status[right].fleet : null,
      hints: match.hints && me != null ? status[right].hints : null,
      last: match.last[right],
      clickable: myTurn,
      onClick: (r, c) => humanShot(r, c, status[right].view),
    });
  }

  app.querySelector("#hints").addEventListener("change", (event) => {
    match.hints = event.target.checked;
    gameScreen();
  });
  app.querySelector("#abandon")?.addEventListener("click", () => {
    stopMatch();
    match = null;
    show(menuScreen);
  });
  app.querySelector("#again")?.addEventListener("click", startMatch);
  app.querySelector("#menu")?.addEventListener("click", () => {
    match = null;
    show(menuScreen);
  });
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
