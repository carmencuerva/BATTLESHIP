// Effects drawn over the whole page (a fixed, click-through layer): the missile, impact
// explosions, water splashes and sinking bubbles. They only decorate events that Python has
// already decided; none of them changes the game.

const MISSILE = `
<svg viewBox="0 0 120 40" aria-hidden="true">
  <g class="exhaust"><path d="M14 20 L-6 11 Q2 20 -6 29 Z" fill="#ffb21f"/><path d="M14 20 L2 15 Q7 20 2 25 Z" fill="#fff0a0"/></g>
  <path d="M30 20 L12 6 L22 20 L12 34 Z" fill="#c4312a" stroke="#4a1210" stroke-width="2" stroke-linejoin="round"/>
  <rect x="18" y="12" width="70" height="16" rx="8" fill="#e9eef3" stroke="#2c3440" stroke-width="2.5"/>
  <path d="M86 12 Q112 14 116 20 Q112 26 86 28 Z" fill="#d83a2f" stroke="#4a1210" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="44" y="12" width="7" height="16" fill="#2c3440"/>
  <circle cx="68" cy="20" r="3.5" fill="#2c3440"/>
  <path d="M24 16 H82" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".8"/>
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
  const scaleAt = (t) => 0.75 + 0.5 * Math.sin(Math.PI * t); // bigger at the top of the arc

  return new Promise((resolve) => {
    const start = performance.now();
    let lastPuff = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const p = point(eased);
      const ahead = point(Math.min(1, eased + 0.02));
      const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      missile.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}rad) scale(${scaleAt(eased)})`;
      if (now - lastPuff > 22) {
        lastPuff = now;
        const back = 26 * scaleAt(eased);
        spawn(
          "smoke",
          p.x - Math.cos(angle) * back,
          p.y - Math.sin(angle) * back,
          `--s:${(0.6 + Math.random() * 0.6).toFixed(2)};--dx:${(Math.random() * 10 - 5).toFixed(1)}px`,
        );
      }
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
