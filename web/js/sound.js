// Sound effects, synthesised with the Web Audio API (no audio files to download), and the
// parrot's voice through the browser's own speech synthesis.
// Purely decorative: every call is fire-and-forget and silently does nothing when sound is
// off, unsupported, or before the player has touched the page (browsers' autoplay rules:
// nothing may sound until a click, tap or key press).

import { load, save } from "./store.js";

let ctx = null;
let master = null;
let noise = null;
let muted = load("sound", "off") !== "on"; // silent until the player turns it on
let unlocked = false;

// The first real gesture unlocks audio; until then every sound is a no-op.
export function unlock() {
  unlocked = true;
}
for (const type of ["pointerdown", "keydown"]) {
  globalThis.addEventListener?.(type, unlock, { once: true, capture: true });
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  save("sound", value ? "off" : "on");
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (muted) globalThis.speechSynthesis?.cancel?.();
}

function pickVoice(synth, lang) {
  const voices = (synth.getVoices?.() ?? []).filter((v) => v.lang?.toLowerCase().startsWith(lang));
  return voices.find((v) => v.localService) ?? voices[0] ?? null;
}

// The parrot says `text` in a high, quick voice in `lang` ("es" or "en"). Returns false
// when it cannot (sound off, no gesture yet, no speech engine or no voice for the
// language), so the caller can squawk instead.
export function speak(text, lang) {
  if (muted || !unlocked || !text) return false;
  const synth = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return false;
  try {
    const voice = pickVoice(synth, lang);
    if (!voice) return false;
    synth.cancel(); // a new line replaces the old one instead of queueing behind it
    const line = new Utterance(text);
    line.voice = voice;
    line.lang = voice.lang;
    line.pitch = 1.9; // as high as voices go: a parrot
    line.rate = 1.2;
    line.volume = 0.9;
    synth.speak(line);
    return true;
  } catch {
    return false; // a broken speech engine must never stop the game
  }
}

function audio() {
  if (muted || !unlocked) return null;
  if (!ctx) {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// An envelope: quick attack to `peak`, exponential decay over `dur` seconds.
function envelope(ac, start, dur, peak) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  gain.connect(master);
  return gain;
}

function tone({ freq, to = freq, dur = 0.2, type = "sine", peak = 0.3, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
  osc.connect(envelope(ac, start, dur, peak));
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function hiss({ dur = 0.4, filter = "lowpass", freq = 800, to = freq, q = 1, peak = 0.4, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const biquad = ac.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(freq, start);
  biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
  src.connect(biquad).connect(envelope(ac, start, dur, peak));
  src.start(start);
  src.stop(start + dur + 0.05);
}

const effects = {
  launch() {
    hiss({ dur: 0.4, filter: "lowpass", freq: 900, to: 110, peak: 0.55 }); // the cannon's boom
    tone({ freq: 110, to: 55, dur: 0.18, type: "triangle", peak: 0.5 }); // and its thump
    hiss({ dur: 0.5, filter: "bandpass", freq: 500, to: 2600, q: 2.5, peak: 0.25 }); // whoosh
  },
  splash() {
    hiss({ dur: 0.55, filter: "highpass", freq: 900, to: 2500, peak: 0.35 });
    tone({ freq: 700, to: 180, dur: 0.18, peak: 0.25 }); // plop
  },
  explosion(big = false) {
    const dur = big ? 1.5 : 0.8;
    hiss({ dur, filter: "lowpass", freq: 1400, to: 90, peak: big ? 0.9 : 0.7 });
    tone({ freq: 90, to: 32, dur: dur * 0.8, type: "sine", peak: big ? 0.8 : 0.55 });
  },
  sink() {
    tone({ freq: 260, to: 55, dur: 1.6, type: "triangle", peak: 0.22, delay: 0.25 }); // the hull groans
    for (let i = 0; i < 7; i++) {
      const f = 400 + Math.random() * 600;
      tone({ freq: f, to: f * 1.8, dur: 0.07, peak: 0.12, delay: 0.4 + i * 0.16 + Math.random() * 0.08 });
    }
  },
  squawk(mood = "info") {
    // Two quick chirps through a nasal filter; excited moods squawk higher.
    const base = mood === "sunk" ? 1500 : mood === "hit" ? 1300 : mood === "miss" ? 900 : 1100;
    for (const [k, delay] of [0, 0.13].entries()) {
      tone({ freq: base * (1 + 0.15 * k), to: base * 0.7, dur: 0.1, type: "sawtooth", peak: 0.07, delay });
    }
  },
  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    notes.forEach((f, i) => tone({ freq: f, dur: 0.22, type: "square", peak: 0.12, delay: i * 0.13 }));
    for (const f of [523.25, 659.25, 783.99]) tone({ freq: f, dur: 1.4, type: "triangle", peak: 0.12, delay: 0.55 });
    for (let i = 0; i < 10; i++) {
      const f = 2200 + Math.random() * 1500; // coins
      tone({ freq: f, to: f * 1.02, dur: 0.12, peak: 0.08, delay: 0.7 + i * 0.18 + Math.random() * 0.1 });
    }
  },
  defeat() {
    // A sad descending "wah wah wah wah".
    [392, 370, 349, 311].forEach((f, i) =>
      tone({ freq: f, to: f * 0.94, dur: i === 3 ? 1.1 : 0.42, type: "sawtooth", peak: 0.09, delay: 0.3 + i * 0.45 }),
    );
    effects.thunder(0);
  },
  thunder(delay = 0.15) {
    hiss({ dur: 2.4, filter: "lowpass", freq: 600, to: 60, peak: 0.6, delay });
    hiss({ dur: 0.25, filter: "highpass", freq: 2000, peak: 0.3, delay }); // the crack
  },
};

// Every effect is decorative: if the audio engine throws, the game carries on in silence.
export const sfx = Object.fromEntries(
  Object.entries(effects).map(([name, play]) => [
    name,
    (...args) => {
      try {
        play(...args);
      } catch {
        // no sound this time
      }
    },
  ]),
);
