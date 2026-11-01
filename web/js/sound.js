// Sound effects, synthesised with the Web Audio API (no audio files to download).
// Purely decorative: every call is fire-and-forget and silently does nothing when sound is
// off, unsupported, or not yet allowed by the browser (audio starts after a click).

const STORE_KEY = "sound";
let ctx = null;
let master = null;
let noise = null;
let muted = (() => {
  try {
    return localStorage.getItem(STORE_KEY) === "off";
  } catch {
    return false;
  }
})();

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(STORE_KEY, value ? "off" : "on");
  } catch {
    // not persisted; fine
  }
  if (master) master.gain.value = muted ? 0 : 0.5;
}

function audio() {
  if (muted) return null;
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

export const sfx = {
  launch() {
    tone({ freq: 110, to: 55, dur: 0.18, type: "triangle", peak: 0.5 }); // the cannon's thump
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
    sfx.thunder(0);
  },
  thunder(delay = 0.15) {
    hiss({ dur: 2.4, filter: "lowpass", freq: 600, to: 60, peak: 0.6, delay });
    hiss({ dur: 0.25, filter: "highpass", freq: 2000, peak: 0.3, delay }); // the crack
  },
};
