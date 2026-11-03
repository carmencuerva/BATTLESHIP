// The captain's cabin: the room behind the "Set sail!" screen (and, softened, behind every
// other screen), seen standing in front of the captain's table. This module holds the
// room's geometry (one-point perspective: the back wall, the table, where the chair and
// lanterns are) and small pure helpers for the settings; cabin-art.js draws it.

// --- the scene: two compositions of the same cabin --------------------------------------
//
// Coordinates are scene pixels. `vp` is the vanishing point; the back wall is a flat
// rectangle; the table top is a rectangle lying in the room, given by its back and front
// rows (y) and the x extent of its front edge (the back edge follows the rays to the
// vanishing point). The art goes well beyond `size` (to `canvas`), so the room can cover
// any screen.

export const LAYOUTS = {
  wide: {
    size: { w: 1600, h: 900 },
    canvas: { x: -600, y: -500, w: 2800, h: 1400 },
    vp: { x: 800, y: 110 },
    wall: { x0: 250, x1: 1350, top: -10, bottom: 448 },
    windows: { x0: 470, x1: 1130, y0: 92, y1: 330, lights: 4 },
    table: { back: 476, front: 836, x0: -20, x1: 1620, face: 900 },
    chair: { x: 1180, y: 476, w: 190 },
    lanterns: [
      { x: 300, y: -10, drop: 150, w: 62 },
      { x: 1300, y: -10, drop: 120, w: 58 },
    ],
  },
  tall: {
    size: { w: 900, h: 1600 },
    canvas: { x: -600, y: -800, w: 2100, h: 2400 },
    vp: { x: 450, y: 150 },
    wall: { x0: 100, x1: 800, top: -20, bottom: 610 },
    windows: { x0: 360, x1: 770, y0: 150, y1: 420, lights: 3 },
    table: { back: 650, front: 1460, x0: -70, x1: 970, face: 1600 },
    chair: { x: 230, y: 650, w: 170 },
    lanterns: [{ x: 836, y: -20, drop: 210, w: 60 }],
  },
};

// Portrait screens get the tall composition.
export function chooseLayout(width, height) {
  return width / Math.max(1, height) < 0.95 ? "tall" : "wide";
}

// How to show `layout` so it covers a box of width x height: the scale `k`, the room
// centred across and a little high (the windows and the table both stay in view).
export function coverScene(layout, width, height) {
  const { size } = LAYOUTS[layout];
  const k = Math.max(width / size.w, height / size.h);
  return { k, x: (width - size.w * k) / 2, y: (height - size.h * k) * 0.35 };
}

// The point at height `y` on the ray from the vanishing point through `p`.
export function alongY(vp, p, y) {
  const t = (y - vp.y) / (p.y - vp.y);
  return { x: vp.x + (p.x - vp.x) * t, y };
}

// The point at `x` on the ray from the vanishing point through `p`.
export function alongX(vp, p, x) {
  const t = (x - vp.x) / (p.x - vp.x);
  return { x, y: vp.y + (p.y - vp.y) * t };
}

// A rectangle lying on the table, as its four corners [back-left, back-right, front-right,
// front-left].
export function floorQuad(vp, { back, front, x0, x1 }) {
  const fl = { x: x0, y: front };
  const fr = { x: x1, y: front };
  return [alongY(vp, fl, back), alongY(vp, fr, back), fr, fl];
}

// How big things look at row `y` of the table, relative to its front edge.
export function depthScale(layout, y) {
  const { vp, table } = LAYOUTS[layout];
  return (y - vp.y) / (table.front - vp.y);
}

export function tableQuad(layout) {
  const { vp, table } = LAYOUTS[layout];
  return floorQuad(vp, table);
}

// --- fleet models ---------------------------------------------------------------------------

export const SHIP_MIN = 1;
export const SHIP_MAX = 6;
export const FLEET_MAX = 8;

export function changeLength(fleet, i, delta) {
  const next = fleet.slice();
  next[i] = Math.min(SHIP_MAX, Math.max(SHIP_MIN, next[i] + delta));
  return next;
}

export function removeShip(fleet, i) {
  return fleet.length > 1 ? fleet.filter((_, k) => k !== i) : fleet.slice();
}

export function addShip(fleet) {
  return fleet.length < FLEET_MAX ? [...fleet, 2] : fleet.slice();
}

// "5, 4,3" -> [5, 4, 3]; null if it is not a list of whole numbers.
export function parseFleet(text) {
  const parts = String(text).split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length || !parts.every((x) => /^\d+$/.test(x))) return null;
  return parts.map(Number);
}

// --- danger: how feared each captain is, from the official ranking ---------------------------

// {name: 1..5} by Elo among the named captains (5 = the most dangerous); {} without ranking.
export function dangerLevels(standings, names) {
  const ranked = (standings ?? []).filter((row) => names.includes(row.name)).sort((a, b) => b.elo - a.elo);
  const n = ranked.length;
  return Object.fromEntries(ranked.map((row, i) => [row.name, n === 1 ? 3 : Math.round(5 - (4 * i) / (n - 1))]));
}

// --- header icons ----------------------------------------------------------------------------

// A brass ship's wheel.
export const LOGO = `<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="logo-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d98c"/><stop offset=".5" stop-color="#c89640"/><stop offset="1" stop-color="#7a5418"/></linearGradient></defs>
  <g stroke="url(#logo-brass)" stroke-linecap="round">
    <path d="M24 2v44M2 24h44M8.4 8.4l31.2 31.2M39.6 8.4L8.4 39.6" stroke-width="3.2"/>
    <circle cx="24" cy="24" r="14.5" fill="none" stroke-width="4.2"/>
  </g>
  <circle cx="24" cy="24" r="5" fill="url(#logo-brass)" stroke="#4a3210" stroke-width="1.2"/>
</svg>`;

export const SPEAKER_ON = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
export const SPEAKER_OFF = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
