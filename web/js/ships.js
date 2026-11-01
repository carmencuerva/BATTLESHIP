// Cartoon pirate ships as inline SVG. Pure drawing: which cells a ship covers and whether it
// is sunk always come from Python; this only turns a length and an orientation into a picture.
//
// A ship is drawn side-on, bow to the right, in a viewBox of (length * 100) x 100 user units,
// and rotated inside the SVG when vertical so it fills its column of cells.

// "light": the player's own fleet (cream sails, red pennants).
// "dark": the enemy fleet (black sails with a skull, black pennants).
const THEMES = {
  light: { sail: "#f6ead0", sailEdge: "#c9b48a", flag: "#d8312a", emblem: "#b5402f" },
  dark: { sail: "#2b2f36", sailEdge: "#111317", flag: "#111317", emblem: "#f1ece0" },
};

function mastCount(length) {
  if (length >= 4) return 3;
  if (length === 3) return 2;
  return 1;
}

function skull(cx, cy, s, color) {
  // Tiny jolly roger: skull and crossbones, `s` is the scale.
  return `
    <g fill="${color}" stroke="${color}">
      <path d="M${cx - 9 * s} ${cy + 7 * s} L${cx + 9 * s} ${cy - 7 * s} M${cx - 9 * s} ${cy - 7 * s} L${cx + 9 * s} ${cy + 7 * s}"
            stroke-width="${2.6 * s}" stroke-linecap="round" fill="none"/>
      <circle cx="${cx}" cy="${cy - 2 * s}" r="${5.6 * s}" stroke="none"/>
      <rect x="${cx - 3 * s}" y="${cy + 1.5 * s}" width="${6 * s}" height="${4 * s}" rx="${1 * s}" stroke="none"/>
    </g>
    <circle cx="${cx - 2 * s}" cy="${cy - 2.4 * s}" r="${1.4 * s}" fill="#00000088"/>
    <circle cx="${cx + 2 * s}" cy="${cy - 2.4 * s}" r="${1.4 * s}" fill="#00000088"/>`;
}

// The hull sits in the ship's own cells (y 0..100); the rigging rises RIG units above them,
// like a ship seen side-on, so the masts overlap the water of the next row.
export const RIG = 50;

function sail(x, top, bottom, half, colors) {
  return `
    <path d="M${x - half} ${top + 6} Q${x} ${top - 2} ${x + half} ${top + 6}
             L${x + half - 4} ${bottom} Q${x} ${bottom + 7} ${x - half + 4} ${bottom} Z"
          fill="${colors.sail}" stroke="${colors.sailEdge}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M${x - half + 5} ${(top + bottom) / 2} Q${x} ${(top + bottom) / 2 - 4} ${x + half - 5} ${(top + bottom) / 2}"
          stroke="${colors.sailEdge}" stroke-width="1.6" fill="none" opacity=".6"/>`;
}

function body(length, theme) {
  const W = length * 100;
  const colors = THEMES[theme] ?? THEMES.light;
  const masts = mastCount(length);
  const spacing = W / (masts + 1);
  const parts = [];

  // Masts, two tiers of sails and pennants (drawn first so the hull hides their feet).
  for (let m = 0; m < masts; m++) {
    const x = Math.round((m + 1) * spacing + (length === 1 ? 0 : -6));
    const main = m === Math.floor(masts / 2);
    const top = main ? -RIG + 4 : -RIG + 16;
    const half = Math.min(44, spacing * 0.44);
    parts.push(`<rect x="${x - 3}" y="${top}" width="6" height="${58 - top}" rx="2.5" fill="#5a3418" stroke="#2f1a0a" stroke-width="1.2"/>`);
    if (length >= 3) {
      parts.push(sail(x, top + 6, -8, half * 0.72, colors));
      parts.push(sail(x, -2, 46, half, colors));
    } else {
      parts.push(sail(x, top + 8, 46, half, colors));
    }
    if (main) parts.push(skull(x, 21, length >= 3 ? 1.25 : 1, colors.emblem));
    parts.push(`<path class="flag" d="M${x + 2} ${top - 2} l22 5 l-22 6 z" fill="${colors.flag}" stroke="#00000055" stroke-width="1"/>`);
  }
  // Rigging lines from the bow and the stern to the main mast top.
  const mainX = Math.round((Math.floor(masts / 2) + 1) * spacing + (length === 1 ? 0 : -6));
  parts.push(`<path d="M${W - 6} 46 L${mainX} ${-RIG + 8} L10 44" stroke="#3d2210" stroke-width="1.4" fill="none" opacity=".7"/>`);

  // Hull: a raised stern castle on the left, the bow on the right.
  const castle = Math.min(64, W * 0.22);
  parts.push(`
    <path d="M4 40 L${castle} 40 L${castle + 8} 50 L${W - 30} 50 Q${W - 8} 50 ${W - 1} 38
             L${W - 13} 76 Q${W - 26} 93 ${W - 52} 93 L24 93 Q7 93 4 74 Z"
          fill="#8a5326" stroke="#3d2210" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M8 62 L${W - 16} 62" stroke="#f2c14e" stroke-width="4" stroke-linecap="round"/>
    <path d="M10 74 L${W - 20} 74 M16 84 L${W - 30} 84" stroke="#5e3615" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>
    <path d="M4 40 L${castle} 40 M${castle + 8} 50 L${W - 30} 50" stroke="#c98a4b" stroke-width="3.2" stroke-linecap="round"/>
    <rect x="10" y="45" width="${Math.max(8, castle * 0.28)}" height="9" rx="2" fill="#ffd34d" stroke="#3d2210" stroke-width="1.6"/>`);
  for (let x = castle + 26; x < W - 34; x += 44) {
    parts.push(`<circle cx="${x}" cy="69" r="4.6" fill="#2a170a" stroke="#f2c14e" stroke-width="1.4"/>`);
  }
  return parts.join("");
}

// The water line, foam and (when sinking) bubbles; drawn over the hull.
function sea(length) {
  const W = length * 100;
  let wave = "M0 91";
  for (let x = 0; x < W; x += 25) wave += ` q6.25 -5 12.5 0 t12.5 0`;
  const bubbles = [0.2, 0.45, 0.7, 0.3, 0.6]
    .map((f, i) => `<circle class="bubble b${i}" cx="${Math.round(f * W)}" cy="86" r="${3.5 + (i % 3)}"/>`)
    .join("");
  return `
    <path class="foam" d="${wave}" stroke="#e8f6ff" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".8"/>
    <path class="flood" d="${wave} L${W} 100 L0 100 Z" fill="#0d3a66" opacity="0"/>
    <g class="bubbles">${bubbles}</g>`;
}

// SVG markup for one ship. `orientation` is "H" or "V". The SVG is taller than the ship's
// cells by RIG (see .ship svg in style.css), and rotated a quarter turn when vertical.
export function shipSvg(length, orientation = "H", theme = "light") {
  const W = length * 100;
  const inner = `<g class="hull">${body(length, theme)}</g>${sea(length)}`;
  if (orientation === "V") {
    return `<svg viewBox="0 0 ${100 + RIG} ${W}" preserveAspectRatio="none" aria-hidden="true">
      <g transform="translate(100 0) rotate(90)">${inner}</g></svg>`;
  }
  return `<svg viewBox="0 ${-RIG} ${W} ${100 + RIG}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
}

// Where a ship sits on the board grid, from its cells: {row, col, length, orientation}.
export function shipPlacement(cells) {
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const row = Math.min(...rows);
  const col = Math.min(...cols);
  const vertical = cells.length > 1 && cols.every((c) => c === cols[0]);
  return { row, col, length: cells.length, orientation: vertical ? "V" : "H" };
}

// A small horizontal ship for legends (ships still afloat, the ship picker).
export function miniShip(length, theme = "light") {
  return `<span class="mini-ship" style="--len:${length}" title="${length}">${shipSvg(length, "H", theme)}</span>`;
}
