// Effects drawn over the whole page (a fixed, click-through layer): the missile, impact
// explosions, water splashes and sinking bubbles. They only decorate events that Python has
// already decided; none of them changes the game.

// A slim steel missile seen from the side: ogive nose, gunmetal body with a sheen, a few
// painted bands, swept fins, and a white-hot exhaust plume.
const MISSILE = `
<svg viewBox="0 0 160 40" aria-hidden="true">
  <defs>
    <linearGradient id="fx-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5d6670"/><stop offset=".22" stop-color="#d9dfe4"/>
      <stop offset=".5" stop-color="#8b949d"/><stop offset=".8" stop-color="#3b434b"/><stop offset="1" stop-color="#22282e"/>
    </linearGradient>
    <linearGradient id="fx-nose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f44"/><stop offset=".25" stop-color="#9aa2aa"/><stop offset=".6" stop-color="#40464c"/><stop offset="1" stop-color="#16191c"/>
    </linearGradient>
    <linearGradient id="fx-fin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b737b"/><stop offset="1" stop-color="#2a3036"/>
    </linearGradient>
    <radialGradient id="fx-plume" cx="1" cy=".5" r="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".18" stop-color="#fff2b0"/>
      <stop offset=".45" stop-color="#ff9a2e" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a10" stop-opacity="0"/>
    </radialGradient>
    <filter id="fx-soft" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="1.6"/></filter>
  </defs>
  <g class="exhaust" filter="url(#fx-soft)">
    <ellipse cx="14" cy="20" rx="26" ry="7.5" fill="url(#fx-plume)"/>
    <ellipse cx="30" cy="20" rx="9" ry="3.6" fill="#fffdf0"/>
  </g>
  <path d="M40 14.5 L30 3 L46 3 L58 14.5 Z" fill="url(#fx-fin)" stroke="#1b1f23" stroke-width=".8"/>
  <path d="M40 25.5 L30 37 L46 37 L58 25.5 Z" fill="url(#fx-fin)" stroke="#1b1f23" stroke-width=".8"/>
  <rect x="34" y="16.5" width="6" height="7" fill="#2a2f34"/>
  <path d="M38 14 H118 V26 H38 Z" fill="url(#fx-body)"/>
  <path d="M118 14 C134 14.5 146 17 156 20 C146 23 134 25.5 118 26 Z" fill="url(#fx-nose)"/>
  <rect x="64" y="14" width="3" height="12" fill="#b0291f" opacity=".85"/>
  <rect x="70" y="14" width="1.5" height="12" fill="#e2c35a" opacity=".8"/>
  <rect x="108" y="14" width="2" height="12" fill="#1f2428" opacity=".7"/>
  <path d="M96 12.6 L112 12.6 L108 14 L96 14 Z" fill="#4a5158"/>
  <path d="M40 16.2 H118" stroke="#f4f7f9" stroke-width="1" opacity=".55"/>
  <path d="M38 26 H118" stroke="#0e1114" stroke-width=".8" opacity=".6"/>
</svg>`;

let layer = null;

function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function spawn(className, x, y, style = "") {
  const el = document.createElement("div");
  el.className = className;
  el.style.cssText = `left:${x}px;top:${y}px;${style}`;
  fxLayer().appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 3000); // safety net
  return el;
}

function centre(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Flies a missile in an arc from `fromRect` to the centre of `toRect`. Resolves on impact.
export function launchMissile(fromRect, toRect, duration = 650) {
  const from = centre(fromRect);
  const to = centre(toRect);
  if (reducedMotion() || duration <= 0) return Promise.resolve();
  const missile = document.createElement("div");
  missile.className = "missile";
  missile.innerHTML = MISSILE;
  fxLayer().appendChild(missile);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(220, 60 + dist * 0.35); // arc height
  const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const point = (t) => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * to.y,
  });
  const scaleAt = (t) => 0.9 + 0.22 * Math.sin(Math.PI * t); // a little bigger at the top of the arc

  return new Promise((resolve) => {
    const start = performance.now();
    let lastTail = null;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const p = point(eased);
      const ahead = point(Math.min(1, eased + 0.02));
      const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      missile.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}rad) scale(${scaleAt(eased)})`;
      // a grey trail that spreads out and drifts up as it thins: one puff every few pixels
      // of the path, however fast the screen refreshes
      const back = 44 * scaleAt(eased);
      const tail = { x: p.x - Math.cos(angle) * back, y: p.y - Math.sin(angle) * back };
      const from = lastTail ?? tail;
      const steps = Math.min(30, Math.floor(Math.hypot(tail.x - from.x, tail.y - from.y) / 4));
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        spawn(
          "smoke",
          from.x + (tail.x - from.x) * f + (Math.random() - 0.5) * 3,
          from.y + (tail.y - from.y) * f + (Math.random() - 0.5) * 3,
          `--s:${(0.75 + Math.random() * 0.5).toFixed(2)};--dx:${(Math.random() * 12 - 6).toFixed(1)}px;--g:${Math.round(150 + Math.random() * 50)}`,
        );
      }
      if (steps || !lastTail) lastTail = tail;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        missile.remove();
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

// A cartoon blast with sparks, for hits and sinks.
export function explode(rect, big = false) {
  const { x, y } = centre(rect);
  const size = Math.max(rect.width, 24) * (big ? 3.2 : 2.3);
  spawn("blast", x, y, `--size:${size}px`);
  spawn("blast-ring", x, y, `--size:${size * 1.2}px`);
  for (let i = 0; i < (big ? 14 : 9); i++) {
    const a = (Math.PI * 2 * i) / (big ? 14 : 9) + Math.random() * 0.4;
    const d = size * (0.55 + Math.random() * 0.5);
    spawn("spark", x, y, `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`);
  }
  for (let i = 0; i < 3; i++) {
    spawn("puff", x + (Math.random() - 0.5) * 20, y, `--s:${1 + Math.random()};animation-delay:${i * 90}ms`);
  }
}

// A water splash with droplets and ripples, for misses.
export function splash(rect) {
  const { x, y } = centre(rect);
  const size = Math.max(rect.width, 24);
  spawn("ripple", x, y, `--size:${size * 1.6}px`);
  spawn("ripple", x, y, `--size:${size * 2.2}px;animation-delay:120ms`);
  spawn("splash-column", x, y, `--size:${size}px`);
  for (let i = 0; i < 8; i++) {
    const dx = (Math.random() - 0.5) * size * 2.2;
    const up = size * (0.9 + Math.random() * 0.9);
    spawn("drop", x, y, `--dx:${dx}px;--up:${-up}px;animation-delay:${Math.random() * 60}ms`);
  }
}

// Bubbles rising from a ship that goes down.
export function bubbles(rect) {
  for (let i = 0; i < 16; i++) {
    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + rect.height * (0.4 + Math.random() * 0.6);
    const s = 4 + Math.random() * 9;
    spawn("bubble-fx", x, y, `--s:${s}px;--rise:${-(30 + Math.random() * 60)}px;animation-delay:${Math.random() * 900}ms`);
  }
}
