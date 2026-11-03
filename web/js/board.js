// Draws a board: an ocean grid, illustrated ships underneath, shot marks on top.
// Pure presentation: every state shown here was computed in Python.

import { columnLabel, rowLabel, toCoord } from "./coords.js";
import { shipPlacement, shipSvg } from "./ships.js";

// Cell codes of battleship.game views (data format, not rules).
export const UNKNOWN = 0;
export const MISS = 1;
export const HIT = 2;
export const SUNK = 3;

// "C7"-style names (see coords.js), used by the messages and the ship's log.
export const coord = toCoord;

// Shot marks. Water: rings on the sea. Hit: a painted red X. A sunk ship's cells keep a
// dark, burnt X (and the wreck shows underneath), so the three never look alike.
const WATER = `
  <svg class="mark water" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="15" class="ring r1"/>
    <circle cx="20" cy="20" r="9" class="ring r2"/>
    <circle cx="20" cy="20" r="3.6" class="drop"/>
  </svg>`;

const CROSS = (kind) => `
  <svg class="mark ${kind}" viewBox="0 0 40 40" aria-hidden="true">
    <path class="x-edge" d="M9 8 L32 31 M31 8 L8 32"/>
    <path class="x-paint" d="M9 8 L32 31 M31 8 L8 32"/>
    <path class="x-shine" d="M11 9.5 L19 17.5 M29.5 9.5 L24 15"/>
  </svg>`;
const HIT_X = CROSS("hit-x");
const SUNK_X = CROSS("sunk-x");

const CROSSHAIR = `
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <g class="ring-outer"><circle cx="50" cy="50" r="44" stroke-dasharray="20 7.6"/></g>
    <circle cx="50" cy="50" r="20"/>
    <path d="M50 2 V34 M50 66 V98 M2 50 H34 M66 50 H98"/>
    <circle cx="50" cy="50" r="3" class="dot"/>
  </svg>`;

function key(r, c) {
  return `${r},${c}`;
}

function shipKey(cells) {
  return cells.map(([r, c]) => key(r, c)).sort().join(" ");
}

function shipHtml(cells, classes, theme) {
  const { row, col, length, orientation } = shipPlacement(cells);
  const area =
    orientation === "V"
      ? `grid-row:${row + 1} / span ${length};grid-column:${col + 1}`
      : `grid-row:${row + 1};grid-column:${col + 1} / span ${length}`;
  return `<div class="ship ${orientation === "V" ? "vertical" : "horizontal"} ${classes}" style="${area}">${shipSvg(length, orientation, theme)}</div>`;
}

// Centres `el` over `cell` (both inside the cells layer).
function placeOver(el, cell, top = false) {
  el.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
  el.style.top = `${top ? cell.offsetTop : cell.offsetTop + cell.offsetHeight / 2}px`;
}

// Touch screens have no hover: the first tap picks a cell (opts.pending) and pins the
// sight on it with a hint; tapping it again fires.
function pinPending(container) {
  const opts = container._opts;
  if (!opts?.pending) return false;
  const cell = container.querySelector(`.cell[data-r="${opts.pending[0]}"][data-c="${opts.pending[1]}"]`);
  const sight = container.querySelector(".crosshair");
  const tag = container.querySelector(".coord-tag");
  if (!cell) return false;
  if (sight) {
    placeOver(sight, cell);
    sight.classList.add("on", "pinned");
  }
  if (tag) {
    tag.textContent = opts.pendingHint ? `${toCoord(...opts.pending)} · ${opts.pendingHint}` : toCoord(...opts.pending);
    placeOver(tag, cell, true);
    tag.classList.add("on");
  }
  return true;
}

// opts: {size, view?, fleet? (ships to draw), sunk? (sunk ships to draw), theme?,
//        hints?, heat?, preview? {cells, ok}, last? [r, c], clickable?, crosshair?,
//        pending? [r, c] and pendingHint? (a touch target waiting for its second tap),
//        fresh? {cell: [r, c], outcome} (animate the shot that just landed),
//        onClick?(r, c, {touch}), onHover?(r, c), onLeave?(), onContext?()}
export function renderBoard(container, opts) {
  const { size } = opts;
  const theme = opts.theme ?? "light";
  const cells = opts.view?.cells;
  const state = (r, c) => (cells ? cells[r][c] : UNKNOWN);
  const fresh = opts.fresh ? key(...opts.fresh.cell) : null;
  const last = opts.last ? key(...opts.last) : null;
  const preview = new Set((opts.preview?.cells || []).map(([r, c]) => key(r, c)));
  const heatMax = opts.heat ? Math.max(1, ...opts.heat.flat()) : 1;

  // Ships: afloat ones from `fleet`, sunk ones from `fleet` or `sunk` (no duplicates).
  const ships = new Map();
  for (const ship of opts.fleet || []) ships.set(shipKey(ship), ship);
  for (const ship of opts.sunk || []) ships.set(shipKey(ship), ship);
  const shipParts = [];
  for (const ship of ships.values()) {
    const sunk = cells && ship.every(([r, c]) => state(r, c) === SUNK);
    let classes = sunk ? "sunk" : "afloat";
    if (sunk && opts.fresh?.outcome === "sunk" && ship.some(([r, c]) => key(r, c) === fresh)) {
      classes = "sunk sinking";
    }
    shipParts.push(shipHtml(ship, classes, theme));
  }
  if (opts.preview?.cells?.length) {
    shipParts.push(shipHtml(opts.preview.cells, `ghost ${opts.preview.ok ? "ok" : "bad"}`, theme));
  }

  const cellParts = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = key(r, c);
      const s = state(r, c);
      const classes = ["cell"];
      let inner = "";
      let style = "";
      if (s === MISS) {
        classes.push("miss");
        inner = WATER;
      } else if (s === HIT) {
        classes.push("hit");
        inner = HIT_X;
      } else if (s === SUNK) {
        classes.push("sunk");
        inner = SUNK_X;
      } else {
        if (opts.hints?.[r]?.[c]) classes.push("hint");
        if (opts.clickable) classes.push("clickable");
        if (opts.heat) {
          style = ` style="--heat:${(opts.heat[r][c] / heatMax).toFixed(3)}"`;
          classes.push("heat");
        }
      }
      if (preview.has(k)) classes.push(opts.preview.ok ? "preview-ok" : "preview-bad");
      if (k === last) classes.push("last");
      if (k === fresh) classes.push("fresh");
      cellParts.push(`<div class="${classes.join(" ")}" data-r="${r}" data-c="${c}"${style}>${inner}</div>`);
    }
  }

  // Like a board game: letters above the columns, numbers beside the rows, the sea inside.
  container.classList.add("board-grid");
  container.classList.toggle("aiming", Boolean(opts.crosshair));
  container.classList.remove("locked");
  container.style.setProperty("--size", size);
  const columns = `repeat(${size}, var(--cell))`;
  const colLabels = Array.from({ length: size }, (_, c) => `<span data-c="${c}">${columnLabel(c)}</span>`).join("");
  const rowLabels = Array.from({ length: size }, (_, r) => `<span data-r="${r}">${rowLabel(r)}</span>`).join("");
  container.innerHTML = `
    <span class="labels-corner" aria-hidden="true"></span>
    <div class="labels-cols" aria-hidden="true" style="grid-template-columns:${columns}">${colLabels}</div>
    <div class="labels-rows" aria-hidden="true" style="grid-template-rows:${columns}">${rowLabels}</div>
    <div class="board ocean">
      <div class="waves" aria-hidden="true"></div>
      <div class="ships-layer" style="grid-template-columns:${columns};grid-template-rows:${columns}">${shipParts.join("")}</div>
      <div class="cells-layer" style="grid-template-columns:${columns}">${cellParts.join("")}
        <div class="coord-tag" aria-hidden="true"></div>
        ${opts.crosshair ? `<div class="crosshair">${CROSSHAIR}</div>` : ""}</div>
    </div>`;
  container._opts = opts;
  pinPending(container);

  if (!container._wired) {
    container._wired = true;
    const target = (event) => {
      const cell = event.target.closest(".cell");
      return cell ? [Number(cell.dataset.r), Number(cell.dataset.c)] : null;
    };
    // Hovering a cell lights up its letter and number and shows its name ("C7").
    const mark = (cell) => {
      for (const label of container.querySelectorAll(".labels-cols .hot, .labels-rows .hot")) label.classList.remove("hot");
      const tag = container.querySelector(".coord-tag");
      if (!cell || !tag) {
        tag?.classList.remove("on");
        return;
      }
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      container.querySelector(`.labels-cols [data-c="${c}"]`)?.classList.add("hot");
      container.querySelector(`.labels-rows [data-r="${r}"]`)?.classList.add("hot");
      tag.textContent = toCoord(r, c);
      placeOver(tag, cell, true);
      tag.classList.add("on");
    };
    const aim = (cell) => {
      const sight = container.querySelector(".crosshair");
      if (!sight) return;
      const allowed = cell?.classList.contains("clickable") && !container.classList.contains("locked");
      if (!allowed) {
        sight.classList.remove("on");
        return;
      }
      placeOver(sight, cell);
      sight.classList.add("on");
    };
    // Remember whether the last press was a finger, so a tap can ask for confirmation.
    container.addEventListener("pointerdown", (event) => {
      container._lastPointer = event.pointerType;
    });
    container.addEventListener("click", (event) => {
      if (container.classList.contains("locked")) return;
      const at = target(event);
      if (at) container._opts.onClick?.(...at, { touch: container._lastPointer === "touch" });
    });
    container.addEventListener("mouseover", (event) => {
      const cell = event.target.closest(".cell");
      // Touch browsers send emulated mouseovers (even at stale positions) after a tap:
      // with a target picked by finger, the sight and its label stay on that target.
      if (container._lastPointer === "touch" && container._opts.pending) {
        pinPending(container);
        return;
      }
      mark(cell);
      aim(cell);
      const at = target(event);
      if (at) container._opts.onHover?.(...at);
    });
    container.addEventListener("mouseleave", () => {
      mark(null);
      aim(null);
      pinPending(container); // a picked touch target stays marked
      container._opts.onLeave?.();
    });
    container.addEventListener("contextmenu", (event) => {
      if (container._opts.onContext) {
        event.preventDefault();
        container._opts.onContext();
      }
    });
  }
}

// Stop accepting shots on a board without redrawing it (keeps running animations alive).
export function lockBoard(container) {
  container.classList.add("locked");
  container.querySelector(".crosshair")?.classList.remove("on");
}

// The on-screen centre and size of one cell, for effects drawn over the board.
export function cellRect(container, r, c) {
  const cell = container.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  return cell ? cell.getBoundingClientRect() : container.getBoundingClientRect();
}
