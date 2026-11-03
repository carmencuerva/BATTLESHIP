// The captain's cabin: the "Set sail!" screen drawn as the inside of a pirate ship, with a
// strategy table, a naval chart and the props that hold each setting. Everything here is
// own artwork (inline SVG) plus small pure helpers; app.js wires it to the real settings.

// --- the chart: where things are (in the chart's 800 x 460 viewBox) ---------------------

export const CHART = { width: 800, height: 460 };
export const HOME = { x: 118, y: 318 }; // our ship
export const DESTINATIONS = {
  hvb: { x: 640, y: 128 }, // the enemy fortress
  bvb: { x: 520, y: 352 }, // two ships in battle
  hvh: { x: 272, y: 116 }, // the harbour
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

// Where a destination sits over the chart, in % of its box (for the HTML buttons).
export function destinationSpot(mode) {
  const d = DESTINATIONS[mode];
  return { left: (100 * d.x) / CHART.width, top: (100 * d.y) / CHART.height };
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

// --- artwork ---------------------------------------------------------------------------------

export const SKULL = `<svg class="skull-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4.7 0-8 3.2-8 7.4 0 2.5 1.2 4.3 3 5.4v2.6c0 .6.5 1.1 1.1 1.1H9v1.8c0 .4.3.7.7.7h.6c.4 0 .7-.3.7-.7V19h2v1.8c0 .4.3.7.7.7h.6c.4 0 .7-.3.7-.7V19h.9c.6 0 1.1-.5 1.1-1.1v-2.6c1.8-1.1 3-2.9 3-5.4 0-4.2-3.3-7.4-8-7.4z" fill="currentColor"/><circle cx="8.8" cy="10.6" r="2.1" fill="#1c120a"/><circle cx="15.2" cy="10.6" r="2.1" fill="#1c120a"/><path d="M12 13.2l-1.2 2.1h2.4z" fill="#1c120a"/></svg>`;

export const LOGO = `<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M7 41 L33 15 M41 41 L15 15" stroke="#d9c38a" stroke-width="4" stroke-linecap="round"/>
  <path d="M4 38 l6 6 M44 38 l-6 6" stroke="#8a5326" stroke-width="5" stroke-linecap="round"/>
  <path d="M24 5c-7 0-12 4.6-12 10.8 0 3.6 1.7 6.3 4.4 7.9v3.4c0 .9.7 1.6 1.6 1.6h12c.9 0 1.6-.7 1.6-1.6v-3.4c2.7-1.6 4.4-4.3 4.4-7.9C36 9.6 31 5 24 5z" fill="#f3ead8" stroke="#2a1a0c" stroke-width="2"/>
  <circle cx="19.2" cy="16.4" r="3.1" fill="#2a1a0c"/><circle cx="28.8" cy="16.4" r="3.1" fill="#2a1a0c"/>
  <path d="M24 20.2 l-1.8 3 h3.6 z" fill="#2a1a0c"/>
  <path d="M19.5 28.8 v-3 M24 28.8 v-3 M28.5 28.8 v-3" stroke="#2a1a0c" stroke-width="1.6"/>
</svg>`;

export const SPEAKER_ON = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
export const SPEAKER_OFF = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

// The view through the stern window: sunset sky, a far-off ship, a moving swell.
export const WINDOW = `
<svg class="window-view" viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="cab-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#16345a"/><stop offset=".45" stop-color="#5a4d72"/>
      <stop offset=".7" stop-color="#e59a5c"/><stop offset="1" stop-color="#f5cf86"/>
    </linearGradient>
    <linearGradient id="cab-sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f6e98"/><stop offset="1" stop-color="#0a2744"/>
    </linearGradient>
  </defs>
  <rect width="480" height="220" fill="url(#cab-sky)"/>
  <circle cx="352" cy="132" r="30" fill="#ffe2a0" opacity=".92"/>
  <circle cx="352" cy="132" r="52" fill="#ffd27a" opacity=".18"/>
  <g class="far-ship" fill="#2b2236" opacity=".85">
    <path d="M96 128 h46 l-6 8 h-34 z"/><path d="M118 128 V100 l14 18 h-14 M114 126 V108 l-10 14 h10"/>
  </g>
  <rect y="132" width="480" height="88" fill="url(#cab-sea)"/>
  <path d="M320 140 h64 M330 150 h44 M340 160 h26" stroke="#ffd994" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <g class="swell swell-1"><path d="M-120 152 q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V220 H-120 z" fill="#1d567f" opacity=".85"/></g>
  <g class="swell swell-2"><path d="M-120 176 q40 -10 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 V220 H-120 z" fill="#123f63" opacity=".9"/></g>
  <g class="swell swell-3"><path d="M-120 198 q30 -7 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V220 H-120 z" fill="#0b2c4b"/></g>
</svg>`;

// A brass ship's lantern on its chain.
export const LANTERN = `
<svg class="lantern-art" viewBox="0 0 80 170" aria-hidden="true">
  <defs>
    <linearGradient id="cab-brass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a5418"/><stop offset=".45" stop-color="#e2b55a"/><stop offset="1" stop-color="#6d4812"/>
    </linearGradient>
    <radialGradient id="cab-flame" cx=".5" cy=".6" r=".5">
      <stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffc24a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M40 0 V34" stroke="#3b2a18" stroke-width="3" stroke-dasharray="5 3"/>
  <circle cx="40" cy="40" r="7" fill="none" stroke="url(#cab-brass)" stroke-width="3"/>
  <path d="M22 62 L30 48 H50 L58 62 Z" fill="url(#cab-brass)" stroke="#3b2a10" stroke-width="1.5"/>
  <rect x="20" y="62" width="40" height="64" rx="3" fill="#ffd98a" opacity=".22" stroke="url(#cab-brass)" stroke-width="3"/>
  <ellipse class="flame" cx="40" cy="96" rx="10" ry="16" fill="url(#cab-flame)"/>
  <path d="M40 104 c-5 -6 -4 -12 0 -20 c4 8 5 14 0 20 z" fill="#fff1b0"/>
  <path d="M30 62 V126 M50 62 V126" stroke="url(#cab-brass)" stroke-width="2.2"/>
  <path d="M18 126 H62 L56 138 H24 Z" fill="url(#cab-brass)" stroke="#3b2a10" stroke-width="1.5"/>
  <circle cx="40" cy="144" r="4" fill="url(#cab-brass)"/>
</svg>`;

// The parchment chart on the table: coasts, rhumb lines, our ship, and the course to the
// chosen destination (drawn progressively through a mask). `seaName` is already escaped.
export function chartSvg(mode, seaName = "") {
  const course = routePath(mode);
  const to = DESTINATIONS[mode];
  const rose = { x: 712, y: 384 };
  const rhumbs = Array.from({ length: 16 }, (_, k) => {
    const a = (Math.PI * 2 * k) / 16;
    return `<path d="M${rose.x} ${rose.y} L${Math.round(rose.x + Math.cos(a) * 900)} ${Math.round(rose.y + Math.sin(a) * 900)}"/>`;
  }).join("");
  return `
<svg class="chart-art" viewBox="0 0 800 460" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <radialGradient id="cab-paper" cx=".5" cy=".45" r=".75">
      <stop offset="0" stop-color="#f1dfb3"/><stop offset=".75" stop-color="#e2c48c"/><stop offset="1" stop-color="#b98d52"/>
    </radialGradient>
    <pattern id="cab-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <path d="M0 0 V8" stroke="#7aa6a0" stroke-width="1" opacity=".35"/>
    </pattern>
    <mask id="cab-course-mask"><path class="course-reveal" d="${course}" pathLength="1" stroke="#fff" stroke-width="14" fill="none"/></mask>
  </defs>
  <rect width="800" height="460" fill="url(#cab-paper)"/>
  <rect width="800" height="460" fill="#8fbcb2" opacity=".28"/>
  <g stroke="#6e5332" stroke-width=".8" opacity=".22">${rhumbs}</g>
  <g stroke="#6e5332" stroke-width="1" opacity=".18">
    <path d="M0 115 H800 M0 230 H800 M0 345 H800 M200 0 V460 M400 0 V460 M600 0 V460"/>
  </g>
  <g fill="#d7bf8a" stroke="#6e5332" stroke-width="2.2" stroke-linejoin="round">
    <path d="M0 0 H180 C160 30 120 34 98 58 C74 84 40 80 0 98 Z" fill="url(#cab-hatch)"/>
    <path d="M0 0 H180 C160 30 120 34 98 58 C74 84 40 80 0 98 Z"/>
    <path d="M800 0 V70 C760 62 740 30 700 26 C680 14 690 0 690 0 Z"/>
    <path d="M330 250 c18 -22 52 -26 70 -8 c14 14 8 34 -12 40 c-22 8 -46 2 -58 -10 c-8 -8 -6 -16 0 -22 z"/>
    <path d="M0 420 C40 404 90 410 120 430 C140 444 150 460 150 460 H0 Z"/>
  </g>
  <g fill="#7d9a5a" opacity=".55"><circle cx="360" cy="262" r="6"/><circle cx="376" cy="256" r="5"/><circle cx="58" cy="436" r="6"/></g>
  <g class="chart-rose" transform="translate(${rose.x} ${rose.y})">
    <circle r="40" fill="none" stroke="#6e5332" stroke-width="2"/>
    <path d="M0 -50 L7 0 L0 50 L-7 0 Z" fill="#6e5332"/><path d="M-50 0 L0 -7 L50 0 L0 7 Z" fill="#6e5332" opacity=".6"/>
    <path d="M0 -50 L7 0 L-7 0 Z" fill="#b5241a"/>
    <text y="-56" text-anchor="middle" font-family="Pirata One, serif" font-size="18" fill="#6e5332">N</text>
  </g>
  <text x="400" y="440" text-anchor="middle" font-family="Pirata One, serif" font-size="22" fill="#6e5332" opacity=".55">${seaName}</text>
  ${
    course
      ? `<path d="${course}" stroke="#5e1410" stroke-width="7" fill="none" opacity=".18" mask="url(#cab-course-mask)"/>
  <path class="course" d="${course}" stroke="#b5241a" stroke-width="4.5" stroke-dasharray="12 9" stroke-linecap="round" fill="none" mask="url(#cab-course-mask)"/>
  <g class="course-end" transform="translate(${to.x} ${to.y + 44})"><path d="M-9 -9 L9 9 M9 -9 L-9 9" stroke="#b5241a" stroke-width="5" stroke-linecap="round"/></g>`
      : ""
  }
  <g class="home-ship" transform="translate(${HOME.x} ${HOME.y})">
    <ellipse rx="34" ry="8" cy="18" fill="#3b2a18" opacity=".25"/>
    <path d="M-30 4 H30 L22 16 H-22 Z" fill="#7a4a22" stroke="#2f1a0a" stroke-width="2"/>
    <path d="M-2 4 V-34 M14 4 V-22" stroke="#3b2a18" stroke-width="3"/>
    <path d="M-2 -32 Q-22 -18 -2 -2 Z M14 -20 Q2 -10 14 0 Z" fill="#f4ead2" stroke="#6e5332" stroke-width="1.5"/>
    <path d="M-2 -34 l16 4 l-16 5 z" fill="#b5241a"/>
  </g>
</svg>`;
}

// The three destinations, each a small illustration on the chart.
export const DESTINATION_ART = {
  // an island with the enemy captain's fortress
  hvb: `<svg viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="60" cy="80" rx="54" ry="14" fill="#8fbcb2" opacity=".6"/>
    <path d="M10 78 C20 60 44 58 60 60 C80 58 104 62 110 78 Z" fill="#d9b874" stroke="#6e5332" stroke-width="2"/>
    <path d="M24 68 c4 -10 14 -10 18 0 M86 70 c3 -8 11 -8 14 0" fill="#6f8f45"/>
    <g fill="#8d8a84" stroke="#3d3a36" stroke-width="2">
      <rect x="38" y="36" width="44" height="30"/>
      <path d="M38 36 v-8 h7 v5 h7 v-5 h7 v5 h8 v-5 h7 v5 h8 v8 z"/>
      <rect x="50" y="14" width="20" height="24"/>
      <path d="M50 14 v-6 h5 v4 h5 v-4 h5 v4 h5 v6 z"/>
    </g>
    <path d="M56 66 v-12 a4 4 0 0 1 8 0 v12" fill="#2a2420"/>
    <path d="M60 8 V-6" stroke="#2a2420" stroke-width="2.2"/>
    <path d="M60 -6 h22 l-5 6 l5 6 h-22 z" fill="#1c1a1a"/>
    <circle cx="70" cy="0" r="2.6" fill="#f3ead8"/>
  </svg>`,
  // two ships trading broadsides
  bvb: `<svg viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="60" cy="80" rx="56" ry="12" fill="#8fbcb2" opacity=".6"/>
    <g stroke="#2f1a0a" stroke-width="2">
      <path d="M6 70 H46 L40 80 H12 Z" fill="#7a4a22"/>
      <path d="M74 70 H114 L108 80 H80 Z" fill="#4a2c14"/>
    </g>
    <path d="M24 70 V34 M92 70 V34" stroke="#3b2a18" stroke-width="3"/>
    <path d="M24 36 Q44 48 24 66 Z" fill="#f4ead2" stroke="#6e5332" stroke-width="1.5"/>
    <path d="M92 36 Q72 48 92 66 Z" fill="#2b2f36" stroke="#111" stroke-width="1.5"/>
    <path d="M24 34 l12 3 l-12 4 z" fill="#b5241a"/><path d="M92 34 l-12 3 l12 4 z" fill="#111"/>
    <g fill="#f4f1ea" opacity=".9"><circle cx="54" cy="62" r="6"/><circle cx="62" cy="58" r="7"/><circle cx="70" cy="63" r="5"/></g>
    <path d="M48 64 h-4 M76 64 h4" stroke="#ff8a1a" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  // a harbour with two captains on the quay
  hvh: `<svg viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="60" cy="82" rx="56" ry="12" fill="#8fbcb2" opacity=".6"/>
    <path d="M8 72 H112 V80 H8 Z" fill="#9a6b3a" stroke="#4a2c14" stroke-width="2"/>
    <path d="M16 80 V92 M40 80 V92 M64 80 V92 M88 80 V92 M108 80 V92" stroke="#4a2c14" stroke-width="3"/>
    <rect x="66" y="40" width="40" height="32" fill="#e9dcc0" stroke="#6e5332" stroke-width="2"/>
    <path d="M62 42 L86 22 L110 42 Z" fill="#b5341f" stroke="#5e1410" stroke-width="2"/>
    <rect x="80" y="54" width="12" height="18" fill="#6e4a24"/>
    <g>
      <circle cx="26" cy="46" r="7" fill="#e8b98e"/><path d="M16 44 Q26 32 36 44 Z" fill="#1c1a1a"/>
      <path d="M20 54 h12 v18 h-12 z" fill="#b5241a"/>
      <circle cx="48" cy="48" r="7" fill="#d79c6e"/><path d="M38 46 Q48 34 58 46 Z" fill="#1c1a1a"/>
      <path d="M42 56 h12 v16 h-12 z" fill="#2457c5"/>
    </g>
  </svg>`,
};

export const PORTRAIT = `<svg class="portrait-art" viewBox="0 0 100 100" aria-hidden="true">
  <rect width="100" height="100" fill="#d9c08a"/>
  <path d="M50 96 c-22 0 -36 -6 -40 -16 c6 -14 20 -20 40 -20 s34 6 40 20 c-4 10 -18 16 -40 16 z" fill="#5a3418"/>
  <circle cx="50" cy="46" r="20" fill="#7a4e2a"/>
  <path d="M18 40 Q50 4 82 40 Q66 30 50 34 Q34 30 18 40 Z" fill="#2a1a0c"/>
  <path d="M30 42 h40" stroke="#8a1c14" stroke-width="5"/>
  <circle cx="58" cy="46" r="6" fill="#1c120a"/><path d="M52 44 L36 40" stroke="#1c120a" stroke-width="2"/>
  <path d="M42 58 q8 5 16 0" stroke="#2a1a0c" stroke-width="2" fill="none"/>
</svg>`;

export const SPYGLASS = `<svg class="spyglass-art" viewBox="0 0 220 80" aria-hidden="true">
  <defs>
    <linearGradient id="cab-tube" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2cf7a"/><stop offset=".5" stop-color="#b8862f"/><stop offset="1" stop-color="#6d4812"/>
    </linearGradient>
  </defs>
  <g transform="rotate(-10 110 40)">
    <ellipse cx="110" cy="64" rx="96" ry="6" fill="#1c120a" opacity=".3"/>
    <rect x="18" y="30" width="58" height="22" rx="3" fill="#5a3418"/>
    <rect x="74" y="27" width="62" height="28" rx="3" fill="url(#cab-tube)"/>
    <rect x="134" y="23" width="58" height="36" rx="4" fill="url(#cab-tube)"/>
    <g fill="#5a3a10"><rect x="72" y="25" width="6" height="32"/><rect x="132" y="21" width="6" height="40"/><rect x="186" y="20" width="8" height="42"/></g>
    <rect x="8" y="33" width="12" height="16" rx="2" fill="#2a1a0c"/>
    <ellipse cx="196" cy="41" rx="4" ry="17" fill="#9bd0ff" opacity=".7"/>
  </g>
</svg>`;

// A brass compass; .needle is turned by app.js to point at the chosen wind.
export const COMPASS = `<svg class="compass-art" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="cab-case" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#f3d58a"/><stop offset=".7" stop-color="#a87a2c"/><stop offset="1" stop-color="#5e3e10"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="47" fill="url(#cab-case)" stroke="#3b2810" stroke-width="2"/>
  <circle cx="50" cy="50" r="38" fill="#efe2c2" stroke="#6e5332" stroke-width="1.5"/>
  <g stroke="#6e5332" stroke-width="1.2" opacity=".6"><path d="M50 14 V20 M50 80 V86 M14 50 H20 M80 50 H86"/></g>
  <text x="50" y="27" text-anchor="middle" font-family="Pirata One, serif" font-size="12" fill="#6e5332">N</text>
  <g class="needle"><path d="M50 18 L55 50 L50 82 L45 50 Z" fill="#2a1a0c"/><path d="M50 18 L55 50 L45 50 Z" fill="#b5241a"/></g>
  <circle cx="50" cy="50" r="4" fill="#e2b55a" stroke="#3b2810"/>
</svg>`;

// Navigation dividers resting on a grid: the size of the sea.
export const DIVIDERS = `<svg class="dividers-art" viewBox="0 0 100 100" aria-hidden="true">
  <rect x="10" y="40" width="80" height="52" fill="#e8d3a3" stroke="#6e5332" stroke-width="2"/>
  <g stroke="#6e5332" stroke-width="1" opacity=".5"><path d="M10 53 H90 M10 66 H90 M10 79 H90 M26 40 V92 M42 40 V92 M58 40 V92 M74 40 V92"/></g>
  <g stroke="#7a5418" stroke-width="4" stroke-linecap="round"><path d="M50 10 L24 86 M50 10 L76 86"/></g>
  <circle cx="50" cy="12" r="6" fill="#e2b55a" stroke="#3b2810" stroke-width="2"/>
  <path d="M36 52 Q50 44 64 52" stroke="#3b2810" stroke-width="2" fill="none"/>
</svg>`;

export const LOGBOOK = `<svg class="logbook-art" viewBox="0 0 120 90" aria-hidden="true">
  <rect x="10" y="12" width="100" height="70" rx="3" fill="#1c120a" opacity=".25"/>
  <rect x="6" y="6" width="100" height="70" rx="3" fill="#5a2a18" stroke="#2a120a" stroke-width="2"/>
  <rect x="6" y="6" width="14" height="70" fill="#3e1c10"/>
  <rect x="104" y="10" width="6" height="62" fill="#efe2c2"/>
  <g fill="#e2b55a"><path d="M20 6 h12 l-12 12 z M106 6 v12 l-12 -12 z M20 76 h12 l-12 -12 z M106 76 v-12 l-12 12 z"/></g>
  <g transform="translate(63 40) scale(1.2)" fill="#e2b55a">
    <path d="M0 -14c-7 0-12 5-12 11 0 4 2 7 5 8v4h14v-4c3-1 5-4 5-8 0-6-5-11-12-11z"/>
    <circle cx="-4.5" cy="-3" r="2.8" fill="#5a2a18"/><circle cx="4.5" cy="-3" r="2.8" fill="#5a2a18"/>
  </g>
  <path d="M84 76 V92 l5 -4 l5 4 V76" fill="#b5241a"/>
</svg>`;
