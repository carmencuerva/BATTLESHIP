// The parrot: the game's commentator, a character that flies around the screen.

import { getLang } from "./i18n.js";
import { bubbleBox, candidates, chooseSpeakingSpot, choosePerch, inside, overlaps, rect } from "./perches.js";
import { parrotSay } from "./sound.js";

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
  sunk: { hold: 1500, life: 2800 },
  info: { hold: 1200, life: 3000 },
  miss: { hold: 1200, life: 3000 },
};

// What the parrot (and its bubble) must not cover: the boards and everything around them
// that you read or press. Plain help text and the folded ship's log may be covered for the
// few seconds a line lasts.
const OBSTACLES = [
  ".top h1",
  ".top button",
  ".board-frame",
  ".nameplate",
  ".afloat",
  ".controls",
  ".scroll",
  ".panel button",
];

function reducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function phone() {
  return innerWidth < 860;
}

function birdSize() {
  return phone() ? { width: 54, height: 68 } : { width: 110, height: 138 };
}

// On a phone there is no room beside the bird: the bubble is a strip along the top.
function bannerRect(height) {
  return rect(12, 8, innerWidth - 24, height);
}


function obstacles() {
  return [...document.querySelectorAll(OBSTACLES.join(","))]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight);
}

const centreOf = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

// The parrot: a character that perches on free spots around the screen (never over the
// boards, buttons or scrolls), flies next to the board you are looking at when it has
// something to say, says it in its bubble (and out loud, see sound.js), then flies back to
// a quiet perch. It never takes clicks (pointer-events: none).
//
// Returns {say(text, {mood, voice, watch, quick}), rest(focus, {quick}), destroy()}:
//   watch: the element (a board) the player is looking at; focus: a rect (the last shot);
//   quick: skip the flights (fast bot-v-bot games) and only show the bubble.
export function createParrot() {
  const flyer = document.createElement("div");
  flyer.className = "parrot-flyer";
  flyer.setAttribute("aria-hidden", "false");
  flyer.innerHTML = `<div class="parrot idle">${PARROT_SVG}</div>`;
  // The bubble floats on its own (placed in pixels next to the bird, or along the top on a
  // phone), so it is never clipped or moved by the bird's flight.
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  bubble.innerHTML = `<span class="bubble-text"></span>`;
  document.body.append(flyer, bubble);
  const text = bubble.querySelector(".bubble-text");
  const bird = flyer.querySelector(".parrot");

  let at = null; // the current perch (a rect)
  let focus = null; // where the action was last, {x, y}
  let speaking = false;
  let flight = null;
  let pending = null;
  let freeAt = 0;
  const timers = { next: null, hide: null, talk: null, scroll: null };

  function view() {
    return { width: innerWidth, height: innerHeight };
  }

  const isFree = (r, blocks) => inside(r, view(), 8) && !blocks.some((o) => overlaps(r, o, 6));

  // A quiet perch near the action: the screen's edges (the top band on a phone), or, when
  // those are all taken, any free spot on screen.
  function quietPerch() {
    const size = birdSize();
    const blocks = obstacles();
    const options = { view: view(), obstacles: blocks, focus };
    const perch = choosePerch(candidates(phone() ? "top" : "edges", view(), size), options);
    return isFree(perch, blocks) ? perch : choosePerch(candidates("grid", view(), size), options);
  }

  // Where to perch to say a line with a bubble of `bubble` size: beside the watched board
  // if there is room, otherwise anywhere on screen where the bird and its bubble are free.
  // On a phone the bubble is a strip along the top, and the bird perches clear of it.
  function speakingSpot(watch, bubble) {
    const size = birdSize();
    const blocks = obstacles();
    if (phone()) {
      const banner = bannerRect(bubble.height);
      const options = { view: view(), obstacles: [...blocks, banner], focus };
      let perch = choosePerch(candidates("top", view(), size), options);
      if (!isFree(perch, [...blocks, banner])) perch = choosePerch(candidates("grid", view(), size), options);
      return { perch, placement: { side: "", vertical: "banner" } };
    }
    const board = watch?.getBoundingClientRect();
    const spots = [...(board ? candidates("around", view(), size, { board }) : []), ...candidates("edges", view(), size)];
    const target = board ? centreOf(board) : focus;
    const options = { view: view(), obstacles: blocks, focus: target, bubble };
    const spot = chooseSpeakingSpot(spots, options);
    const clean = (s) => isFree(s.perch, blocks) && isFree(bubbleBox(s.perch, bubble, s.placement), blocks);
    if (clean(spot)) return spot;
    const anywhere = chooseSpeakingSpot(candidates("grid", view(), size), options);
    return clean(anywhere) || !isFree(spot.perch, blocks) ? anywhere : spot;
  }

  // The bubble's size for its current text (measured; its pop-in scale does not count).
  function measureBubble(mood) {
    bubble.className = `bubble mood-${mood ?? "info"}`; // the mood changes its font and border
    bubble.style.width = phone() ? `${innerWidth - 24}px` : "";
    bubble.dataset.vertical = phone() ? "banner" : "";
    return { width: bubble.offsetWidth || 250, height: bubble.offsetHeight || 80 };
  }

  function place(perch) {
    at = perch;
    flyer.style.transform = `translate(${perch.left}px, ${perch.top}px)`;
    flyer.style.width = `${perch.right - perch.left}px`;
    flyer.style.height = `${perch.bottom - perch.top}px`;
    flyer.classList.toggle("small", phone());
  }

  // Moves to `perch`: a short flapping flight (an arc), or a fade when motion is reduced,
  // or a jump when `quick`.
  function goTo(perch, { quick = false } = {}) {
    if (!perch) return Promise.resolve();
    if (at && Math.abs(perch.left - at.left) < 2 && Math.abs(perch.top - at.top) < 2) return Promise.resolve();
    flight?.cancel();
    const from = at;
    if (!from || quick) {
      place(perch);
      return Promise.resolve();
    }
    if (reducedMotion()) {
      flyer.style.opacity = "0";
      place(perch);
      requestAnimationFrame(() => (flyer.style.opacity = ""));
      return Promise.resolve();
    }
    const dist = Math.hypot(perch.left - from.left, perch.top - from.top);
    const duration = Math.min(700, 250 + dist * 0.45);
    const lift = Math.min(120, 30 + dist * 0.2);
    const midX = (from.left + perch.left) / 2;
    const midY = Math.min(from.top, perch.top) - lift;
    bird.classList.add("flying");
    flight = flyer.animate(
      [
        { transform: `translate(${from.left}px, ${from.top}px)` },
        { transform: `translate(${midX}px, ${Math.max(4, midY)}px)` },
        { transform: `translate(${perch.left}px, ${perch.top}px)` },
      ],
      { duration, easing: "ease-in-out" },
    );
    place(perch);
    return flight.finished
      .catch(() => {})
      .then(() => {
        bird.classList.remove("flying");
        flight = null;
      });
  }

  function placeBubble(spot, size) {
    const box = spot.placement.vertical === "banner" ? bannerRect(size.height) : bubbleBox(spot.perch, size, spot.placement);
    bubble.dataset.side = spot.placement.side;
    bubble.dataset.vertical = spot.placement.vertical;
    bubble.style.left = `${box.left}px`;
    bubble.style.top = `${box.top}px`;
  }

  async function show(msg) {
    const timing = { ...(DEFAULTS[msg.mood] ?? DEFAULTS.info), ...msg };
    freeAt = performance.now() + timing.hold;
    speaking = true;
    clearTimeout(timers.hide);
    clearTimeout(timers.talk);
    bubble.className = "bubble";
    text.textContent = msg.text;
    const size = measureBubble(msg.mood);
    bubble.className = "bubble";
    const spot = speakingSpot(msg.watch, size);
    await goTo(spot.perch, { quick: msg.quick });
    placeBubble(spot, size);
    void bubble.offsetWidth; // restart the pop-in animation
    bubble.className = `bubble show mood-${msg.mood ?? "info"}`;
    bird.className = `parrot talking mood-${msg.mood ?? "info"}`;
    parrotSay(msg.voice, getLang()); // a squawk, then the same words out loud
    timers.talk = setTimeout(() => bird.classList.remove("talking"), Math.min(1400, timing.life));
    timers.hide = setTimeout(() => {
      bubble.classList.add("hide");
      bird.className = "parrot idle";
      speaking = false;
      if (!pending) goTo(quietPerch(), { quick: msg.quick });
    }, timing.life);
  }

  function pump() {
    timers.next = null;
    if (!pending) return;
    const msg = pending;
    pending = null;
    show(msg);
  }

  // Keep the parrot on screen and off the boards when the page scrolls or resizes.
  function relocate() {
    clearTimeout(timers.scroll);
    timers.scroll = setTimeout(() => {
      if (speaking) {
        const mood = [...bubble.classList].find((c) => c.startsWith("mood-"))?.slice(5);
        const shown = bubble.className;
        const size = measureBubble(mood);
        bubble.className = shown;
        const spot = speakingSpot(null, size);
        place(spot.perch);
        placeBubble(spot, size);
        return;
      }
      const stillFine = at && inside(at, view(), 8) && !obstacles().some((o) => overlaps(at, o, 6));
      if (!stillFine || flyer.classList.contains("small") !== phone()) goTo(quietPerch(), { quick: true });
    }, 120);
  }
  addEventListener("scroll", relocate, { passive: true });
  addEventListener("resize", relocate);
  requestAnimationFrame(() => at || place(quietPerch())); // unless it already flew off to speak

  return {
    say(textValue, options = {}) {
      if (options.watch) focus = centreOf(options.watch.getBoundingClientRect());
      const msg = { text: textValue, ...options };
      const wait = freeAt - performance.now();
      if (wait <= 0 && !timers.next) {
        show(msg);
        return;
      }
      pending = msg; // only the newest waiting line is kept
      if (!timers.next) timers.next = setTimeout(pump, Math.max(0, wait));
    },
    // After a shot: perch quietly near it (unless busy talking).
    rest(where, { quick = false } = {}) {
      if (where) focus = centreOf(where);
      if (!speaking && !pending && !quick) goTo(quietPerch());
    },
    destroy() {
      for (const id of Object.values(timers)) clearTimeout(id);
      flight?.cancel();
      pending = null;
      removeEventListener("scroll", relocate);
      removeEventListener("resize", relocate);
      flyer.remove();
      bubble.remove();
    },
  };
}
