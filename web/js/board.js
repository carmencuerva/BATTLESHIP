// Draws a board grid. Pure presentation: every state shown here was computed in Python.

// Cell codes of battleship.game views (data format, not rules).
export const UNKNOWN = 0;
export const MISS = 1;
export const HIT = 2;
export const SUNK = 3;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function coord(row, col) {
  return `${LETTERS[col] ?? col}${row + 1}`;
}

function cellSet(cells) {
  return new Set((cells || []).map(([r, c]) => `${r},${c}`));
}

// opts: {size, view?, fleet?, hints?, heat?, preview? {cells, ok}, last? [r, c],
//        clickable?, onClick?(r, c), onHover?(r, c), onLeave?(), onContext?()}
export function renderBoard(container, opts) {
  const { size } = opts;
  const ships = cellSet((opts.fleet || []).flat());
  const preview = cellSet(opts.preview?.cells);
  const last = opts.last ? `${opts.last[0]},${opts.last[1]}` : null;
  const heatMax = opts.heat ? Math.max(1, ...opts.heat.flat()) : 1;

  const parts = [`<div class="corner"></div>`];
  for (let c = 0; c < size; c++) parts.push(`<div class="label">${LETTERS[c] ?? c}</div>`);
  for (let r = 0; r < size; r++) {
    parts.push(`<div class="label">${r + 1}</div>`);
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      const state = opts.view ? opts.view.cells[r][c] : UNKNOWN;
      const classes = ["cell"];
      let mark = "";
      let style = "";
      if (ships.has(key)) classes.push("ship");
      if (state === MISS) {
        classes.push("miss");
        mark = "•";
      } else if (state === HIT) {
        classes.push("hit");
        mark = "✕";
      } else if (state === SUNK) {
        classes.push("sunk");
        mark = "✕";
      } else {
        if (opts.hints?.[r]?.[c]) classes.push("hint");
        if (opts.clickable) classes.push("clickable");
        if (opts.heat) {
          style = ` style="--heat:${(opts.heat[r][c] / heatMax).toFixed(3)}"`;
          classes.push("heat");
        }
      }
      if (preview.has(key)) classes.push(opts.preview.ok ? "preview-ok" : "preview-bad");
      if (key === last) classes.push("last");
      parts.push(
        `<div class="${classes.join(" ")}" data-r="${r}" data-c="${c}"${style} title="${coord(r, c)}">${mark}</div>`,
      );
    }
  }
  container.classList.add("board");
  container.style.setProperty("--size", size);
  container.style.gridTemplateColumns = `repeat(${size + 1}, var(--cell))`;
  container.innerHTML = parts.join("");

  container._opts = opts;
  if (!container._wired) {
    container._wired = true;
    const target = (event) => {
      const cell = event.target.closest(".cell");
      return cell ? [Number(cell.dataset.r), Number(cell.dataset.c)] : null;
    };
    container.addEventListener("click", (event) => {
      const at = target(event);
      if (at) container._opts.onClick?.(...at);
    });
    container.addEventListener("mouseover", (event) => {
      const at = target(event);
      if (at) container._opts.onHover?.(...at);
    });
    container.addEventListener("mouseleave", () => container._opts.onLeave?.());
    container.addEventListener("contextmenu", (event) => {
      if (container._opts.onContext) {
        event.preventDefault();
        container._opts.onContext();
      }
    });
  }
}
