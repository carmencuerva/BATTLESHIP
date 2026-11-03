// The parrot: the game's commentator. It sits still on its perch between the two boards
// and says its lines in a speech bubble above it (or beside it when the boards are stacked).

import { getLang } from "./i18n.js";
import { parrotSay } from "./sound.js";

// Drawn in profile: one eye, the beak to the right.
export const PARROT_SVG = `
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

// How long each kind of line stays (ms): `hold` before another may replace it, `life` on
// screen. `rank`: a line only ever gives way to one of equal or higher rank, so "your turn"
// never cuts off a sink, and never queues up behind one either.
const MOODS = {
  turn: { hold: 700, life: 1700, rank: 1, bubble: "turn" },
  sunk: { hold: 1700, life: 3000, rank: 2, bubble: "sunk" },
  lost: { hold: 1700, life: 3200, rank: 2, bubble: "lost" },
  victory: { hold: 1800, life: 3400, rank: 3, bubble: "sunk" },
  defeat: { hold: 1800, life: 3400, rank: 3, bubble: "miss" },
  info: { hold: 1200, life: 3000, rank: 1, bubble: "info" },
};

// Mounts the parrot in `dock` (the column between the boards) and returns
// {say(text, {mood, voice}), rest(), destroy()}. Lines are shown for at least `hold` ms;
// only the newest waiting line is kept, so fast games never build up a backlog, and two
// lines never play at once (a new one cuts the old voice off).
// The bird never moves: no flights, hops, bobbing or flapping. It never takes clicks.
export function createParrot(dock) {
  dock.innerHTML = `
    <div class="parrot-wrap">
      <div class="bubble" role="status" aria-live="polite"><span class="bubble-text"></span></div>
      <div class="parrot">${PARROT_SVG}</div>
    </div>`;
  const bubble = dock.querySelector(".bubble");
  const text = dock.querySelector(".bubble-text");
  let pending = null;
  let freeAt = 0;
  let showing = 0; // the rank of the line on screen while it holds
  const timers = { next: null, hide: null };
  const moodOf = (msg) => MOODS[msg.mood] ?? MOODS.info;

  function show(msg) {
    const mood = moodOf(msg);
    freeAt = performance.now() + mood.hold;
    showing = mood.rank;
    clearTimeout(timers.hide);
    text.textContent = msg.text;
    bubble.className = "bubble";
    void bubble.offsetWidth; // restart the pop-in animation
    bubble.className = `bubble show mood-${mood.bubble}`;
    parrotSay(msg.voice, getLang(), msg.mood); // a squawk, then the same words out loud
    timers.hide = setTimeout(() => bubble.classList.add("hide"), mood.life);
  }

  function pump() {
    timers.next = null;
    if (!pending) return;
    const msg = pending;
    pending = null;
    show(msg);
  }

  return {
    say(textValue, options = {}) {
      const msg = { text: textValue, ...options };
      const rank = moodOf(msg).rank;
      const wait = freeAt - performance.now();
      if (wait <= 0 && !timers.next) {
        show(msg);
        return;
      }
      if (wait > 0 && rank > showing) {
        // more important than what is on screen: say it now
        clearTimeout(timers.next);
        timers.next = null;
        pending = null;
        show(msg);
        return;
      }
      if (rank < showing || (pending && rank < moodOf(pending).rank)) return; // not worth waiting
      pending = msg; // only the newest waiting line is kept
      if (!timers.next) timers.next = setTimeout(pump, Math.max(0, wait));
    },
    rest() {}, // it stays on its perch
    destroy() {
      for (const id of Object.values(timers)) clearTimeout(id);
      pending = null;
      dock.innerHTML = "";
    },
  };
}
