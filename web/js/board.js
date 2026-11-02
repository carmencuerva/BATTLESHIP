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

const FLAME = `
  <svg class="flame" viewBox="0 0 40 50" aria-hidden="true">
    <path class="f-out" d="M20 2 C24 12 34 16 33 30 C33 42 26 48 20 48 C12 48 6 42 6 31 C6 22 12 19 13 11 C17 16 17 20 18 22 C20 15 18 8 20 2 Z" fill="#ff5a1f"/>
    <path class="f-mid" d="M20 16 C23 23 29 26 28 35 C28 42 24 46 20 46 C15 46 11 42 11 36 C11 30 15 28 16 23 C18 27 18 29 19 30 C20 26 19 21 20 16 Z" fill="#ffae1a"/>
    <path class="f-in" d="M20 30 C22 34 25 36 24 41 C24 44 22 46 20 46 C17 46 15 44 15 41 C15 38 18 36 20 30 Z" fill="#fff3a0"/>
  </svg>`;

const CROSSHAIR = `
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <g class="ring-outer"><circle cx="50" cy="50" r="44"/>
      <path d="M50 2 v10 M50 88 v10 M2 50 h10 M88 50 h10" stroke-width="5"/></g>
    <circle cx="50" cy="50" r="29"/>
    <circle cx="50" cy="50" r="14"/>
    <path d="M50 14 V38 M50 62 V86 M14 50 H38 M62 50 H86" stroke-width="3"/>
    <circle cx="50" cy="50" r="2.6" class="dot"/>
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

// opts: {size, view?, fleet? (ships to draw), sunk? (sunk ships to draw), theme?,
//        hints?, heat?, preview? {cells, ok}, last? [r, c], clickable?, crosshair?,
//        fresh? {cell: [r, c], outcome} (animate the shot that just landed),
//        onClick?(r, c), onHover?(r, c), onLeave?(), onContext?()}
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
        inner = `<span class="splash-dot"></span>`;
      } else if (s === HIT) {
        classes.push("hit");
        inner = FLAME;
      } else if (s === SUNK) {
        classes.push("sunk");
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
      tag.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
      tag.style.top = `${cell.offsetTop}px`;
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
      sight.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
      sight.style.top = `${cell.offsetTop + cell.offsetHeight / 2}px`;
      sight.classList.add("on");
    };
    container.addEventListener("click", (event) => {
      if (container.classList.contains("locked")) return;
      const at = target(event);
      if (at) container._opts.onClick?.(...at);
    });
    container.addEventListener("mouseover", (event) => {
      mark(event.target.closest(".cell"));
      aim(event.target.closest(".cell"));
      const at = target(event);
      if (at) container._opts.onHover?.(...at);
    });
    container.addEventListener("mouseleave", () => {
      mark(null);
      aim(null);
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
