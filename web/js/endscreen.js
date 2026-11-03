// End-of-game screens: "VICTORY" (dancing pirate, falling gold) and "DEFEAT" (crying pirate,
// storm). Shown once the game has a result; they never touch the game state.

import { esc } from "./html.js";
import { sfx } from "./sound.js";

const COIN = `
<svg viewBox="0 0 60 60" aria-hidden="true">
  <circle cx="30" cy="30" r="28" fill="#f2b51d" stroke="#8a5a00" stroke-width="3"/>
  <circle cx="30" cy="30" r="21" fill="#ffd34d" stroke="#c98a00" stroke-width="2.5"/>
  <path d="M30 15 L34 26 L46 26 L36.5 33 L40 44 L30 37.5 L20 44 L23.5 33 L14 26 L26 26 Z" fill="#e6a100" stroke="#a86f00" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 20 Q20 10 32 9" stroke="#fff7c2" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

const BOLT = `
<svg viewBox="0 0 80 300" aria-hidden="true" preserveAspectRatio="none">
  <path d="M46 0 L18 120 L40 122 L12 300 L68 100 L44 98 L64 0 Z" fill="#fffbe0" stroke="#bfe3ff" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

let active = null;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function coinsHtml(count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const size = rand(22, 58).toFixed(0);
    parts.push(
      `<div class="coin" style="--x:${rand(-2, 100).toFixed(1)}vw;--size:${size}px;` +
        `--dur:${rand(2.6, 5.2).toFixed(2)}s;--delay:${rand(-5, 2.5).toFixed(2)}s;` +
        `--drift:${rand(-14, 14).toFixed(1)}vw;--spin:${rand(-540, 540).toFixed(0)}deg;--flip:${rand(0.5, 1.4).toFixed(2)}s">` +
        `<div class="coin-face">${COIN}</div></div>`,
    );
  }
  return parts.join("");
}

function sparklesHtml(count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(
      `<span class="sparkle" style="left:${rand(0, 100).toFixed(1)}%;top:${rand(0, 100).toFixed(1)}%;` +
        `--size:${rand(8, 22).toFixed(0)}px;animation-delay:${rand(0, 2.4).toFixed(2)}s"></span>`,
    );
  }
  return parts.join("");
}

// Heavy rain on a canvas; returns a stop function.
function reducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function startRain(canvas) {
  if (reducedMotion()) return () => {}; // a still, dark sky instead of moving rain
  const ctx = canvas.getContext("2d");
  let drops = [];
  let running = true;
  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    const n = Math.round((innerWidth * innerHeight) / 4200);
    drops = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: rand(14, 30) * devicePixelRatio,
      speed: rand(16, 28) * devicePixelRatio,
      alpha: rand(0.25, 0.6),
    }));
  }
  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.4 * devicePixelRatio;
    ctx.lineCap = "round";
    for (const d of drops) {
      ctx.strokeStyle = `rgba(190, 215, 255, ${d.alpha})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.25, d.y + d.len);
      ctx.stroke();
      d.x -= d.speed * 0.25;
      d.y += d.speed;
      if (d.y > canvas.height) {
        d.y = -d.len;
        d.x = Math.random() * canvas.width * 1.2;
      }
    }
    requestAnimationFrame(frame);
  }
  resize();
  addEventListener("resize", resize);
  requestAnimationFrame(frame);
  return () => {
    running = false;
    removeEventListener("resize", resize);
  };
}

// Lightning at random intervals; returns a stop function.
function startLightning(overlay) {
  if (reducedMotion()) return () => {}; // no flashes for people who asked for less motion
  let timer = null;
  function strike() {
    const bolt = overlay.querySelector(".bolt");
    bolt.style.left = `${rand(8, 85).toFixed(1)}%`;
    bolt.style.setProperty("--tilt", `${rand(-12, 12).toFixed(1)}deg`);
    overlay.classList.remove("strike");
    void overlay.offsetWidth;
    overlay.classList.add("strike");
    sfx.thunder();
    timer = setTimeout(strike, rand(2200, 5200));
  }
  timer = setTimeout(strike, 700);
  return () => clearTimeout(timer);
}

export function closeEndScreen() {
  if (!active) return;
  const { overlay, stops } = active;
  active = null;
  for (const stop of stops) stop();
  overlay.classList.add("leaving");
  setTimeout(() => overlay.remove(), 450);
}

// kind: "victory" | "defeat". labels: {title, sub, again, menu, boards}.
export function showEndScreen(kind, labels, { onAgain, onMenu } = {}) {
  closeEndScreen();
  const overlay = document.createElement("div");
  overlay.className = `endscreen ${kind}`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", labels.title);
  const victory = kind === "victory";
  const backdrop = victory
    ? `<div class="end-glow"></div><div class="end-rays"></div>
       <div class="coins">${coinsHtml(46)}</div><div class="sparkles">${sparklesHtml(26)}</div>`
    : `<div class="storm-dark"></div>
       <div class="clouds"><span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span><span class="cloud c4"></span></div>
       <canvas class="rain"></canvas><div class="flash"></div><div class="bolt">${BOLT}</div>`;
  const pirate = victory
    ? `<div class="pirate-stage dance"><span class="stage-shadow"></span>
         <img src="img/pirate-happy.webp" alt="" draggable="false"></div>`
    : `<div class="pirate-stage cry"><span class="stage-shadow"></span>
         <div class="cry-body"><img src="img/pirate-sad.webp" alt="" draggable="false">
           <span class="tear t1"></span><span class="tear t2"></span><span class="tear t3"></span><span class="tear t4"></span>
         </div></div>`;
  overlay.innerHTML = `
    ${backdrop}
    <div class="end-content">
      ${pirate}
      <div class="end-text">
        <h1 class="end-title" data-text="${esc(labels.title)}">${esc(labels.title)}</h1>
        ${labels.sub ? `<p class="end-sub">${esc(labels.sub)}</p>` : ""}
        <div class="end-buttons">
          <button class="primary" data-act="again">${esc(labels.again)}</button>
          <button data-act="menu">${esc(labels.menu)}</button>
          <button data-act="boards">${esc(labels.boards)}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const stops = [];
  // the fanfare or the lament is the music's (music.js); here only coins or the storm
  if (victory) sfx.coins();
  else sfx.thunder(0);
  if (!victory) {
    stops.push(startRain(overlay.querySelector(".rain")));
    stops.push(startLightning(overlay));
  }
  const onKey = (event) => {
    if (event.key === "Escape") closeEndScreen();
  };
  addEventListener("keydown", onKey);
  stops.push(() => removeEventListener("keydown", onKey));
  active = { overlay, stops };

  overlay.querySelector('[data-act="again"]').addEventListener("click", () => {
    closeEndScreen();
    onAgain?.();
  });
  overlay.querySelector('[data-act="menu"]').addEventListener("click", () => {
    closeEndScreen();
    onMenu?.();
  });
  overlay.querySelector('[data-act="boards"]').addEventListener("click", closeEndScreen);
  overlay.querySelector('[data-act="again"]').focus({ preventScroll: true });
}
