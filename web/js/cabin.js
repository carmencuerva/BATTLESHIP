// The captain's cabin: the "Set sail!" screen seen from inside the ship, standing in front
// of the captain's table. This module holds the scene's geometry (one-point perspective,
// the chart laid on the table, where each object stands) and small pure helpers; the art
// is in cabin-art.js and app.js wires the objects to the real settings.

// --- the chart: where things are on the flat paper (its 800 x 460 viewBox) ----------------

export const CHART = { width: 800, height: 460 };
export const HOME = { x: 118, y: 318 }; // our ship
export const DESTINATIONS = {
  hvb: { x: 600, y: 150, label: "below" }, // the enemy fortress
  bvb: { x: 470, y: 352, label: "below" }, // two ships in battle
  hvh: { x: 250, y: 150, label: "above" }, // the harbour
};

// A curved course from our ship to a destination (a quadratic Bézier bowing to the north).
export function routePath(mode) {
  const to = DESTINATIONS[mode];
  if (!to) return "";
  const mx = (HOME.x + to.x) / 2;
  const my = (HOME.y + to.y) / 2;
  const dx = to.x - HOME.x;
  const dy = to.y - HOME.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(90, len * 0.28);
  const cx = Math.round(mx + (dy / len) * bow);
  const cy = Math.round(my - (Math.abs(dx) / len) * bow);
  return `M${HOME.x} ${HOME.y} Q${cx} ${cy} ${to.x} ${to.y}`;
}

// --- the scene: two compositions of the same cabin --------------------------------------
//
// Coordinates are scene pixels. `vp` is the vanishing point; the back wall is a flat
// rectangle; the table top and the chart are rectangles lying on the table, given by their
// back and front rows (y) and the x extent of their front edge (the back edge follows the
// rays to the vanishing point). Objects stand at a contact point (x, y) and have a width `w`
// in scene pixels (`tag: "above"` puts its label above it). `safe` must always be
// visible; the art goes well beyond it.

export const LAYOUTS = {
  wide: {
    size: { w: 1600, h: 900 },
    safe: { x: 40, y: 0, w: 1520, h: 900 },
    canvas: { x: -600, y: -500, w: 2800, h: 1400 },
    vp: { x: 800, y: 110 },
    wall: { x0: 250, x1: 1350, top: -10, bottom: 448 },
    windows: { x0: 470, x1: 1130, y0: 92, y1: 330, lights: 4 },
    table: { back: 476, front: 836, x0: -20, x1: 1620, face: 900 },
    chart: { back: 528, front: 782, x0: 362, x1: 1238 },
    title: { x: 800, y: 40 },
    poster: [
      { x: 1392, y: 118 },
      { x: 1556, y: 126 },
      { x: 1556, y: 412 },
      { x: 1392, y: 346 },
    ],
    chair: { x: 1180, y: 476, w: 190 },
    lanterns: [
      { x: 300, y: -10, drop: 150, w: 62 },
      { x: 1300, y: -10, drop: 120, w: 58 },
    ],
    props: {
      models: { x: 262, y: 676, w: 300, tag: "above" },
      logbook: { x: 170, y: 800, w: 250 },
      dividers: { x: 1262, y: 630, w: 170 },
      spyglass: { x: 1400, y: 800, w: 320 },
      compass: { u: 0.87, v: 0.78, w: 150 },
    },
    face: { prepare: { x: 520, w: 420 }, start: { x: 1080, w: 420 } },
  },
  tall: {
    size: { w: 900, h: 1600 },
    safe: { x: 0, y: 0, w: 900, h: 1600 },
    canvas: { x: -600, y: -800, w: 2100, h: 2400 },
    vp: { x: 450, y: 150 },
    wall: { x0: 100, x1: 800, top: -20, bottom: 610 },
    windows: { x0: 360, x1: 770, y0: 150, y1: 420, lights: 3 },
    table: { back: 650, front: 1460, x0: -70, x1: 970, face: 1600 },
    chart: { back: 812, front: 1196, x0: 64, x1: 836 },
    title: { x: 450, y: 60 },
    poster: [
      { x: 128, y: 160 },
      { x: 322, y: 160 },
      { x: 322, y: 420 },
      { x: 128, y: 420 },
    ],
    chair: { x: 230, y: 650, w: 170 },
    lanterns: [{ x: 836, y: -20, drop: 210, w: 60 }],
    props: {
      models: { x: 290, y: 772, w: 230, tag: "above" },
      dividers: { x: 636, y: 780, w: 150, tag: "above" },
      logbook: { x: 190, y: 1410, w: 270 },
      spyglass: { x: 640, y: 1400, w: 380 },
      compass: { u: 0.9, v: 0.9, w: 140, tag: "above" },
    },
    face: { prepare: { x: 225, w: 400 }, start: { x: 670, w: 400 } },
  },
};

// Portrait screens get the tall composition.
export function chooseLayout(width, height) {
  return width / Math.max(1, height) < 0.95 ? "tall" : "wide";
}

// How to show `layout` in a box of width x height: the scale `k` that keeps the safe area
// visible, centred across and sitting on the bottom edge (the table's front is ours).
export function fitScene(layout, width, height) {
  const { safe, size } = LAYOUTS[layout];
  const k = Math.min(width / safe.w, height / safe.h);
  return { k, x: width / 2 - (safe.x + safe.w / 2) * k, y: height - size.h * k };
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

// The homography taking the unit square (u, v) to `quad` (Heckbert's square-to-quad).
export function homography(quad) {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
}

// Where (u, v) of the unit square lands in `quad`.
export function project(quad, u, v) {
  const m = homography(quad);
  const w = m.g * u + m.h * v + 1;
  return { x: (m.a * u + m.b * v + m.c) / w, y: (m.d * u + m.e * v + m.f) / w };
}

// The CSS transform that lays a `width` x `height` box (transform-origin 0 0) onto `quad`.
export function quadTransform(width, height, quad) {
  const m = homography(quad);
  const r = (n) => Number(n.toFixed(9));
  const values = [m.a / width, m.d / width, 0, m.g / width, m.b / height, m.e / height, 0, m.h / height, 0, 0, 1, 0, m.c, m.f, 0, 1];
  return `matrix3d(${values.map(r).join(",")})`;
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

export function chartQuad(layout) {
  const { vp, chart } = LAYOUTS[layout];
  return floorQuad(vp, chart);
}

// Where a destination stands on the chart, in scene pixels, and how big it looks there.
export function destinationPoint(layout, mode) {
  const d = DESTINATIONS[mode];
  const p = project(chartQuad(layout), d.x / CHART.width, d.y / CHART.height);
  return { ...p, scale: depthScale(layout, p.y) };
}

// Where an object stands, in scene pixels: on the table at (x, y) or on the chart at (u, v).
export function propPoint(layout, name) {
  const prop = LAYOUTS[layout].props[name];
  const p = "u" in prop ? project(chartQuad(layout), prop.u, prop.v) : { x: prop.x, y: prop.y };
  return { ...p, w: prop.w * depthScale(layout, p.y) };
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
