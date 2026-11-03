// Where the parrot may sit: pure geometry on plain rectangles ({left, top, right, bottom},
// in viewport pixels), no DOM, so it can be tested on its own.
//
// A perch is a free spot along the screen's corners and edges or right next to a board,
// that is entirely on screen and covers none of the obstacles (boards, buttons, scrolls…).

export function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height };
}

export function overlaps(a, b, pad = 0) {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}

export function inside(a, view, margin = 0) {
  return a.left >= margin && a.top >= margin && a.right <= view.width - margin && a.bottom <= view.height - margin;
}

const centre = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

// Candidate top-left corners for a parrot of `size` {width, height}.
// "edges": corners and sides of the screen (quiet perches). "around": next to `board`.
// "top": a band along the top of the screen (phones). "grid": anywhere (a fallback).
export function candidates(kind, view, size, { board = null, margin = 8, gap = 10 } = {}) {
  const { width: w, height: h } = size;
  const xs = (n) => Array.from({ length: n }, (_, k) => margin + ((view.width - w - 2 * margin) * k) / (n - 1));
  const ys = (n) => Array.from({ length: n }, (_, k) => margin + ((view.height - h - 2 * margin) * k) / (n - 1));
  const spots = [];
  if (kind === "edges") {
    for (const y of ys(5)) spots.push([margin, y], [view.width - w - margin, y]);
    for (const x of xs(5)) spots.push([x, margin], [x, view.height - h - margin]);
  } else if (kind === "top") {
    for (const y of [margin, view.height * 0.12, view.height * 0.24, view.height * 0.36]) {
      for (const x of xs(6)) spots.push([x, y]);
    }
  } else if (kind === "grid") {
    // anywhere on screen: the fallback when the edges are all taken
    for (const y of ys(Math.max(2, Math.ceil(view.height / (h / 2))))) {
      for (const x of xs(Math.max(2, Math.ceil(view.width / (w / 2))))) spots.push([x, y]);
    }
  } else if (kind === "around" && board) {
    const bh = board.bottom - board.top;
    const bw = board.right - board.left;
    for (const k of [0, 0.5, 1]) {
      const y = board.top + (bh - h) * k;
      spots.push([board.left - w - gap, y], [board.right + gap, y]);
      const x = board.left + (bw - w) * k;
      spots.push([x, board.top - h - gap], [x, board.bottom + gap]);
    }
  }
  return spots.map(([x, y]) => rect(Math.round(x), Math.round(y), w, h));
}

// The free candidate (inside the view, touching no obstacle) closest to `focus` {x, y};
// `room` optionally grows each candidate (e.g. to leave space for a speech bubble).
// Falls back to the on-screen candidate that covers the least, so the parrot is never lost.
export function choosePerch(spots, { view, obstacles = [], focus = null, room = null, pad = 6, margin = 8 }) {
  const target = focus ?? { x: view.width / 2, y: view.height / 2 };
  const distance = (r) => Math.hypot(centre(r).x - target.x, centre(r).y - target.y);
  const footprint = (r) => (room ? room(r) : r);
  const onScreen = spots.filter((r) => inside(r, view, margin));
  const free = onScreen.filter((r) => inside(footprint(r), view, 0) && !obstacles.some((o) => overlaps(footprint(r), o, pad)));
  if (free.length) return free.reduce((best, r) => (distance(r) < distance(best) ? r : best));
  const covered = (r) => obstacles.reduce((sum, o) => sum + (overlaps(r, o, pad) ? 1 : 0), 0);
  const pool = onScreen.length ? onScreen : [rect(margin, margin, spots[0]?.right - spots[0]?.left || 0, spots[0]?.bottom - spots[0]?.top || 0)];
  return pool.reduce((best, r) => (covered(r) < covered(best) || (covered(r) === covered(best) && distance(r) < distance(best)) ? r : best));
}

// Where a speech bubble can open around the parrot. "side" is the way it extends
// (left or right of the bird); "vertical" is above it, below it, or level with it.
// These must match the [data-side]/[data-vertical] rules in style.css.
export const PLACEMENTS = [
  { side: "right", vertical: "above" },
  { side: "left", vertical: "above" },
  { side: "right", vertical: "below" },
  { side: "left", vertical: "below" },
  { side: "right", vertical: "middle" },
  { side: "left", vertical: "middle" },
];

// The bubble's rectangle for a perch, a bubble size {width, height} and a placement.
export function bubbleBox(perch, bubble, { side, vertical }) {
  const w = perch.right - perch.left;
  let left;
  let top;
  if (vertical === "middle") {
    left = side === "right" ? perch.right + 14 : perch.left - 14 - bubble.width;
    top = (perch.top + perch.bottom) / 2 - bubble.height / 2;
  } else {
    left = side === "right" ? perch.left + 0.35 * w : perch.right - 0.35 * w - bubble.width;
    top = vertical === "above" ? perch.top - 4 - bubble.height : perch.bottom + 26;
  }
  return rect(Math.round(left), Math.round(top), bubble.width, bubble.height);
}

// Where to perch to speak: the free spot (parrot and bubble both on screen and covering
// nothing) closest to `focus`, with the bubble placement that makes it free. If no spot is
// free with its bubble, the best free perch with its least intrusive bubble.
// Returns {perch, placement}.
export function chooseSpeakingSpot(spots, { view, obstacles = [], focus = null, bubble, pad = 6, margin = 8 }) {
  const target = focus ?? { x: view.width / 2, y: view.height / 2 };
  const distance = (r) => Math.hypot(centre(r).x - target.x, centre(r).y - target.y);
  const clear = (r) => !obstacles.some((o) => overlaps(r, o, pad));
  let best = null;
  for (const perch of spots) {
    if (!inside(perch, view, margin) || !clear(perch)) continue;
    for (const placement of PLACEMENTS) {
      const box = bubbleBox(perch, bubble, placement);
      if (!inside(box, view, 4) || !clear(box)) continue;
      if (!best || distance(perch) < distance(best.perch)) best = { perch, placement };
    }
  }
  if (best) return best;
  // Nothing fits with its bubble: perch somewhere free and pick the bubble that covers least.
  const perch = choosePerch(spots, { view, obstacles, focus, pad, margin });
  const cost = (placement) => {
    const box = bubbleBox(perch, bubble, placement);
    const off = inside(box, view, 4) ? 0 : 100;
    return off + obstacles.filter((o) => overlaps(box, o, pad)).length;
  };
  const placement = PLACEMENTS.reduce((a, b) => (cost(b) < cost(a) ? b : a));
  return { perch, placement };
}
