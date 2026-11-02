// The parrot: the game's commentator. Every gameplay message (turns, shot results, the end
// of the game) is spoken through its comic speech bubble.

import { getLang } from "./i18n.js";
import { sfx, speak } from "./sound.js";

const PARROT_SVG = `
<svg viewBox="0 0 160 200" aria-hidden="true">
  <g class="perch">
    <rect x="8" y="176" width="146" height="13" rx="6.5" fill="#7a4a22" stroke="#3d2210" stroke-width="2.5"/>
    <path d="M20 180 H70 M96 184 H140" stroke="#a26a35" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <g class="bird">
    <g class="tail">
      <path d="M70 140 L50 199 L64 199 L82 146 Z" fill="#d81f26" stroke="#7a1015" stroke-width="2"/>
      <path d="M80 146 L72 200 L86 200 L92 146 Z" fill="#2d6fd6" stroke="#173f86" stroke-width="2"/>
      <path d="M56 186 L50 199 L64 199 L67 190 Z" fill="#2d6fd6"/>
    </g>
    <ellipse cx="80" cy="124" rx="35" ry="45" fill="#e0262b" stroke="#7a1015" stroke-width="2.5"/>
    <ellipse cx="90" cy="132" rx="19" ry="31" fill="#f2503d"/>
    <g class="feet" fill="#9a9a9a" stroke="#4d4d4d" stroke-width="1.5">
      <path d="M68 166 q-2 10 -9 12 h20 q-5 -3 -5 -12 z"/>
      <path d="M90 166 q-2 10 -9 12 h20 q-5 -3 -5 -12 z"/>
    </g>
    <g class="wing">
      <path d="M64 92 C38 100 34 144 50 174 C60 164 72 150 76 128 C78 110 74 97 64 92 Z"
            fill="#d81f26" stroke="#7a1015" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M48 118 C45 136 48 152 54 164 L68 148 C72 138 74 126 73 116 Z" fill="#f7c331"/>
      <path d="M44 144 C43 158 46 168 50 174 C56 168 63 160 66 152 Z" fill="#2d6fd6"/>
      <path d="M50 150 l8 -6 M47 160 l9 -5" stroke="#173f86" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g class="head">
      <circle cx="84" cy="62" r="31" fill="#e0262b" stroke="#7a1015" stroke-width="2.5"/>
      <ellipse cx="99" cy="61" rx="16" ry="14" fill="#fff4ec"/>
      <path d="M90 70 q4 2 8 0 M92 75 q4 2 8 0" stroke="#e8b9a8" stroke-width="1.4" fill="none"/>
      <circle cx="100" cy="58" r="6.5" fill="#1b1b1b"/>
      <circle cx="102.2" cy="55.8" r="2.2" fill="#fff"/>
      <ellipse class="lid" cx="100" cy="58" rx="8" ry="8" fill="#fff4ec"/>
      <g class="beak">
        <path d="M108 55 C124 50 137 62 131 82 C128 75 121 71 110 73 Z" fill="#f4ebd8" stroke="#2a2a2a" stroke-width="2"/>
        <path class="jaw" d="M110 73 C119 73 125 77 123 85 C116 88 110 83 108 77 Z" fill="#2b2b2b"/>
      </g>
      <path d="M57 50 Q82 22 112 42 L110 49 Q83 33 60 58 Z" fill="#2457c5" stroke="#12306f" stroke-width="2"/>
      <circle cx="74" cy="40" r="2.2" fill="#fff"/><circle cx="88" cy="35" r="2.2" fill="#fff"/>
      <circle cx="101" cy="38" r="2.2" fill="#fff"/><circle cx="67" cy="49" r="2" fill="#fff"/>
      <path class="knot" d="M58 52 L40 46 L44 58 Z M58 54 L44 66 L54 68 Z" fill="#2457c5" stroke="#12306f" stroke-width="2"/>
    </g>
  </g>
</svg>`;

const DEFAULTS = {
  turn: { hold: 1000, life: 2200 },
  hit: { hold: 900, life: 1800 },
  miss: { hold: 900, life: 1700 },
  sunk: { hold: 1500, life: 2600 },
  info: { hold: 1200, life: 3200 },
};

// Mounts the parrot in `dock` and returns {say(text, {mood, sub}), destroy()}.
// Messages are shown for at least `hold` ms; only the newest waiting message is kept, so
// fast games never build up a backlog of stale announcements.
export function createParrot(dock) {
  dock.innerHTML = `
    <div class="parrot-wrap">
      <div class="bubble" role="status" aria-live="polite"><span class="bubble-text"></span><span class="bubble-sub"></span></div>
      <div class="parrot idle">${PARROT_SVG}</div>
    </div>`;
  const bubble = dock.querySelector(".bubble");
  const text = dock.querySelector(".bubble-text");
  const sub = dock.querySelector(".bubble-sub");
  const bird = dock.querySelector(".parrot");
  let pending = null;
  let freeAt = 0;
  const timers = { next: null, hide: null, talk: null, mood: null };

  function show(msg) {
    const timing = { ...(DEFAULTS[msg.mood] ?? DEFAULTS.info), ...msg };
    text.textContent = msg.text;
    sub.textContent = msg.sub ?? "";
    bubble.className = "bubble";
    void bubble.offsetWidth; // restart the pop-in animation
    bubble.className = `bubble show mood-${msg.mood ?? "info"}`;
    bird.className = `parrot talking mood-${msg.mood ?? "info"}`;
    // A short spoken line if the browser has a voice for the language, else a squawk.
    if (!speak(msg.voice, getLang())) sfx.squawk(msg.mood);
    clearTimeout(timers.hide);
    clearTimeout(timers.talk);
    timers.talk = setTimeout(() => bird.classList.remove("talking"), Math.min(1100, timing.life));
    timers.hide = setTimeout(() => {
      bubble.classList.add("hide");
      bird.className = "parrot idle";
    }, timing.life);
    freeAt = performance.now() + timing.hold;
  }

  function pump() {
    timers.next = null;
    if (!pending) return;
    const msg = pending;
    pending = null;
    show(msg);
    if (pending) timers.next = setTimeout(pump, Math.max(0, freeAt - performance.now()));
  }

  return {
    say(textValue, options = {}) {
      const msg = { text: textValue, ...options };
      const wait = freeAt - performance.now();
      if (wait <= 0 && !timers.next) {
        show(msg);
        return;
      }
      pending = msg;
      if (!timers.next) timers.next = setTimeout(pump, Math.max(0, wait));
    },
    destroy() {
      for (const id of Object.values(timers)) clearTimeout(id);
      pending = null;
    },
  };
}
