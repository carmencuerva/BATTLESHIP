// Sound effects, synthesised with the Web Audio API (no audio files to download), and the
// parrot's voice through the browser's own speech synthesis.
// Purely decorative: every call is fire-and-forget and silently does nothing when sound is
// off, unsupported, or before the player has touched the page (browsers' autoplay rules:
// nothing may sound until a click, tap or key press).

import { load, save } from "./store.js";

// --- tune the parrot here -------------------------------------------------------------

// The spoken words (the browser's speechSynthesis, after the squawk).
export const PARROT_VOICE = {
  pitch: 0.6, // 0..2, 1 = the voice's normal pitch: low and gravelly, like a macaw
  rate: 0.9, // 1 = normal speed
  volume: 1, // 0..1
  afterSquawk: 0.42, // seconds between the start of the squawk and the words
};

// The squawk before every line: a hoarse, choppy "RAAAK-ak". Each chirp glides down.
export const SQUAWK = {
  chirps: [
    { from: 780, to: 300, at: 0, dur: 0.24 },
    { from: 620, to: 250, at: 0.28, dur: 0.15 },
  ],
  detune: 9, // Hz between the two sawtooths that rasp against each other
  vibratoHz: 30, // pitch wobble: speed…
  vibratoDepth: 40, // …and width in Hz
  flutterHz: 21, // volume stutter that makes it choppy: speed…
  flutter: 0.55, // …and depth, 0..1
  bandHz: 1150, // the nasal band-pass filter: centre…
  bandQ: 3.2, // …and narrowness
  rasp: 0.5, // breathy noise mixed in, 0..1
  volume: 0.5, // 0..1 (0.5 is about as loud as the cannon)
};

// The band-pass filter keeps only a slice of the sound; this makes up for it.
const SQUAWK_MAKEUP = 2.8;

// ----------------------------------------------------------------------------------------

let ctx = null;
let master = null;
let voiceBus = null; // the parrot's squawks go through here (its own volume)
let musicBus = null; // the background music (its own volume)…
let duckBus = null; // …lowered while the parrot speaks
let noise = null;
let pendingWords = null; // the words waiting for their squawk to finish
let muted = load("sound", "off") !== "on"; // silent until the player turns it on
let unlocked = false;

// The two sliders of the sound panel, 0..1, remembered (store.js forgets quietly).
const levels = { music: 0.35, voice: 0.85, ...load("levels", {}) };

// Listeners: someone (music.js) wants to know when sound is turned on/off, unlocked or
// re-levelled, and when the parrot starts and stops talking (to lower the music).
const changeListeners = new Set();
const parrotListeners = new Set();
export function onSoundChange(fn) {
  changeListeners.add(fn);
}
export function onParrot(fn) {
  parrotListeners.add(fn);
}
const changed = () => changeListeners.forEach((fn) => fn());
const parrotIs = (state) => parrotListeners.forEach((fn) => fn(state));

// The first real gesture unlocks audio; until then every sound is a no-op.
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  changed();
}

export function isUnlocked() {
  return unlocked;
}

export function getLevel(kind) {
  return levels[kind];
}

export function setLevel(kind, value) {
  levels[kind] = Math.min(1, Math.max(0, Number(value) || 0));
  save("levels", levels);
  if (kind === "voice" && voiceBus) voiceBus.gain.value = levels.voice;
  if (kind === "music" && musicBus) musicBus.gain.value = levels.music;
  changed();
}

// The music's way into the speakers, creating the audio graph if allowed (after a
// gesture, sound on). null otherwise. {ctx, out, duck}: play into `out`; `duck` is the
// gain lowered while the parrot speaks.
export function musicOutput() {
  const ac = audio();
  return ac ? { ctx: ac, out: musicBus, duck: duckBus } : null;
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
  if (muted) {
    clearTimeout(pendingWords);
    globalThis.speechSynthesis?.cancel?.();
  }
  changed();
}

function pickVoice(synth, lang) {
  const voices = (synth.getVoices?.() ?? []).filter((v) => v.lang?.toLowerCase().startsWith(lang));
  return voices.find((v) => v.localService) ?? voices[0] ?? null;
}

// The words, in a low voice in `lang` ("es" or "en"). False if there is no speech engine
// or no voice for the language (then the squawk and the bubble are all there is).
function sayWords(text, lang) {
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
    line.pitch = PARROT_VOICE.pitch;
    line.rate = PARROT_VOICE.rate;
    line.volume = PARROT_VOICE.volume * levels.voice;
    line.onend = line.onerror = () => parrotIs("quiet");
    synth.speak(line);
    return true;
  } catch {
    return false; // a broken speech engine must never stop the game
  }
}

// The parrot speaks: a squawk, then `text` in its low voice when the device has one for
// `lang`. Nothing at all while sound is off or before the player has touched the page.
// Returns {squawk, words}: whether each could be played or scheduled.
export function parrotSay(text, lang) {
  const result = { squawk: false, words: false };
  if (muted || !unlocked || !text) return result;
  parrotIs("talking"); // the music steps aside
  result.squawk = squawk();
  const synth = globalThis.speechSynthesis;
  result.words = Boolean(synth && globalThis.SpeechSynthesisUtterance && pickVoice(synth, lang));
  clearTimeout(pendingWords);
  if (result.words) {
    pendingWords = setTimeout(() => sayWords(text, lang) || parrotIs("quiet"), PARROT_VOICE.afterSquawk * 1000);
  } else {
    pendingWords = setTimeout(() => parrotIs("quiet"), 700); // just the squawk
  }
  return result;
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
    voiceBus = ctx.createGain();
    voiceBus.gain.value = levels.voice;
    voiceBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = levels.music;
    duckBus = ctx.createGain();
    duckBus.gain.value = 1;
    musicBus.connect(duckBus).connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// An envelope: quick attack to `peak`, exponential decay over `dur` seconds.
function envelope(ac, start, dur, peak, out = master) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  gain.connect(out);
  return gain;
}

// One squawk, built from SQUAWK (see the top of this file). Returns false if silent.
function squawk() {
  try {
    const ac = audio();
    if (!ac) return false;
    const s = SQUAWK;
    for (const chirp of s.chirps) {
      const start = ac.currentTime + chirp.at;
      const stop = start + chirp.dur + 0.05;
      const band = ac.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = s.bandHz;
      band.Q.value = s.bandQ;
      // choppy: the volume flutters
      const flutter = ac.createGain();
      flutter.gain.value = 1 - s.flutter / 2;
      const flutterLfo = ac.createOscillator();
      flutterLfo.frequency.value = s.flutterHz;
      const flutterDepth = ac.createGain();
      flutterDepth.gain.value = s.flutter / 2;
      flutterLfo.connect(flutterDepth).connect(flutter.gain);
      band.connect(flutter).connect(envelope(ac, start, chirp.dur, s.volume * SQUAWK_MAKEUP, voiceBus));
      // hoarse: two sawtooths a few Hz apart, gliding down, with vibrato
      const vibrato = ac.createOscillator();
      vibrato.frequency.value = s.vibratoHz;
      const vibratoDepth = ac.createGain();
      vibratoDepth.gain.value = s.vibratoDepth;
      vibrato.connect(vibratoDepth);
      for (const offset of [0, s.detune]) {
        const saw = ac.createOscillator();
        saw.type = "sawtooth";
        saw.frequency.setValueAtTime(chirp.from + offset, start);
        saw.frequency.exponentialRampToValueAtTime(chirp.to + offset, start + chirp.dur);
        vibratoDepth.connect(saw.frequency);
        saw.connect(band);
        saw.start(start);
        saw.stop(stop);
      }
      // breathy: a little noise through the same throat
      const breath = ac.createBufferSource();
      breath.buffer = noise;
      breath.loop = true;
      const breathGain = ac.createGain();
      breathGain.gain.value = s.rasp;
      breath.connect(breathGain).connect(band);
      breath.start(start);
      breath.stop(stop);
      for (const lfo of [vibrato, flutterLfo]) {
        lfo.start(start);
        lfo.stop(stop);
      }
    }
    return true;
  } catch {
    return false;
  }
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
