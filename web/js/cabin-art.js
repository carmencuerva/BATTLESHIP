// The captain's cabin artwork, all drawn by this code (SVG): the room itself (walls, beams,
// stern windows, bookshelf, chair, table) as one static picture with procedural wood
// textures; the sea outside; the lanterns; the three battle miniatures and the objects
// that stand for each setting. Geometry comes from cabin.js.

import { LAYOUTS, alongX, alongY, depthScale, tableQuad } from "./cabin.js";

const r = (n) => Math.round(n * 10) / 10;
const pts = (list) => list.map((p) => `${r(p.x)},${r(p.y)}`).join(" ");
const poly = (list, attrs) => `<polygon points="${pts(list)}" ${attrs}/>`;

// A small seeded random generator, so the scene is the same on every visit.
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// --- the room ------------------------------------------------------------------------------

// Wood grain: long fibres plus growth rings, as a dark texture laid over flat colour.
function grainFilter(id, region, fx, fy, seed, strength = 1) {
  const { x, y, w, h } = region;
  return `
  <filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="4" seed="${seed}" result="fibres"/>
    <feColorMatrix in="fibres" type="matrix" values="0 0 0 0 .07  0 0 0 0 .035  0 0 0 0 .01  ${2.1 * strength} 0 0 0 ${-0.78 * strength}" result="f"/>
    <feTurbulence type="fractalNoise" baseFrequency="${fx * 0.55} ${fy * 0.42}" numOctaves="2" seed="${seed + 11}" result="rings"/>
    <feComponentTransfer in="rings" result="bands"><feFuncR type="table" tableValues="0 1 0 1 0 1 0 1 0 1 0 1 0"/></feComponentTransfer>
    <feColorMatrix in="bands" type="matrix" values="0 0 0 0 .05  0 0 0 0 .02  0 0 0 0 0  ${0.42 * strength} 0 0 0 0" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="${fx * 3} ${fy * 1.6}" numOctaves="2" seed="${seed + 23}" result="hi"/>
    <feColorMatrix in="hi" type="matrix" values="0 0 0 0 1  0 0 0 0 .8  0 0 0 0 .55  ${1.4 * strength} 0 0 0 ${-0.86 * strength}" result="h"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="f"/><feMergeNode in="h"/></feMerge>
  </filter>`;
}

// A textured overlay limited to `shape` (a clip path id).
const grainOver = (clip, filter, region, opacity = 1) =>
  `<g clip-path="url(#${clip})"><rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" filter="url(#${filter})" opacity="${opacity}"/></g>`;

// Back wall: horizontal hull planks with butt joints and nails, and the ship's frames.
function backWall(L, rand) {
  const { x0, x1, top, bottom } = L.wall;
  const colours = ["#7a3e1c", "#6e371a", "#82451f", "#663217", "#74401d"];
  let out = "";
  const plank = 31;
  for (let y = top, i = 0; y < bottom; y += plank, i++) {
    const h = Math.min(plank, bottom - y);
    out += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" fill="${colours[i % colours.length]}"/>`;
    out += `<path d="M${x0} ${y + 1.5}H${x1}" stroke="#d9a066" stroke-opacity=".10" stroke-width="2"/>`;
    out += `<path d="M${x0} ${y + h - 0.8}H${x1}" stroke="#1a0d05" stroke-width="2.4"/>`;
    for (let joints = 0, x = x0 + rand() * 200; x < x1 - 30 && joints < 4; x += 180 + rand() * 260, joints++) {
      out += `<path d="M${r(x)} ${y + 2}V${y + h - 2}" stroke="#1a0d05" stroke-width="2"/>`;
      out += `<circle cx="${r(x - 7)}" cy="${y + h / 2}" r="2.1" fill="#140a04"/><circle cx="${r(x - 7.6)}" cy="${y + h / 2 - 0.6}" r=".9" fill="#b58a56" opacity=".6"/>`;
      out += `<circle cx="${r(x + 7)}" cy="${y + h / 2}" r="2.1" fill="#140a04"/><circle cx="${r(x + 6.4)}" cy="${y + h / 2 - 0.6}" r=".9" fill="#b58a56" opacity=".6"/>`;
    }
  }
  return out;
}

// The ship's frames (heavy upright ribs) on the back wall.
function backFrames(L) {
  const { x0, x1, top, bottom } = L.wall;
  const { x0: w0, x1: w1 } = L.windows;
  const posts = [x0 + 6, (x0 + w0) / 2 - 10, (w1 + x1) / 2 - 10, x1 - 34];
  return posts
    .filter((x) => x + 28 < w0 - 30 || x > w1 + 30)
    .map(
      (x) => `
    <rect x="${r(x)}" y="${top}" width="28" height="${bottom - top}" fill="#3a2010"/>
    <rect x="${r(x)}" y="${top}" width="5" height="${bottom - top}" fill="#7a4c26" opacity=".55"/>
    <rect x="${r(x + 23)}" y="${top}" width="5" height="${bottom - top}" fill="#140a04" opacity=".7"/>`,
    )
    .join("");
}

// A side wall (left or right) between the back wall and the edge of the canvas.
function sideWall(L, side, rand) {
  const { vp, wall, canvas } = L;
  const ex = side === "left" ? canvas.x : canvas.x + canvas.w;
  const wx = side === "left" ? wall.x0 : wall.x1;
  const topEdge = alongX(vp, { x: wx, y: wall.top }, ex);
  const bottomEdge = alongX(vp, { x: wx, y: wall.bottom }, ex);
  const outline = [{ x: wx, y: wall.top }, topEdge, bottomEdge, { x: wx, y: wall.bottom }];
  const colours = ["#66341a", "#5c2f17", "#6c381b", "#552b15"];
  let planks = "";
  const step = 31;
  for (let y = wall.top, i = 0; y < wall.bottom; y += step, i++) {
    const y2 = Math.min(wall.bottom, y + step);
    const a = { x: wx, y };
    const b = { x: wx, y: y2 };
    const quad = [a, alongX(vp, a, ex), alongX(vp, b, ex), b];
    planks += poly(quad, `fill="${colours[i % colours.length]}"`);
    planks += `<path d="M${r(b.x)} ${r(b.y)}L${r(alongX(vp, b, ex).x)} ${r(alongX(vp, b, ex).y)}" stroke="#170b04" stroke-width="2.6"/>`;
  }
  // frames at a few depths (t = how much closer than the back wall)
  let frames = "";
  for (const t of [1.18, 1.5, 2.05, 3]) {
    const x = vp.x + (wx - vp.x) * t;
    const w = 24 * t;
    const xa = side === "left" ? x - w : x;
    const xb = side === "left" ? x : x + w;
    const top = (xx) => vp.y + (wall.top - vp.y) * ((xx - vp.x) / (wx - vp.x));
    const bot = (xx) => vp.y + (wall.bottom - vp.y) * ((xx - vp.x) / (wx - vp.x));
    frames += poly(
      [
        { x: xa, y: top(xa) },
        { x: xb, y: top(xb) },
        { x: xb, y: bot(xb) },
        { x: xa, y: bot(xa) },
      ],
      `fill="#331b0c"`,
    );
    const edge = side === "left" ? xb : xa;
    frames += `<path d="M${r(edge)} ${r(top(edge))}L${r(edge)} ${r(bot(edge))}" stroke="#80512a" stroke-opacity=".5" stroke-width="${r(3 * t)}"/>`;
  }
  void rand;
  return { outline, svg: planks + frames };
}

function ceiling(L) {
  const { vp, wall, canvas } = L;
  const left = alongX(vp, { x: wall.x0, y: wall.top }, canvas.x);
  const right = alongX(vp, { x: wall.x1, y: wall.top }, canvas.x + canvas.w);
  let out = poly(
    [{ x: wall.x0, y: wall.top }, { x: wall.x1, y: wall.top }, right, { x: right.x, y: canvas.y }, { x: left.x, y: canvas.y }, left],
    `fill="#3a1d0c"`,
  );
  // carlings running towards us
  for (let i = 0; i <= 8; i++) {
    const x = wall.x0 + ((wall.x1 - wall.x0) * i) / 8;
    const far = alongY(vp, { x, y: wall.top }, canvas.y);
    out += `<path d="M${r(x)} ${wall.top}L${r(far.x)} ${canvas.y}" stroke="#120902" stroke-width="5"/>`;
  }
  // deck beams across
  for (const t of [1.0, 1.35, 1.9, 2.8, 4]) {
    const y = vp.y + (wall.top - vp.y) * t;
    if (y < canvas.y) continue;
    const xa = vp.x + (wall.x0 - vp.x) * t;
    const xb = vp.x + (wall.x1 - vp.x) * t;
    const h = 30 * t;
    out += `<rect x="${r(xa)}" y="${r(y - h)}" width="${r(xb - xa)}" height="${r(h)}" fill="#3b2110"/>`;
    out += `<rect x="${r(xa)}" y="${r(y - 4 * t)}" width="${r(xb - xa)}" height="${r(4 * t)}" fill="#7d4f28" opacity=".45"/>`;
  }
  return out;
}

function floor(L) {
  const { vp, wall, canvas } = L;
  const bottom = canvas.y + canvas.h;
  const left = alongY(vp, { x: wall.x0, y: wall.bottom }, bottom);
  const right = alongY(vp, { x: wall.x1, y: wall.bottom }, bottom);
  let out = poly([{ x: wall.x0, y: wall.bottom }, { x: wall.x1, y: wall.bottom }, right, left], `fill="#2a170a"`);
  for (let i = -12; i <= 30; i++) {
    const x = wall.x0 + i * 46;
    const near = alongY(vp, { x, y: wall.bottom }, bottom);
    out += `<path d="M${r(x)} ${wall.bottom}L${r(near.x)} ${bottom}" stroke="#140a03" stroke-width="2"/>`;
  }
  return out;
}

// Stern windows: an arched gallery of leaded lights. Returns the frame art, the glass
// openings (punched out of the picture so the live sea shows through) and the glass sheen.
function sternWindows(L) {
  const { x0, x1, y0, y1, lights } = L.windows;
  const post = 20;
  const lw = (x1 - x0 - post * (lights - 1)) / lights;
  const arch = Math.min(34, lw * 0.32);
  let holes = "";
  let lead = "";
  let sheen = "";
  for (let i = 0; i < lights; i++) {
    const a = x0 + i * (lw + post);
    const b = a + lw;
    const d = `M${r(a)} ${y1}V${y0 + arch}Q${r(a)} ${y0} ${r(a + arch)} ${y0}H${r(b - arch)}Q${r(b)} ${y0} ${r(b)} ${y0 + arch}V${y1}Z`;
    holes += `<path d="${d}"/>`;
    // the leading: small rectangular panes
    const cols = 3;
    const rows = 5;
    for (let c = 1; c < cols; c++) lead += `<path d="M${r(a + (lw * c) / cols)} ${y0 + 4}V${y1}"/>`;
    for (let k = 1; k < rows; k++) lead += `<path d="M${r(a)} ${r(y0 + ((y1 - y0) * k) / rows)}H${r(b)}"/>`;
    sheen += `<path d="${d}" fill="url(#glass)"/>`;
    sheen += `<path d="M${r(a + lw * 0.18)} ${y1 - 6}L${r(a + lw * 0.52)} ${y0 + 10}L${r(a + lw * 0.64)} ${y0 + 10}L${r(a + lw * 0.3)} ${y1 - 6}Z" fill="#fff" opacity=".06"/>`;
  }
  const frame = `
    <path d="M${x0 - 30} ${y1 + 30}V${y0 + 8}Q${x0 - 30} ${y0 - 28} ${x0 + 10} ${y0 - 28}H${x1 - 10}Q${x1 + 30} ${y0 - 28} ${x1 + 30} ${y0 + 8}V${y1 + 30}Z" fill="#2a170a"/>
    <path d="M${x0 - 30} ${y1 + 30}V${y0 + 8}Q${x0 - 30} ${y0 - 28} ${x0 + 10} ${y0 - 28}H${x1 - 10}Q${x1 + 30} ${y0 - 28} ${x1 + 30} ${y0 + 8}V${y1 + 30}" fill="none" stroke="#8a5a2c" stroke-opacity=".55" stroke-width="3"/>
    <path d="M${x0 - 16} ${y1}V${y0 + 12}Q${x0 - 16} ${y0 - 14} ${x0 + 12} ${y0 - 14}H${x1 - 12}Q${x1 + 16} ${y0 - 14} ${x1 + 16} ${y0 + 12}V${y1}" fill="none" stroke="#120902" stroke-width="4"/>
    <rect x="${x0 - 44}" y="${y1 + 4}" width="${x1 - x0 + 88}" height="20" fill="#6e4322"/>
    <rect x="${x0 - 44}" y="${y1 + 4}" width="${x1 - x0 + 88}" height="4" fill="#b07a45" opacity=".6"/>
    <rect x="${x0 - 40}" y="${y1 + 24}" width="${x1 - x0 + 80}" height="12" fill="#1c0e05"/>`;
  const glass = `<g stroke="#1b1208" stroke-width="2.2" opacity=".85">${lead}</g>${sheen}`;
  return { frame, holes, glass };
}

// A few things on the window sill: a bottle and an hourglass.
function sill(L) {
  const { x0, x1, y1 } = L.windows;
  const y = y1 + 4;
  const bx = x0 + 26;
  const hx = x1 - 40;
  return `
    <g>
      <ellipse cx="${bx + 8}" cy="${y}" rx="15" ry="3" fill="#000" opacity=".4"/>
      <path d="M${bx} ${y}V${y - 34}Q${bx} ${y - 44} ${bx + 6} ${y - 48}V${y - 62}H${bx + 11}V${y - 48}Q${bx + 17} ${y - 44} ${bx + 17} ${y - 34}V${y}Z" fill="#1f4d2c"/>
      <path d="M${bx + 3} ${y - 6}V${y - 34}" stroke="#9fd8a8" stroke-opacity=".45" stroke-width="2.4"/>
      <rect x="${bx + 5}" y="${y - 66}" width="7" height="6" fill="#8a5a2c"/>
      <ellipse cx="${hx}" cy="${y}" rx="17" ry="3" fill="#000" opacity=".4"/>
      <rect x="${hx - 15}" y="${y - 5}" width="30" height="5" fill="#5a3418"/>
      <rect x="${hx - 15}" y="${y - 46}" width="30" height="5" fill="#5a3418"/>
      <path d="M${hx - 11} ${y - 41}Q${hx - 11} ${y - 27} ${hx} ${y - 23}Q${hx + 11} ${y - 27} ${hx + 11} ${y - 41}Z M${hx - 11} ${y - 5}Q${hx - 11} ${y - 19} ${hx} ${y - 23}Q${hx + 11} ${y - 19} ${hx + 11} ${y - 5}Z" fill="#cfe3ee" opacity=".35" stroke="#e9f4f8" stroke-opacity=".5"/>
      <path d="M${hx - 8} ${y - 5}Q${hx} ${y - 14} ${hx + 8} ${y - 5}Z" fill="#d9b874"/>
      <path d="M${hx - 13} ${y - 41}V${y - 5}M${hx + 13} ${y - 41}V${y - 5}" stroke="#3a200f" stroke-width="2.5"/>
    </g>`;
}

// A point on the left or right wall: `t` is how much closer than the back wall (1 = on it),
// `h` the height as drawn on the back wall's edge; `out` moves it off the wall into the room.
function wallPoint(L, side, t, h, out = 0) {
  const { vp, wall } = L;
  const wx = side === "left" ? wall.x0 : wall.x1;
  const dir = side === "left" ? 1 : -1;
  return { x: vp.x + (wx - vp.x) * t + dir * out * t, y: vp.y + (h - vp.y) * t };
}

// A bookshelf on the left wall, with books, scrolls and a bottle.
function bookshelf(L, rand) {
  const tA = L === LAYOUTS.tall ? 1.02 : 1.06;
  const tB = L === LAYOUTS.tall ? 1.5 : 1.62;
  const shelves = L === LAYOUTS.tall ? [150, 260, 370, 480] : [62, 162, 262, 362];
  const depth = 34;
  const P = (t, h, o = 0) => wallPoint(L, "left", t, h, o);
  let out = "";
  // back panel and uprights
  out += poly([P(tA, shelves[0] - 70), P(tB, shelves[0] - 70), P(tB, shelves.at(-1) + 14), P(tA, shelves.at(-1) + 14)], `fill="#26140a"`);
  const spines = ["#6b1d17", "#24452e", "#2b3550", "#5a3a17", "#7a5a1e", "#3b1a2e", "#1f3a3a", "#4f1410", "#635a3a"];
  for (const [k, h] of shelves.entries()) {
    // books standing on this shelf
    let t = tA + 0.015;
    while (t < tB - 0.02) {
      const thick = 0.012 + rand() * 0.016;
      const tall = (h - (shelves[k - 1] ?? shelves[0] - 100)) * (0.58 + rand() * 0.3);
      if (rand() < 0.08) {
        t += thick * 2.5; // a gap
        continue;
      }
      const t2 = Math.min(tB - 0.01, t + thick);
      const colour = pick(rand, spines);
      const bookDepth = depth - 6 - rand() * 6;
      const spine = [P(t, h - tall, bookDepth), P(t2, h - tall, bookDepth), P(t2, h, bookDepth), P(t, h, bookDepth)];
      const top = [P(t, h - tall, 2), P(t2, h - tall, 2), P(t2, h - tall, bookDepth), P(t, h - tall, bookDepth)];
      out += poly(top, `fill="#d9c49a" opacity=".55"`);
      out += poly(spine, `fill="${colour}"`);
      out += poly(spine, `fill="url(#spine-shade)"`);
      if (rand() < 0.7) {
        for (const f of [0.14, 0.2, 0.8]) {
          const a = P(t, h - tall * (1 - f), bookDepth);
          const b = P(t2, h - tall * (1 - f), bookDepth);
          out += `<path d="M${r(a.x)} ${r(a.y)}L${r(b.x)} ${r(b.y)}" stroke="#d6aa4e" stroke-width="${r(1.4 * t)}" opacity=".8"/>`;
        }
      }
      t = t2 + 0.002;
    }
    // the shelf board: its top and its front edge
    const back0 = P(tA, h);
    const back1 = P(tB, h);
    const front0 = P(tA, h, depth);
    const front1 = P(tB, h, depth);
    out += poly([back0, back1, front1, front0], `fill="#6e4322"`);
    out += poly([front0, front1, P(tB, h + 12, depth), P(tA, h + 12, depth)], `fill="#4e2e15"`);
    out += `<path d="M${r(front0.x)} ${r(front0.y)}L${r(front1.x)} ${r(front1.y)}" stroke="#c08a52" stroke-opacity=".55" stroke-width="2"/>`;
  }
  // a couple of rolled charts lying on the top shelf
  const roll = (t, h, len, colour) => {
    const a = P(t, h - 9, 10);
    const b = P(t + len, h - 9, 10);
    return `<path d="M${r(a.x)} ${r(a.y)}L${r(b.x)} ${r(b.y)}" stroke="${colour}" stroke-width="${r(13 * t)}" stroke-linecap="round"/><path d="M${r(a.x)} ${r(a.y - 3)}L${r(b.x)} ${r(b.y - 3)}" stroke="#fff4d6" stroke-opacity=".35" stroke-width="${r(3 * t)}" stroke-linecap="round"/>`;
  };
  out += roll(tA + 0.06, shelves[0] - 52, 0.22, "#d8c08e");
  // uprights
  for (const t of [tA, tB]) {
    out += poly([P(t, shelves[0] - 80), P(t, shelves[0] - 80, depth + 4), P(t, shelves.at(-1) + 16, depth + 4), P(t, shelves.at(-1) + 16)], `fill="#3e2310"`);
    const edge = P(t, shelves[0] - 80, depth + 4);
    const foot = P(t, shelves.at(-1) + 16, depth + 4);
    out += `<path d="M${r(edge.x)} ${r(edge.y)}L${r(foot.x)} ${r(foot.y)}" stroke="#a77446" stroke-opacity=".5" stroke-width="${r(3 * t)}"/>`;
  }
  return out;
}

// Things hanging on the right wall: a coil of rope and a pair of crossed cutlasses.
function rightWallThings(L) {
  const P = (t, h, o = 0) => wallPoint(L, "right", t, h, o);
  const tall = L === LAYOUTS.tall;
  const c = P(tall ? 1.05 : 1.08, tall ? 470 : 420, 4);
  const s = tall ? 1 : 1.15;
  const rope = Array.from({ length: 5 }, (_, i) => `<ellipse cx="${r(c.x)}" cy="${r(c.y + i * 3)}" rx="${r((16 - i) * s)}" ry="${r((30 - i * 1.5) * s)}" fill="none" stroke="${i % 2 ? "#a88a55" : "#c8a96b"}" stroke-width="${r(5 * s)}"/>`).join("");
  return `
    <g opacity=".95">
      <ellipse cx="${r(c.x - 6)}" cy="${r(c.y + 8)}" rx="${r(18 * s)}" ry="${r(32 * s)}" fill="#000" opacity=".35" filter="url(#blur6)"/>
      ${rope}
      <path d="M${r(c.x - 2)} ${r(c.y - 34 * s)}v-10" stroke="#2a1608" stroke-width="5"/>
    </g>`;
}

// A barrel and a sea chest on the floor beside the table.
function floorThings(L) {
  const { vp, table } = L;
  const [bl, br] = tableQuad(L === LAYOUTS.tall ? "tall" : "wide");
  const s = depthScale(L === LAYOUTS.tall ? "tall" : "wide", table.back) * 1.1;
  const bx = br.x + 120 * s;
  const by = table.back + 30 * s;
  const cx = bl.x - 140 * s;
  const cy = table.back + 36 * s;
  void vp;
  return `
    <g>
      <ellipse cx="${r(bx)}" cy="${r(by)}" rx="${r(64 * s)}" ry="${r(14 * s)}" fill="#000" opacity=".5" filter="url(#blur6)"/>
      <path d="M${r(bx - 52 * s)} ${r(by)}Q${r(bx - 62 * s)} ${r(by - 70 * s)} ${r(bx - 50 * s)} ${r(by - 140 * s)}H${r(bx + 50 * s)}Q${r(bx + 62 * s)} ${r(by - 70 * s)} ${r(bx + 52 * s)} ${r(by)}Z" fill="url(#barrel)"/>
      <ellipse cx="${r(bx)}" cy="${r(by - 140 * s)}" rx="${r(50 * s)}" ry="${r(11 * s)}" fill="#6b4222" stroke="#2b1708" stroke-width="3"/>
      ${[0.12, 0.42, 0.66, 0.92].map((f) => `<path d="M${r(bx - 58 * s)} ${r(by - 140 * s * f)}Q${r(bx)} ${r(by - 140 * s * f + 10 * s)} ${r(bx + 58 * s)} ${r(by - 140 * s * f)}" fill="none" stroke="#3a3a36" stroke-width="${r(6 * s)}"/>`).join("")}
      <ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(90 * s)}" ry="${r(14 * s)}" fill="#000" opacity=".5" filter="url(#blur6)"/>
      <rect x="${r(cx - 84 * s)}" y="${r(cy - 70 * s)}" width="${r(168 * s)}" height="${r(70 * s)}" fill="#4a2a14"/>
      <path d="M${r(cx - 84 * s)} ${r(cy - 70 * s)}Q${r(cx)} ${r(cy - 112 * s)} ${r(cx + 84 * s)} ${r(cy - 70 * s)}Z" fill="#5c3519"/>
      <path d="M${r(cx - 60 * s)} ${r(cy)}V${r(cy - 90 * s)}M${r(cx + 60 * s)} ${r(cy)}V${r(cy - 90 * s)}" stroke="#a77b2e" stroke-width="${r(9 * s)}"/>
      <rect x="${r(cx - 10 * s)}" y="${r(cy - 66 * s)}" width="${r(20 * s)}" height="${r(24 * s)}" fill="#c89640"/>
      ${grainOverLocal(cx - 84 * s, cy - 112 * s, 168 * s, 112 * s)}
    </g>`;
}

// Grain over a small rectangle (clipped: the texture filter fills the whole canvas).
let localClips = 0;
function grainOverLocal(x, y, w, h, opacity = 0.35) {
  const id = `clip-local-${localClips++}`;
  return `<clipPath id="${id}"><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/></clipPath><g clip-path="url(#${id})"><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" filter="url(#grain-h)" opacity="${opacity}"/></g>`;
}

// The captain's high-backed chair, behind the table.
function chair(L) {
  const { x, y, w } = L.chair;
  const h = w * 1.25;
  const top = y - h;
  return `
    <g>
      <ellipse cx="${x}" cy="${y - 4}" rx="${w * 0.6}" ry="16" fill="#000" opacity=".45" filter="url(#blur6)"/>
      <path d="M${x - w / 2} ${y}V${top + 40}Q${x - w / 2} ${top + 6} ${x - w * 0.3} ${top - 4}Q${x} ${top - 34} ${x + w * 0.3} ${top - 4}Q${x + w / 2} ${top + 6} ${x + w / 2} ${top + 40}V${y}Z" fill="#3a1e0d"/>
      <path d="M${x - w * 0.38} ${y}V${top + 46}Q${x - w * 0.38} ${top + 18} ${x - w * 0.2} ${top + 12}Q${x} ${top - 6} ${x + w * 0.2} ${top + 12}Q${x + w * 0.38} ${top + 18} ${x + w * 0.38} ${top + 46}V${y}Z" fill="url(#leather)"/>
      ${[0, 1, 2, 3]
        .map((row) =>
          [-1, 0, 1]
            .map((col) => {
              const cx = x + col * w * 0.2 + (row % 2 ? w * 0.1 : 0) * (col < 1 ? 1 : -1) * 0;
              const cy = top + 44 + row * h * 0.17;
              return `<circle cx="${r(cx)}" cy="${r(cy)}" r="3.4" fill="#2a0806"/><circle cx="${r(cx - 1)}" cy="${r(cy - 1)}" r="1.4" fill="#e9b7a0" opacity=".25"/>`;
            })
            .join(""),
        )
        .join("")}
      ${Array.from({ length: 14 }, (_, i) => {
        const f = i / 13;
        const px = x - w * 0.38 + f * w * 0.76;
        return `<circle cx="${r(px)}" cy="${r(top + 46 - Math.sin(f * Math.PI) * 30)}" r="2.6" fill="#d6aa4e"/>`;
      }).join("")}
      <path d="M${x - w / 2 - 8} ${y}V${top + 30}M${x + w / 2 + 8} ${y}V${top + 30}" stroke="#2a1608" stroke-width="16" stroke-linecap="round"/>
      <circle cx="${x - w / 2 - 8}" cy="${top + 24}" r="11" fill="#5c3519"/><circle cx="${x + w / 2 + 8}" cy="${top + 24}" r="11" fill="#5c3519"/>
      <circle cx="${x - w / 2 - 11}" cy="${top + 21}" r="4" fill="#b07a45" opacity=".6"/><circle cx="${x + w / 2 + 5}" cy="${top + 21}" r="4" fill="#b07a45" opacity=".6"/>
      <path d="M${x - 22} ${top - 14}Q${x} ${top - 40} ${x + 22} ${top - 14}" fill="none" stroke="#7a4c26" stroke-width="6" stroke-linecap="round"/>
    </g>`;
}

// The table: planks in perspective, light pools and the front edge.
function table(L, layout) {
  const { vp, table: tb } = L;
  const quad = tableQuad(layout);
  const [, , fr, fl] = quad;
  let rows = "";
  const n = 7;
  const a = 1 / (tb.front - vp.y);
  const b = 1 / (tb.back - vp.y);
  const colours = ["#8a4a20", "#7e431d", "#92502a", "#783f1b", "#864822", "#8e4d24", "#7a411c"];
  for (let i = 0; i < n; i++) {
    const y0 = vp.y + 1 / (b + ((a - b) * i) / n);
    const y1 = vp.y + 1 / (b + ((a - b) * (i + 1)) / n);
    const q = [alongY(vp, fl, y0), alongY(vp, fr, y0), alongY(vp, fr, y1), alongY(vp, fl, y1)];
    rows += poly(q, `fill="${colours[i]}"`);
    rows += `<path d="M${r(q[3].x)} ${r(y1)}H${r(q[2].x)}" stroke="#1d0e05" stroke-width="${r(1.2 + 2.2 * depthScale(layout, y1))}"/>`;
    rows += `<path d="M${r(q[0].x)} ${r(y0 + 1.5)}H${r(q[1].x)}" stroke="#e0a868" stroke-opacity=".10" stroke-width="2"/>`;
  }
  const faceTop = tb.front;
  const faceBottom = tb.face;
  return `
    <clipPath id="clip-table"><polygon points="${pts(quad)}"/></clipPath>
    <g>${rows}</g>
    ${grainOver("clip-table", "grain-t", L.canvas, 0.9)}
    <polygon points="${pts(quad)}" fill="url(#table-light)"/>
    <path d="M${r(fl.x)} ${faceTop}H${r(fr.x)}" stroke="#e8b47a" stroke-opacity=".45" stroke-width="3"/>
    <rect x="${r(fl.x - 40)}" y="${faceTop + 2}" width="${r(fr.x - fl.x + 80)}" height="${faceBottom - faceTop + 200}" fill="url(#face)"/>
    ${grainOverLocal(fl.x - 40, faceTop + 2, fr.x - fl.x + 80, faceBottom - faceTop + 200, 0.7)}
    <path d="M${r(fl.x - 40)} ${faceTop + 14}H${r(fr.x + 40)}" stroke="#1a0c04" stroke-width="3"/>
    <path d="M${r(fl.x - 40)} ${faceTop + 17}H${r(fr.x + 40)}" stroke="#c08a52" stroke-opacity=".35" stroke-width="1.5"/>
    <path d="M${r(fl.x - 40)} ${faceTop + 4}H${r(fr.x + 40)}" stroke="#d6aa4e" stroke-opacity=".5" stroke-width="2"/>`;
}

// Window light falling on the table, and the lanterns' warm pools.
function lightPools(L, layout) {
  const { windows, table: tb } = L;
  const [bl, br, fr, fl] = tableQuad(layout);
  const mid = (tb.back + tb.front) / 2;
  const span = (y) => [alongY(L.vp, fl, y), alongY(L.vp, fr, y)];
  const [m0, m1] = span(mid);
  const cx = (windows.x0 + windows.x1) / 2;
  const blue = [
    { x: windows.x0 + 20, y: windows.y1 + 30 },
    { x: windows.x1 - 20, y: windows.y1 + 30 },
    { x: cx + (m1.x - cx) * 0.55, y: mid },
    { x: cx - (cx - m0.x) * 0.55, y: mid },
  ];
  const warm = L.lanterns
    .map((l) => {
      const y = Math.min(tb.front - 40, tb.back + (tb.front - tb.back) * 0.3);
      return `<ellipse cx="${l.x + (l.x < cx ? 80 : -80)}" cy="${y}" rx="${r(300 * depthScale(layout, y))}" ry="${r(90 * depthScale(layout, y))}" fill="#ffb25a" opacity=".16"/>`;
    })
    .join("");
  void bl;
  void br;
  return `
    <g filter="url(#blur30)" style="mix-blend-mode:screen">
      ${poly(blue, `fill="#7fb3e8" opacity=".14"`)}
      ${warm}
    </g>`;
}

// A sea chart pinned to the right wall, with a compass rose.
function wallMap(L) {
  const P = (t, h, o = 0) => wallPoint(L, "right", t, h, o);
  const tall = L === LAYOUTS.tall;
  const [t0, t1] = tall ? [1.08, 1.3] : [1.1, 1.45];
  const [h0, h1] = tall ? [130, 330] : [70, 280];
  const quad = [P(t0, h0, 3), P(t1, h0, 3), P(t1, h1, 3), P(t0, h1, 3)];
  const c = P((t0 + t1) / 2, (h0 + h1) / 2, 3);
  const s = (t0 + t1) / 2;
  return `
    <g>
      ${poly(quad.map((q) => ({ x: q.x - 6, y: q.y + 8 })), 'fill="#000" opacity=".35" filter="url(#blur6)"')}
      ${poly(quad, 'fill="#e6cf9c" stroke="#7a5a32" stroke-width="2"')}
      ${poly(quad, 'fill="url(#warm-light)"')}
      <g transform="translate(${r(c.x)} ${r(c.y)}) scale(${r(-0.55 * s)} ${r(1.1 * s)})" opacity=".75">
        <circle r="34" fill="none" stroke="#6e5332" stroke-width="2"/>
        <path d="M0 -44 L7 0 L0 44 L-7 0 Z M-44 0 L0 -7 L44 0 L0 7 Z" fill="#6e5332"/>
        <path d="M0 -44 L7 0 L-7 0 Z" fill="#a3281c"/>
        <path d="M-60 -50 C-40 -30 -50 -10 -30 0 M30 30 C46 40 52 52 70 50" stroke="#6e5332" stroke-width="1.6" fill="none"/>
      </g>
      ${[quad[0], quad[1]].map((q) => `<circle cx="${r(q.x)}" cy="${r(q.y + 6)}" r="3.5" fill="#c89640"/>`).join("")}
    </g>`;
}

// A brass globe on its stand, at the left end of the table.
function globe(L) {
  const tall = L === LAYOUTS.tall;
  const x = tall ? 70 : 200;
  const y = tall ? 650 : 470;
  const s = tall ? 0.8 : 1;
  const R = 54 * s;
  return `
    <g>
      <ellipse cx="${x}" cy="${y + 4}" rx="${r(60 * s)}" ry="${r(12 * s)}" fill="#000" opacity=".5" filter="url(#blur6)"/>
      <path d="M${r(x - 36 * s)} ${y} Q${x} ${r(y - 20 * s)} ${r(x + 36 * s)} ${y} Z" fill="#6e4322"/>
      <path d="M${x} ${r(y - 12 * s)} V${r(y - 40 * s)}" stroke="#c89640" stroke-width="${r(7 * s)}"/>
      <circle cx="${x}" cy="${r(y - 40 * s - R)}" r="${r(R)}" fill="url(#globe-sea)" stroke="#5e4422" stroke-width="2"/>
      <path d="M${r(x - R * 0.6)} ${r(y - 40 * s - R * 1.3)} c${r(18 * s)} ${r(-6 * s)} ${r(30 * s)} ${r(10 * s)} ${r(22 * s)} ${r(26 * s)} c${r(-8 * s)} ${r(14 * s)} ${r(10 * s)} ${r(22 * s)} ${r(26 * s)} ${r(16 * s)} M${r(x + R * 0.2)} ${r(y - 40 * s - R * 0.4)} c${r(10 * s)} ${r(8 * s)} ${r(26 * s)} ${r(4 * s)} ${r(30 * s)} ${r(16 * s)}" fill="none" stroke="#6b5a32" stroke-width="${r(5 * s)}" opacity=".7"/>
      <path d="M${r(x - R - 8 * s)} ${r(y - 40 * s - R)} A${r(R + 8 * s)} ${r(R + 8 * s)} 0 0 1 ${r(x + R + 8 * s)} ${r(y - 40 * s - R)}" fill="none" stroke="#c89640" stroke-width="${r(5 * s)}"/>
      <circle cx="${r(x - R * 0.35)}" cy="${r(y - 40 * s - R * 1.4)}" r="${r(R * 0.22)}" fill="#fff" opacity=".25"/>
    </g>`;
}

// Barrels and a coil of rope in the near corners, beside the table.
function cornerBarrels(L) {
  const tall = L === LAYOUTS.tall;
  const items = tall
    ? [{ x: -30, y: 1580, s: 1.6 }]
    : [
        { x: -30, y: 900, s: 1.7 },
        { x: 1640, y: 900, s: 1.7 },
      ];
  return items
    .map(({ x, y, s }) => {
      const coil = Array.from({ length: 4 }, (_, i) => `<ellipse cx="${r(x + 70 * s)}" cy="${r(y - 22 * s + i * 4 * s)}" rx="${r((46 - i * 3) * s)}" ry="${r((14 - i) * s)}" fill="none" stroke="${i % 2 ? "#a88a55" : "#c8a96b"}" stroke-width="${r(8 * s)}"/>`).join("");
      return `
      <g>
        <ellipse cx="${x}" cy="${y}" rx="${r(80 * s)}" ry="${r(14 * s)}" fill="#000" opacity=".55" filter="url(#blur6)"/>
        <path d="M${r(x - 62 * s)} ${y}Q${r(x - 74 * s)} ${r(y - 80 * s)} ${r(x - 60 * s)} ${r(y - 160 * s)}H${r(x + 60 * s)}Q${r(x + 74 * s)} ${r(y - 80 * s)} ${r(x + 62 * s)} ${y}Z" fill="url(#barrel)"/>
        <ellipse cx="${x}" cy="${r(y - 160 * s)}" rx="${r(60 * s)}" ry="${r(13 * s)}" fill="#7a4a24" stroke="#2b1708" stroke-width="3"/>
        ${[0.12, 0.42, 0.66, 0.9].map((f) => `<path d="M${r(x - 68 * s)} ${r(y - 160 * s * f)}Q${x} ${r(y - 160 * s * f + 12 * s)} ${r(x + 68 * s)} ${r(y - 160 * s * f)}" fill="none" stroke="#4a4a44" stroke-width="${r(7 * s)}"/>`).join("")}
        ${coil}
      </g>`;
    })
    .join("");
}

const sceneCache = new Map();

// The whole room as one SVG picture (for an <img>): everything that does not move.
export function sceneSvg(layout) {
  if (sceneCache.has(layout)) return sceneCache.get(layout);
  const L = LAYOUTS[layout];
  const rand = random(layout === "wide" ? 7 : 11);
  const { canvas } = L;
  const left = sideWall(L, "left", rand);
  const right = sideWall(L, "right", rand);
  const win = sternWindows(L);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}" width="${canvas.w}" height="${canvas.h}">
  <defs>
    ${grainFilter("grain-h", canvas, 0.0028, 0.085, 5)}
    ${grainFilter("grain-t", canvas, 0.0016, 0.2, 13, 0.75)}
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="blur14" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".16"/><stop offset=".5" stop-color="#cfe6ff" stop-opacity=".03"/><stop offset="1" stop-color="#ffd7a0" stop-opacity=".10"/></linearGradient>
    <linearGradient id="spine-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
    <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c1709"/><stop offset=".35" stop-color="#7a4a24"/><stop offset=".6" stop-color="#5a3418"/><stop offset="1" stop-color="#1e0f05"/></linearGradient>
    <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a2318"/><stop offset=".6" stop-color="#5e140e"/><stop offset="1" stop-color="#3a0b07"/></linearGradient>
    <linearGradient id="table-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8e0" stop-opacity=".16"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2913"/><stop offset=".2" stop-color="#3a200e"/><stop offset="1" stop-color="#1a0d05"/></linearGradient>
    <linearGradient id="wall-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <linearGradient id="side-shade-left" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>
    <linearGradient id="side-shade-right" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>
    <radialGradient id="lamp-wall" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb357" stop-opacity=".55"/><stop offset="1" stop-color="#ffb357" stop-opacity="0"/></radialGradient>
    <radialGradient id="window-bounce" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#8ec0ff" stop-opacity=".16"/><stop offset="1" stop-color="#8ec0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette" cx=".5" cy=".42" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    <radialGradient id="warm-light" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#ffb062" stop-opacity=".28"/><stop offset=".6" stop-color="#ff9a40" stop-opacity=".1"/><stop offset="1" stop-color="#ff9a40" stop-opacity="0"/></radialGradient>
    <radialGradient id="sunset-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffc27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="globe-sea" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#d8c79a"/><stop offset=".7" stop-color="#a88a52"/><stop offset="1" stop-color="#5e4422"/></radialGradient>
    <linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b3f1d"/><stop offset="1" stop-color="#3e2210"/></linearGradient>
    <clipPath id="clip-wall"><rect x="${L.wall.x0}" y="${L.wall.top}" width="${L.wall.x1 - L.wall.x0}" height="${L.wall.bottom - L.wall.top}"/></clipPath>
    <clipPath id="clip-left"><polygon points="${pts(left.outline)}"/></clipPath>
    <clipPath id="clip-right"><polygon points="${pts(right.outline)}"/></clipPath>
    <mask id="windows-out" maskUnits="userSpaceOnUse" x="${canvas.x}" y="${canvas.y}" width="${canvas.w}" height="${canvas.h}">
      <rect x="${canvas.x}" y="${canvas.y}" width="${canvas.w}" height="${canvas.h}" fill="#fff"/>
      <g fill="#000">${win.holes}</g>
    </mask>
  </defs>
  <g mask="url(#windows-out)">
    <rect x="${canvas.x}" y="${canvas.y}" width="${canvas.w}" height="${canvas.h}" fill="#1b0f07"/>
    ${ceiling(L)}
    ${floor(L)}
    <g>${backWall(L, rand)}</g>
    ${grainOver("clip-wall", "grain-h", canvas, 0.9)}
    ${backFrames(L)}
    <rect x="${L.wall.x0}" y="${L.wall.top}" width="${L.wall.x1 - L.wall.x0}" height="${L.wall.bottom - L.wall.top}" fill="url(#wall-shade)"/>
    <g>${left.svg}</g>${grainOver("clip-left", "grain-h", canvas, 0.85)}
    <polygon points="${pts(left.outline)}" fill="url(#side-shade-left)"/>
    <g>${right.svg}</g>${grainOver("clip-right", "grain-h", canvas, 0.85)}
    <polygon points="${pts(right.outline)}" fill="url(#side-shade-right)"/>
    <rect x="${L.wall.x0}" y="${L.wall.top}" width="${L.wall.x1 - L.wall.x0}" height="34" fill="#2e180a"/>
    <rect x="${L.wall.x0}" y="${L.wall.top + 30}" width="${L.wall.x1 - L.wall.x0}" height="4" fill="#8a5a2c" opacity=".5"/>
    ${win.frame}
    <ellipse cx="${(L.windows.x0 + L.windows.x1) / 2}" cy="${L.windows.y1 + 60}" rx="${(L.windows.x1 - L.windows.x0) * 0.75}" ry="160" fill="url(#window-bounce)"/>
    ${L.lanterns.map((l) => `<ellipse cx="${l.x}" cy="${l.y + l.drop + 40}" rx="230" ry="200" fill="url(#lamp-wall)"/>`).join("")}
  </g>
  ${win.glass}
  <ellipse cx="${(L.windows.x0 + L.windows.x1) / 2}" cy="${L.windows.y1}" rx="${(L.windows.x1 - L.windows.x0) * 0.8}" ry="260" fill="url(#sunset-glow)" style="mix-blend-mode:screen"/>
  ${sill(L)}
  ${bookshelf(L, rand)}
  ${rightWallThings(L)}
  ${wallMap(L)}
  ${floorThings(L)}
  ${chair(L)}
  ${table(L, layout)}
  ${globe(L)}
  ${lightPools(L, layout)}
  ${cornerBarrels(L)}
  <rect x="${canvas.x}" y="${canvas.y}" width="${canvas.w}" height="${canvas.h}" fill="url(#warm-light)" style="mix-blend-mode:screen"/>
  <rect x="${canvas.x}" y="${canvas.y}" width="${canvas.w}" height="${canvas.h}" fill="url(#vignette)"/>
</svg>`;
  sceneCache.set(layout, svg);
  return svg;
}

// --- the sea outside the stern windows (inline, so it can move) -----------------------------

export const SEA = `
<svg class="sea-view" viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="sea-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d3d66"/><stop offset=".42" stop-color="#5d5a82"/>
      <stop offset=".72" stop-color="#e49c62"/><stop offset="1" stop-color="#f7d394"/>
    </linearGradient>
    <linearGradient id="sea-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f7ea6"/><stop offset="1" stop-color="#0a2744"/>
    </linearGradient>
  </defs>
  <rect width="480" height="220" fill="url(#sea-sky)"/>
  <g fill="#f7e2c6" opacity=".35"><ellipse cx="90" cy="60" rx="70" ry="9"/><ellipse cx="140" cy="72" rx="50" ry="6"/><ellipse cx="380" cy="44" rx="60" ry="7"/></g>
  <circle cx="330" cy="128" r="26" fill="#ffe3a4"/>
  <circle cx="330" cy="128" r="54" fill="#ffd27a" opacity=".2"/>
  <g class="far-ship" fill="#2b2236" opacity=".8">
    <path d="M110 128 h44 l-6 7 h-32 z"/><path d="M131 128 V101 l13 18 h-13 M127 126 V108 l-10 14 h10"/>
  </g>
  <rect y="130" width="480" height="90" fill="url(#sea-water)"/>
  <path d="M296 138 h68 M306 148 h48 M318 158 h26" stroke="#ffd994" stroke-width="3" stroke-linecap="round" opacity=".6"/>
  <g class="swell swell-1"><path d="M-120 150 q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V220 H-120 z" fill="#2a6690" opacity=".8"/></g>
  <g class="swell swell-2"><path d="M-120 174 q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 V220 H-120 z" fill="#174a70" opacity=".9"/></g>
  <g class="swell swell-3"><path d="M-120 198 q30 -7 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V220 H-120 z" fill="#0d3152"/></g>
</svg>`;

// --- the battle miniatures (painted wargame pieces on round bases) ---------------------------

// A round wooden base with a painted top; `paint` is drawn clipped to it.
function base(id, paint) {
  return `
    <g class="base">
    <ellipse cx="100" cy="158" rx="92" ry="18" fill="#000" opacity=".55" filter="url(#${id}-blur)"/>
    <path d="M10 140 V150 A90 19 0 0 0 190 150 V140 Z" fill="url(#${id}-rim)"/>
    <ellipse cx="100" cy="140" rx="90" ry="19" fill="#5b3418"/>
    <clipPath id="${id}-top"><ellipse cx="100" cy="140" rx="86" ry="17"/></clipPath>
    <g clip-path="url(#${id}-top)">${paint}</g>
    <ellipse cx="100" cy="140" rx="88" ry="18" fill="none" stroke="#c89640" stroke-width="2"/>
    </g>`;
}

function baseDefs(id) {
  return `
    <filter id="${id}-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1608"/><stop offset=".3" stop-color="#6b4020"/><stop offset=".7" stop-color="#4a2a12"/><stop offset="1" stop-color="#1c0e05"/></linearGradient>
    <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b7c9e"/><stop offset="1" stop-color="#1b4a6b"/></linearGradient>`;
}

const crests = (y0, n, seed) => {
  const rand = random(seed);
  return Array.from({ length: n }, () => {
    const x = 20 + rand() * 160;
    const y = y0 + rand() * 26;
    return `<path d="M${r(x)} ${r(y)} q5 -3 10 0" stroke="#e8f4ff" stroke-width="1.6" fill="none" opacity=".75"/>`;
  }).join("");
};

const STONE = (id) => `<linearGradient id="${id}-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9b09c"/><stop offset=".45" stop-color="#958b78"/><stop offset="1" stop-color="#5b5346"/></linearGradient>`;

export const MINIATURES = {
  // the enemy captain's fortress on a rocky island
  hvb: `<svg viewBox="0 -30 200 200" aria-hidden="true">
    <defs>${baseDefs("mf")}${STONE("mf")}
      <linearGradient id="mf-rock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c8070"/><stop offset="1" stop-color="#3f382f"/></linearGradient>
      <radialGradient id="mf-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    </defs>
    ${base("mf", `<rect x="0" y="110" width="200" height="60" fill="url(#mf-sea)"/>${crests(130, 9, 1)}`)}
    <path d="M28 142 C30 124 46 112 62 112 L76 104 C92 98 120 98 134 104 L150 112 C166 116 176 128 172 144 C150 152 50 152 28 142 Z" fill="url(#mf-rock)"/>
    <path d="M40 128 L62 114 L80 118 L70 132 Z M120 104 L146 112 L138 124 L116 118 Z" fill="#a89c88" opacity=".7"/>
    <path d="M60 140 L72 128 L92 136 M128 140 L140 126 L160 134" stroke="#2b251f" stroke-width="1.6" fill="none" opacity=".6"/>
    <path d="M40 140 C60 136 90 138 110 142" stroke="#e8f4ff" stroke-width="2" fill="none" opacity=".6"/>
    <g>
      <rect x="44" y="84" width="58" height="34" fill="url(#mf-stone)"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${44 + i * 12}" y="76" width="8" height="9" fill="url(#mf-stone)"/>`).join("")}
      <path d="M44 93 H102 M44 102 H102 M44 111 H102" stroke="#4a4338" stroke-width=".9" opacity=".6"/>
      <path d="M54 84 V93 M70 93 V102 M86 84 V93 M60 102 V111 M80 102 V111 M94 93 V102" stroke="#4a4338" stroke-width=".9" opacity=".6"/>
      <rect x="66" y="88" width="14" height="5" fill="#2b2b2b"/><path d="M80 90 h10" stroke="#1b1b1b" stroke-width="3"/>
    </g>
    <g>
      <rect x="96" y="30" width="48" height="90" fill="url(#mf-stone)"/>
      <rect x="90" y="24" width="60" height="10" fill="#8f8572"/>
      <rect x="90" y="32" width="60" height="3" fill="#4a4338" opacity=".6"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${90 + i * 13}" y="12" width="9" height="13" fill="url(#mf-stone)"/>`).join("")}
      ${[44, 54, 64, 74, 84, 94, 104, 114].map((y, i) => `<path d="M96 ${y} H144" stroke="#4a4338" stroke-width=".9" opacity=".55"/><path d="M${i % 2 ? 108 : 114} ${y - 10} V${y} M${i % 2 ? 128 : 134} ${y - 10} V${y}" stroke="#4a4338" stroke-width=".9" opacity=".5"/>`).join("")}
      <path d="M112 120 V104 Q120 94 128 104 V120 Z" fill="#1f1a15"/>
      <rect x="104" y="50" width="5" height="14" fill="#1b1714"/><rect x="132" y="70" width="5" height="14" fill="#1b1714"/>
      <circle cx="122" cy="58" r="16" fill="url(#mf-glow)"/>
      <path d="M117 64 V54 Q122 47 127 54 V64 Z" fill="#ffc861"/>
    </g>
    <path d="M120 12 V-24" stroke="#3a2a1a" stroke-width="2.6"/>
    <path d="M121 -24 C134 -28 140 -20 154 -24 L154 -6 C140 -2 134 -10 121 -6 Z" fill="#161412"/>
    <path d="M121 -10 C134 -14 140 -6 154 -10" stroke="#a3281c" stroke-width="2.4" fill="none"/>
    <g>
      <path d="M36 122 C38 104 42 92 50 80" stroke="#6b4a2a" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M50 80 C40 74 30 76 24 84 C34 80 42 80 50 82 Z M50 80 C56 70 66 68 74 72 C64 74 58 76 50 82 Z M50 80 C46 70 46 62 40 56 C48 62 52 70 52 80 Z M50 80 C62 78 70 84 72 92 C64 86 58 84 50 82 Z" fill="#3f6b2e" stroke="#25421a" stroke-width="1"/>
    </g>
  </svg>`,

  // two ships trading broadsides
  bvb: `<svg viewBox="0 -30 200 200" aria-hidden="true">
    <defs>${baseDefs("md")}
      <linearGradient id="md-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5326"/><stop offset=".5" stop-color="#5e3615"/><stop offset="1" stop-color="#2e1a0a"/></linearGradient>
      <linearGradient id="md-sail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6e2"/><stop offset=".6" stop-color="#e8d8b4"/><stop offset="1" stop-color="#b8a47c"/></linearGradient>
      <linearGradient id="md-dark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#57504a"/><stop offset="1" stop-color="#26221f"/></linearGradient>
      <radialGradient id="md-smoke" cx=".4" cy=".35" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#c9c4bc"/><stop offset="1" stop-color="#8e8981"/></radialGradient>
    </defs>
    ${base("md", `<rect x="0" y="110" width="200" height="60" fill="url(#md-sea)"/>${crests(124, 14, 2)}`)}
    <g>
      <path d="M8 112 L14 104 H74 L84 98 L86 108 C82 124 70 132 52 134 H30 C18 132 10 124 8 112 Z" fill="url(#md-hull)" stroke="#1e1006" stroke-width="1.4"/>
      <path d="M14 112 H82" stroke="#d6aa4e" stroke-width="1.6"/>
      ${[20, 30, 40, 50, 60, 70].map((x) => `<rect x="${x}" y="115" width="5" height="5" fill="#140a04"/>`).join("")}
      <path d="M8 104 H24 V96 H10 Z" fill="#6e4322" stroke="#1e1006"/>
      <path d="M34 104 V34 M58 104 V24 M76 100 V54" stroke="#3a2412" stroke-width="2.4"/>
      <path d="M22 44 Q34 40 46 44 Q50 58 46 72 Q34 68 22 72 Q18 58 22 44 Z" fill="url(#md-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M24 78 Q34 74 44 78 Q48 88 44 98 Q34 94 24 98 Q20 88 24 78 Z" fill="url(#md-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M44 32 Q58 28 72 32 Q76 50 72 66 Q58 62 44 66 Q40 50 44 32 Z" fill="url(#md-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M46 72 Q58 68 70 72 Q74 84 70 96 Q58 92 46 96 Q42 84 46 72 Z" fill="url(#md-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M76 56 L98 98 L78 96 Z" fill="url(#md-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M58 24 l12 3 l-12 4 z" fill="#a3281c"/>
      <path d="M8 104 L34 34 L58 24 L76 54 L96 98" stroke="#2a1a0a" stroke-width=".6" fill="none" opacity=".7"/>
    </g>
    <g>
      <path d="M192 114 L186 106 H128 L118 100 L116 110 C120 126 132 134 150 136 H170 C182 134 190 126 192 114 Z" fill="url(#md-hull)" stroke="#1e1006" stroke-width="1.4"/>
      <path d="M186 114 H120" stroke="#a3281c" stroke-width="1.6"/>
      ${[128, 138, 148, 158, 168, 178].map((x) => `<rect x="${x}" y="117" width="5" height="5" fill="#140a04"/>`).join("")}
      <path d="M192 106 H176 V98 H190 Z" fill="#4a2a14" stroke="#1e1006"/>
      <path d="M166 106 V40 M142 106 V30 M126 102 V58" stroke="#2a1a0a" stroke-width="2.4"/>
      <path d="M154 50 Q166 46 178 50 Q182 64 178 78 Q166 74 154 78 Q150 64 154 50 Z" fill="url(#md-dark)" stroke="#111" stroke-width=".8"/>
      <path d="M156 82 Q166 78 176 82 Q180 92 176 102 Q166 98 156 102 Q152 92 156 82 Z" fill="url(#md-dark)" stroke="#111" stroke-width=".8"/>
      <path d="M128 38 Q142 34 156 38 Q160 56 156 72 Q142 68 128 72 Q124 56 128 38 Z" fill="url(#md-dark)" stroke="#111" stroke-width=".8"/>
      <path d="M130 76 Q142 72 154 76 Q158 88 154 100 Q142 96 130 100 Q126 88 130 76 Z" fill="url(#md-dark)" stroke="#111" stroke-width=".8"/>
      <path d="M142 30 l-12 3 l12 4 z" fill="#111"/>
    </g>
    <g>
      <circle cx="96" cy="108" r="11" fill="url(#md-smoke)" opacity=".95"/>
      <circle cx="108" cy="100" r="14" fill="url(#md-smoke)" opacity=".95"/>
      <circle cx="102" cy="88" r="10" fill="url(#md-smoke)" opacity=".9"/>
      <circle cx="116" cy="112" r="9" fill="url(#md-smoke)" opacity=".9"/>
      <path d="M86 116 l8 -3 l-4 7 z M118 118 l-8 -2 l5 7 z" fill="#ffb02e"/>
      <path d="M104 134 q-4 -12 0 -18 q4 6 0 18 z M96 136 q-6 -8 -4 -14 q5 4 4 14 z" fill="#eaf6ff" opacity=".85"/>
    </g>
  </svg>`,

  // the harbour: a cottage, a pier, one ship and the two deckhands who share it
  hvh: `<svg viewBox="0 -30 200 200" aria-hidden="true">
    <defs>${baseDefs("mp")}${STONE("mp")}
      <linearGradient id="mp-roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4553a"/><stop offset="1" stop-color="#6e2216"/></linearGradient>
      <linearGradient id="mp-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#efe4cc"/><stop offset="1" stop-color="#a99c80"/></linearGradient>
      <linearGradient id="mp-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5d8a"/><stop offset="1" stop-color="#14304d"/></linearGradient>
      <linearGradient id="mp-sail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6e2"/><stop offset="1" stop-color="#c9b78e"/></linearGradient>
    </defs>
    ${base("mp", `<rect x="0" y="110" width="200" height="60" fill="url(#mp-sea)"/><path d="M0 110 H200 V134 C150 128 110 140 60 132 C30 128 10 134 0 136 Z" fill="#7a8a5a"/><path d="M0 128 C30 124 60 130 100 128 C140 126 170 120 200 124" stroke="#b9a77a" stroke-width="6" fill="none"/>${crests(140, 6, 3)}`)}
    <g>
      <rect x="22" y="70" width="58" height="52" fill="url(#mp-wall)"/>
      <path d="M22 80 H80 M22 100 H80 M40 70 V122 M62 70 V122" stroke="#5a3418" stroke-width="3"/>
      <path d="M14 72 L51 40 L88 72 Z" fill="url(#mp-roof)" stroke="#4a160e" stroke-width="1.2"/>
      ${[50, 56, 62, 68].map((y) => `<path d="M${r(51 - (y - 40) * 1.16)} ${y} H${r(51 + (y - 40) * 1.16)}" stroke="#4a160e" stroke-width=".9" opacity=".6"/>`).join("")}
      <rect x="66" y="44" width="9" height="18" fill="#7a6a5a"/>
      <path d="M70 40 q-4 -8 2 -14 q-2 -8 6 -12" stroke="#d8d4cc" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
      <rect x="44" y="84" width="14" height="12" fill="#ffc861"/><path d="M51 84 V96 M44 90 H58" stroke="#5a3418" stroke-width="1.4"/>
      <path d="M26 122 V104 H38 V122 Z" fill="#4a2a14"/>
    </g>
    <g>
      <path d="M88 122 L196 122 L192 132 L84 132 Z" fill="#8a5a2c" stroke="#3a2010" stroke-width="1"/>
      ${[94, 106, 118, 130, 142, 154, 166, 178].map((x) => `<path d="M${x} 122 L${x - 2} 132" stroke="#3a2010" stroke-width="1"/>`).join("")}
      ${[96, 140, 186].map((x) => `<rect x="${x - 3}" y="130" width="6" height="18" fill="#4a2a14"/>`).join("")}
      <rect x="168" y="110" width="10" height="12" rx="2" fill="#6b4222" stroke="#2b1708"/>
    </g>
    <g>
      <path d="M100 144 L106 136 H170 L176 132 L176 140 C172 152 160 158 144 158 H120 C110 158 102 152 100 144 Z" fill="url(#mp-hull)" stroke="#0c1c2e" stroke-width="1.2"/>
      <path d="M104 140 H174" stroke="#e8d8b4" stroke-width="1.4"/>
      <path d="M136 136 V60" stroke="#3a2412" stroke-width="2.4"/>
      <path d="M138 64 Q164 80 168 132 L138 132 Z" fill="url(#mp-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M134 70 Q116 96 112 132 L134 132 Z" fill="url(#mp-sail)" stroke="#8a7650" stroke-width=".8"/>
      <path d="M136 60 l12 3 l-12 4 z" fill="#2f6fbf"/>
    </g>
    <g>
      <ellipse cx="112" cy="123" rx="7" ry="2" fill="#000" opacity=".35"/>
      <path d="M108 122 V112 H116 V122" stroke="#2b2b3a" stroke-width="3"/>
      <rect x="107" y="100" width="10" height="13" rx="2" fill="#f3efe6"/><path d="M107 104 H117 M107 108 H117" stroke="#c0392b" stroke-width="1.6"/>
      <circle cx="112" cy="95" r="5" fill="#e2b48c"/><path d="M107 93 Q112 86 117 93 Z" fill="#c0392b"/>
      <path d="M117 102 L126 94" stroke="#e2b48c" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="128" cy="123" rx="7" ry="2" fill="#000" opacity=".35"/>
      <path d="M124 122 V112 H132 V122" stroke="#3a2a1a" stroke-width="3"/>
      <rect x="123" y="100" width="10" height="13" rx="2" fill="#f3efe6"/><path d="M123 104 H133 M123 108 H133" stroke="#2f6fbf" stroke-width="1.6"/>
      <circle cx="128" cy="95" r="5" fill="#c99872"/><path d="M123 93 Q128 86 133 93 Z" fill="#2f6fbf"/>
    </g>
  </svg>`,
};

// --- the props ----------------------------------------------------------------------------

const BRASS = (id, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#6d4812"/><stop offset=".28" stop-color="#f6dc92"/><stop offset=".55" stop-color="#c89640"/><stop offset="1" stop-color="#4a3008"/></linearGradient>`;

export const SPYGLASS = `<svg class="prop-svg" viewBox="0 0 380 140" aria-hidden="true">
  <defs>
    ${BRASS("sg-brass")}
    <linearGradient id="sg-leather" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a14"/><stop offset=".3" stop-color="#8a5a32"/><stop offset=".6" stop-color="#5a3418"/><stop offset="1" stop-color="#24130a"/></linearGradient>
    <radialGradient id="sg-lens" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#e9f6ff"/><stop offset=".4" stop-color="#6aa4cf"/><stop offset="1" stop-color="#173a5a"/></radialGradient>
    <filter id="sg-blur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <path d="M30 112 L350 74 L352 92 L34 128 Z" fill="#000" opacity=".55" filter="url(#sg-blur)"/>
  <g transform="rotate(-8 190 80)">
    <rect x="22" y="70" width="44" height="18" rx="3" fill="url(#sg-brass)"/>
    <rect x="12" y="72" width="12" height="14" rx="2" fill="url(#sg-brass)"/>
    <rect x="64" y="66" width="62" height="26" fill="url(#sg-brass)"/>
    <rect x="124" y="60" width="150" height="38" fill="url(#sg-leather)"/>
    ${Array.from({ length: 14 }, (_, i) => `<path d="M${132 + i * 10} 62 l4 4" stroke="#d8b47a" stroke-width="1" opacity=".5"/>`).join("")}
    <rect x="120" y="58" width="10" height="42" rx="2" fill="url(#sg-brass)"/>
    <rect x="198" y="58" width="7" height="42" rx="2" fill="url(#sg-brass)"/>
    <rect x="270" y="54" width="70" height="50" rx="3" fill="url(#sg-brass)"/>
    <rect x="336" y="50" width="14" height="58" rx="3" fill="url(#sg-brass)"/>
    <ellipse cx="350" cy="79" rx="6" ry="25" fill="url(#sg-lens)"/>
    <path d="M276 60 H334" stroke="#fff7d6" stroke-width="3" opacity=".6" stroke-linecap="round"/>
    <path d="M68 70 H122 M26 73 H62" stroke="#fff7d6" stroke-width="2" opacity=".55" stroke-linecap="round"/>
  </g>
</svg>`;

export const COMPASS = `<svg class="prop-svg" viewBox="0 0 200 170" aria-hidden="true">
  <defs>
    ${BRASS("cp-brass", 1, 1)}
    <linearGradient id="cp-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a3008"/><stop offset=".3" stop-color="#c89640"/><stop offset=".55" stop-color="#f2d488"/><stop offset="1" stop-color="#3a2406"/></linearGradient>
    <radialGradient id="cp-card" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#f6ecd2"/><stop offset="1" stop-color="#cdb68a"/></radialGradient>
    <filter id="cp-blur" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <ellipse cx="104" cy="128" rx="88" ry="30" fill="#000" opacity=".55" filter="url(#cp-blur)"/>
  <path d="M16 78 V104 A84 40 0 0 0 184 104 V78 Z" fill="url(#cp-side)"/>
  <ellipse cx="100" cy="78" rx="84" ry="40" fill="url(#cp-brass)"/>
  <ellipse cx="100" cy="78" rx="70" ry="32" fill="#3a2406"/>
  <ellipse cx="100" cy="79" rx="66" ry="30" fill="url(#cp-card)"/>
  <g transform="translate(100 79) scale(1 .46)">
    ${Array.from({ length: 32 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 32;
      const l = i % 4 ? 56 : 50;
      return `<path d="M${r(Math.cos(a) * l)} ${r(Math.sin(a) * l)}L${r(Math.cos(a) * 62)} ${r(Math.sin(a) * 62)}" stroke="#5a4126" stroke-width="${i % 4 ? 1 : 2}"/>`;
    }).join("")}
    <path d="M0 -44 L7 0 L0 44 L-7 0 Z M-44 0 L0 -7 L44 0 L0 7 Z" fill="#6e5332" opacity=".35"/>
    <g class="needle"><path d="M0 -50 L8 0 L0 50 L-8 0 Z" fill="#2b2b2b"/><path d="M0 -50 L8 0 L-8 0 Z" fill="#a3281c"/><circle r="5" fill="#c89640"/></g>
  </g>
  <path d="M48 66 Q80 46 132 52" stroke="#fff" stroke-width="5" opacity=".35" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="78" rx="84" ry="40" fill="none" stroke="#fff3c4" stroke-opacity=".5" stroke-width="1.5"/>
</svg>`;

export const DIVIDERS = `<svg class="prop-svg" viewBox="0 0 200 120" aria-hidden="true">
  <defs>${BRASS("dv-brass", 1, 0)}<filter id="dv-blur" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="4"/></filter></defs>
  <path d="M40 54 L178 70 M40 54 L150 104" stroke="#000" stroke-width="10" opacity=".5" filter="url(#dv-blur)" stroke-linecap="round"/>
  <path d="M36 44 L160 62" stroke="url(#dv-brass)" stroke-width="8" stroke-linecap="round"/>
  <path d="M36 44 L134 94" stroke="url(#dv-brass)" stroke-width="8" stroke-linecap="round"/>
  <path d="M160 62 L184 66 M134 94 L156 106" stroke="#b9c0c6" stroke-width="4" stroke-linecap="round"/>
  <circle cx="36" cy="44" r="13" fill="url(#dv-brass)" stroke="#4a3008" stroke-width="1.5"/>
  <circle cx="36" cy="44" r="4" fill="#4a3008"/>
  <path d="M28 34 Q36 26 46 34" stroke="#fff7d6" stroke-width="2" fill="none" opacity=".6"/>
</svg>`;

export const LOGBOOK = `<svg class="prop-svg" viewBox="0 0 260 170" aria-hidden="true">
  <defs>
    <linearGradient id="lb-cover" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a2a1a"/><stop offset=".6" stop-color="#4e1a10"/><stop offset="1" stop-color="#2a0c06"/></linearGradient>
    <linearGradient id="lb-pages" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e2bf"/><stop offset="1" stop-color="#b89a68"/></linearGradient>
    ${BRASS("lb-brass", 1, 1)}
    <filter id="lb-blur" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="lb-tex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".25" numOctaves="2" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.9 0 0 0 .5"/></filter>
    <clipPath id="lb-clip"><path d="M40 28 L222 22 L246 118 L16 128 Z"/></clipPath>
  </defs>
  <path d="M24 146 L250 136 L240 112 L30 120 Z" fill="#000" opacity=".6" filter="url(#lb-blur)"/>
  <path d="M16 128 L246 118 L246 132 L18 144 Z" fill="url(#lb-pages)"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M${20 + i} ${131 + i * 2.4} L244 ${121 + i * 2.2}" stroke="#9a7c4c" stroke-width=".7" opacity=".7"/>`).join("")}
  <path d="M246 118 L222 22 L224 34 L248 130 Z" fill="#d8c08e"/>
  <path d="M16 128 L18 144 L14 142 Z" fill="#2a0c06"/>
  <path d="M40 28 L222 22 L246 118 L16 128 Z" fill="url(#lb-cover)" stroke="#1a0603" stroke-width="2"/>
  <g clip-path="url(#lb-clip)"><rect width="260" height="170" filter="url(#lb-tex)"/></g>
  <path d="M50 38 L212 32 L232 110 L30 118 Z" fill="none" stroke="#c89640" stroke-opacity=".6" stroke-width="1.6"/>
  <path d="M58 46 L204 40 L222 102 L42 110 Z" fill="none" stroke="#1a0603" stroke-opacity=".5" stroke-width="1"/>
  <path d="M118 64 L148 62 L152 84 L114 86 Z" fill="none" stroke="#d6aa4e" stroke-width="1.6"/>
  <path d="M124 72 L144 71 M122 78 L146 77" stroke="#d6aa4e" stroke-width="1.2"/>
  ${["M40 28 L58 27 L40 44 Z", "M222 22 L204 23 L226 38 Z", "M246 118 L228 119 L242 102 Z", "M16 128 L34 127 L22 112 Z"].map((d) => `<path d="${d}" fill="url(#lb-brass)"/>`).join("")}
  <path d="M184 25 L196 24 L218 120 L206 121 Z" fill="#2a120a"/>
  <rect x="200" y="62" width="14" height="12" fill="none" stroke="url(#lb-brass)" stroke-width="3" transform="rotate(-2 207 68)"/>
  <path d="M150 126 L156 160 L162 150 L168 158 L162 124 Z" fill="#a3281c"/>
</svg>`;

// Three model ships on their stands.
function modelShip(x, y, s, sail, hull, id) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="6" rx="70" ry="9" fill="#000" opacity=".55" filter="url(#ms-blur)"/>
    <rect x="-58" y="-6" width="116" height="10" rx="2" fill="#4a2a14"/>
    <rect x="-58" y="-6" width="116" height="3" fill="#8a5a2c"/>
    <path d="M-34 -6 V-22 H-26 V-6 M26 -6 V-22 H34 V-6" fill="#5a3418"/>
    <path d="M-64 -40 L-56 -30 C-50 -16 -30 -14 0 -14 C30 -14 50 -16 58 -28 L68 -40 Z" fill="url(#ms-${hull})" stroke="#1a0c04" stroke-width="1.2"/>
    <path d="M-62 -36 H66" stroke="#d6aa4e" stroke-width="1.6"/>
    <path d="M-58 -30 C-40 -26 40 -26 60 -30" stroke="#1a0c04" stroke-width=".8" opacity=".6" fill="none"/>
    <path d="M-64 -40 V-48 H-46 V-40" fill="#5a3418" stroke="#1a0c04" stroke-width=".8"/>
    <path d="M-30 -40 V-112 M6 -40 V-124 M36 -40 V-96" stroke="#3a2412" stroke-width="2.4"/>
    <path d="M-44 -104 Q-30 -108 -16 -104 Q-12 -88 -16 -72 Q-30 -76 -44 -72 Q-48 -88 -44 -104 Z M-42 -68 Q-30 -72 -18 -68 Q-14 -56 -18 -46 Q-30 -50 -42 -46 Q-46 -56 -42 -68 Z" fill="url(#ms-${sail})" stroke="#8a7650" stroke-width=".8"/>
    <path d="M-10 -118 Q6 -122 22 -118 Q26 -100 22 -82 Q6 -86 -10 -82 Q-14 -100 -10 -118 Z M-8 -76 Q6 -80 20 -76 Q24 -62 20 -48 Q6 -52 -8 -48 Q-12 -62 -8 -76 Z" fill="url(#ms-${sail})" stroke="#8a7650" stroke-width=".8"/>
    <path d="M24 -90 Q36 -94 48 -90 Q52 -74 48 -58 Q36 -62 24 -58 Q20 -74 24 -90 Z" fill="url(#ms-${sail})" stroke="#8a7650" stroke-width=".8"/>
    <path d="M36 -94 L74 -42 M-64 -46 L-30 -112 L6 -124 L36 -96" stroke="#2a1a0a" stroke-width=".7" fill="none"/>
    <path d="M6 -124 l14 4 l-14 4 z" fill="${id % 2 ? "#a3281c" : "#2f6fbf"}"/>
  </g>`;
}

export const MODELS = `<svg class="prop-svg" viewBox="0 0 320 190" aria-hidden="true">
  <defs>
    <filter id="ms-blur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
    <linearGradient id="ms-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6232"/><stop offset=".5" stop-color="#6b3e1a"/><stop offset="1" stop-color="#2e1a0a"/></linearGradient>
    <linearGradient id="ms-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a46"/><stop offset="1" stop-color="#14141c"/></linearGradient>
    <linearGradient id="ms-cream" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6e2"/><stop offset=".6" stop-color="#e8d8b4"/><stop offset="1" stop-color="#b8a47c"/></linearGradient>
    <linearGradient id="ms-red" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d0543e"/><stop offset="1" stop-color="#7a1f14"/></linearGradient>
  </defs>
  ${modelShip(232, 110, 0.72, "red", "dark", 1)}
  ${modelShip(96, 128, 0.82, "cream", "wood", 2)}
  ${modelShip(190, 176, 0.9, "cream", "wood", 3)}
</svg>`;

// A brass ship's lantern on its chain (inline, so it can sway and flicker).
export function lanternSvg(drop) {
  return `<svg class="lantern-art" viewBox="0 ${-drop} 80 ${drop + 150}" aria-hidden="true">
  <defs>
    ${BRASS("ln-brass", 1, 0)}
    <radialGradient id="ln-flame" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffc24a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="ln-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd98a" stop-opacity=".5"/><stop offset=".5" stop-color="#fff0c0" stop-opacity=".25"/><stop offset="1" stop-color="#ffb04a" stop-opacity=".5"/></linearGradient>
  </defs>
  <path d="M40 ${-drop} V28" stroke="#2a1d10" stroke-width="3" stroke-dasharray="6 3"/>
  <circle cx="40" cy="32" r="7" fill="none" stroke="url(#ln-brass)" stroke-width="3"/>
  <path d="M20 54 L30 40 H50 L60 54 Z" fill="url(#ln-brass)" stroke="#3b2a10" stroke-width="1.5"/>
  <rect x="18" y="54" width="44" height="66" rx="3" fill="url(#ln-glass)" stroke="url(#ln-brass)" stroke-width="3"/>
  <ellipse class="flame" cx="40" cy="90" rx="11" ry="17" fill="url(#ln-flame)"/>
  <path d="M40 98 c-5 -6 -4 -12 0 -20 c4 8 5 14 0 20 z" fill="#fff1b0"/>
  <path d="M29 54 V120 M51 54 V120" stroke="url(#ln-brass)" stroke-width="2.4"/>
  <path d="M16 120 H64 L57 132 H23 Z" fill="url(#ln-brass)" stroke="#3b2a10" stroke-width="1.5"/>
  <circle cx="40" cy="138" r="4" fill="url(#ln-brass)"/>
</svg>`;
}


// --- small pieces of the interface, in the same hand -----------------------------------------

// Two crossed cutlasses, under the big red buttons.
export const SWORDS = `<svg class="swords" viewBox="0 0 120 34" aria-hidden="true">
  <defs><linearGradient id="sw-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".5" stop-color="#b7bec6"/><stop offset="1" stop-color="#6f7882"/></linearGradient>
  ${BRASS("sw-brass", 1, 1)}</defs>
  <path d="M14 30 C40 22 70 10 104 4 C82 12 52 24 20 33 Z" fill="url(#sw-steel)" stroke="#3a3f44" stroke-width=".8"/>
  <path d="M106 30 C80 22 50 10 16 4 C38 12 68 24 100 33 Z" fill="url(#sw-steel)" stroke="#3a3f44" stroke-width=".8"/>
  <path d="M8 27 l10 9 M112 27 l-10 9" stroke="url(#sw-brass)" stroke-width="4" stroke-linecap="round"/>
  <path d="M4 33 l8 -8 M116 33 l-8 -8" stroke="#3a1a0a" stroke-width="5" stroke-linecap="round"/>
</svg>`;

// A quill standing in an inkwell.
export const QUILL = `<svg class="quill" viewBox="0 0 90 110" aria-hidden="true">
  <defs>${BRASS("qu-brass", 1, 0)}
    <linearGradient id="qu-feather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf3e4"/><stop offset=".6" stop-color="#d9c8a8"/><stop offset="1" stop-color="#8a7656"/></linearGradient>
    <filter id="qu-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <ellipse cx="46" cy="102" rx="30" ry="6" fill="#000" opacity=".45" filter="url(#qu-blur)"/>
  <path d="M8 6 C30 10 50 30 56 66 L52 68 C40 40 24 22 8 6 Z" fill="url(#qu-feather)" stroke="#6e5a3a" stroke-width="1"/>
  <path d="M10 8 C28 22 44 42 54 66" stroke="#7a6444" stroke-width="1.2" fill="none"/>
  <path d="M54 64 L60 86" stroke="#3a2a1a" stroke-width="2.2"/>
  <path d="M26 80 H66 L70 100 H22 Z" fill="#1f1a22" stroke="#0e0b10" stroke-width="1.5"/>
  <ellipse cx="46" cy="80" rx="20" ry="5" fill="url(#qu-brass)"/>
  <ellipse cx="46" cy="79" rx="9" ry="2.6" fill="#0b0810"/>
  <path d="M30 86 Q34 92 32 98" stroke="#fff" stroke-opacity=".25" stroke-width="2.4" fill="none"/>
</svg>`;

// A small galleon, for "your fleet".
export const SHIP_ICON = `<svg class="plaque-icon" viewBox="0 0 64 48" aria-hidden="true">
  ${"<defs>" + BRASS("si-brass", 1, 1) + "</defs>"}
  <path d="M4 32 H60 L52 44 H12 Z" fill="url(#si-brass)"/>
  <path d="M22 32 V6 M38 32 V2 M50 32 V12" stroke="url(#si-brass)" stroke-width="2.2"/>
  <path d="M12 10 Q22 8 32 10 Q34 19 32 28 Q22 26 12 28 Q10 19 12 10 Z M28 6 Q38 4 48 6 Q50 16 48 28 Q38 26 28 28 Q26 16 28 6 Z M46 14 Q52 13 58 14 Q59 21 58 28 Q52 27 46 28 Q45 21 46 14 Z" fill="url(#si-brass)" opacity=".95"/>
</svg>`;

// The logbook on the table: a leather book with brass corners and an anchor.
export const BOOK = `<svg class="book" viewBox="0 0 240 120" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="bk-cover" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a321c"/><stop offset=".6" stop-color="#4e1c10"/><stop offset="1" stop-color="#2e0f08"/></linearGradient>
    <linearGradient id="bk-pages" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e2bf"/><stop offset="1" stop-color="#b89a68"/></linearGradient>
    ${BRASS("bk-brass", 1, 1)}
  </defs>
  <rect x="10" y="12" width="226" height="104" rx="6" fill="url(#bk-pages)"/>
  <rect x="4" y="4" width="226" height="104" rx="6" fill="url(#bk-cover)" stroke="#1a0603" stroke-width="2"/>
  <rect x="14" y="13" width="206" height="86" rx="4" fill="none" stroke="#d6aa4e" stroke-opacity=".55" stroke-width="1.5"/>
  <path d="M4 22 V4 H22 Z M230 22 V4 H212 Z M4 90 V108 H22 Z M230 90 V108 H212 Z" fill="url(#bk-brass)"/>
</svg>`;

// The brass stand the parrot keeps during the battle.
export const STAND = `<svg class="stand" viewBox="0 0 160 120" aria-hidden="true">
  <defs>${BRASS("st-brass", 1, 0)}${BRASS("st-brass-v", 0, 1)}</defs>
  <ellipse cx="80" cy="112" rx="48" ry="7" fill="#000" opacity=".35"/>
  <rect x="8" y="2" width="144" height="12" rx="6" fill="url(#st-brass-v)" stroke="#5a3a0a" stroke-width="1"/>
  <path d="M74 10 H86 L90 96 H70 Z" fill="url(#st-brass)"/>
  <rect x="64" y="40" width="32" height="8" rx="4" fill="url(#st-brass-v)"/>
  <path d="M42 112 Q80 86 118 112 Z" fill="url(#st-brass)"/>
</svg>`;

// The painted sea under each battle card (the miniatures stand on it, without their base).
export const CARD_SEA = `<svg class="card-sea" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="cs-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7aa3"/><stop offset="1" stop-color="#0c2a46"/></linearGradient></defs>
  <rect width="300" height="80" fill="url(#cs-water)"/>
  <path d="M0 14 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V80 H0 Z" fill="#2a6488" opacity=".7"/>
  <path d="M0 34 q20 -7 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V80 H0 Z" fill="#174a70" opacity=".8"/>
  <g stroke="#e8f4ff" stroke-width="1.6" fill="none" opacity=".6"><path d="M30 22 q6 -3 12 0 M120 18 q6 -3 12 0 M210 26 q6 -3 12 0 M70 44 q6 -3 12 0 M250 46 q6 -3 12 0"/></g>
  <path d="M130 6 h40 M138 12 h24" stroke="#ffd994" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
</svg>`;
