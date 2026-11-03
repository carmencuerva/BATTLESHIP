// Background music: an original sea shanty in 6/8, composed for this game and played live
// with the Web Audio API (no recordings). One player for the whole page: it keeps going
// across screens, starts only after the first click with sound on, steps aside while the
// parrot speaks, and pauses while the tab is hidden.

import { getLevel, isMuted, isUnlocked, musicOutput, onParrot, onSoundChange } from "./sound.js";

// --- tune the music here -----------------------------------------------------------------

export const MUSIC = {
  eighth: 0.32, // seconds per eighth note: a calm 6/8 (a dotted crotchet ≈ 62 per minute)
  lookahead: 0.3, // how far ahead notes are scheduled, in seconds
  duckTo: 0.28, // music level while the parrot speaks (fraction of the slider)
  violin: 0.15, // loudness of each instrument
  accordion: 0.045,
  bass: 0.11,
};

// The tune, bar by bar (6 eighths each): the violin's notes as [note, eighths] ("-" is a
// rest) and the chord the accordion and bass play under it. D minor, A section then B.
export const SCORE = [
  // A
  { chord: "Dm", tune: [["A4", 2], ["D5", 1], ["F5", 2], ["E5", 1]] },
  { chord: "Dm", tune: [["D5", 2], ["C5", 1], ["A4", 3]] },
  { chord: "C", tune: [["G4", 2], ["C5", 1], ["E5", 2], ["D5", 1]] },
  { chord: "C", tune: [["C5", 3], ["G4", 3]] },
  { chord: "Bb", tune: [["F4", 2], ["Bb4", 1], ["D5", 2], ["C5", 1]] },
  { chord: "Bb", tune: [["Bb4", 2], ["A4", 1], ["F4", 3]] },
  { chord: "A", tune: [["E4", 2], ["A4", 1], ["C#5", 2], ["E5", 1]] },
  { chord: "A", tune: [["E5", 2], ["C#5", 1], ["A4", 3]] },
  // B
  { chord: "F", tune: [["A4", 2], ["C5", 1], ["F5", 3]] },
  { chord: "F", tune: [["E5", 2], ["D5", 1], ["C5", 3]] },
  { chord: "C", tune: [["E5", 2], ["G5", 1], ["E5", 2], ["C5", 1]] },
  { chord: "Dm", tune: [["D5", 2], ["E5", 1], ["F5", 3]] },
  { chord: "Gm", tune: [["D5", 2], ["Bb4", 1], ["G4", 3]] },
  { chord: "Dm", tune: [["A4", 2], ["D5", 1], ["F5", 2], ["D5", 1]] },
  { chord: "A", tune: [["E5", 2], ["D5", 1], ["C#5", 2], ["B4", 1]] },
  { chord: "Dm", tune: [["D5", 5], ["-", 1]] },
];

const CHORDS = {
  Dm: { bass: ["D2", "A2"], notes: ["D4", "F4", "A4"] },
  C: { bass: ["C2", "G2"], notes: ["C4", "E4", "G4"] },
  Bb: { bass: ["Bb1", "F2"], notes: ["Bb3", "D4", "F4"] },
  A: { bass: ["A1", "E2"], notes: ["A3", "C#4", "E4"] },
  F: { bass: ["F2", "C3"], notes: ["F3", "A3", "C4"] },
  Gm: { bass: ["G2", "D3"], notes: ["G3", "Bb3", "D4"] },
};

// -------------------------------------------------------------------------------------------

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "C#5" -> 554.37 Hz (A4 = 440).
export function frequency(note) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`not a note: ${note}`);
  const semitone = SEMITONES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

// Every note of one pass through the tune: {at, dur (in eighths), voice, freq}, by time.
// Under each bar: the bass on beats 1 and 4, the accordion's chord on the off-beats
// ("oom-pa-pa, oom-pa-pa").
export function events(score = SCORE) {
  const list = [];
  score.forEach((bar, b) => {
    const start = b * 6;
    let at = start;
    for (const [note, dur] of bar.tune) {
      if (note !== "-") list.push({ at, dur, voice: "violin", freq: frequency(note) });
      at += dur;
    }
    const chord = CHORDS[bar.chord];
    list.push({ at: start, dur: 2.5, voice: "bass", freq: frequency(chord.bass[0]) });
    list.push({ at: start + 3, dur: 2.5, voice: "bass", freq: frequency(chord.bass[1]) });
    for (const off of [1, 2, 4, 5]) {
      for (const note of chord.notes) list.push({ at: start + off, dur: 0.8, voice: "accordion", freq: frequency(note) });
    }
  });
  return list.sort((x, y) => x.at - y.at);
}

export const LOOP_EIGHTHS = SCORE.length * 6;

// --- the instruments --------------------------------------------------------------------

function envelope(ctx, out, start, dur, peak, attack, release) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak * 0.8, start + Math.max(attack, dur - release));
  gain.gain.linearRampToValueAtTime(0, start + dur);
  gain.connect(out);
  return gain;
}

const INSTRUMENTS = {
  // A bowed string: two slightly detuned sawtooths, softened, with a vibrato that sets in.
  violin(ctx, out, start, dur, freq) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    tone.connect(envelope(ctx, out, start, dur, MUSIC.violin, 0.07, 0.12));
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, start);
    depth.gain.linearRampToValueAtTime(freq * 0.006, start + Math.min(0.35, dur));
    vibrato.connect(depth);
    for (const cents of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq * 2 ** (cents / 1200);
      depth.connect(osc.frequency);
      osc.connect(tone);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
    vibrato.start(start);
    vibrato.stop(start + dur + 0.05);
  },
  // An accordion reed pair: two square waves a few cents apart (the "musette" shimmer).
  accordion(ctx, out, start, dur, freq) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1500;
    tone.connect(envelope(ctx, out, start, dur, MUSIC.accordion, 0.03, 0.08));
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq * 2 ** (cents / 1200);
      osc.connect(tone);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  },
  // A soft plucked bass.
  bass(ctx, out, start, dur, freq) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(envelope(ctx, out, start, dur, MUSIC.bass, 0.01, dur * 0.7));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  },
};

// One whole pass of the tune into `out`, from time `at` (for recording it offline).
export function playPass(ctx, out, at = 0) {
  for (const note of events()) INSTRUMENTS[note.voice](ctx, out, at + note.at * MUSIC.eighth, note.dur * MUSIC.eighth, note.freq);
  return LOOP_EIGHTHS * MUSIC.eighth;
}

// --- the player ---------------------------------------------------------------------------

const NOTES = events();
const player = { running: false, timer: null, next: 0, loopStart: 0, output: null };

function wanted() {
  const hidden = globalThis.document?.visibilityState === "hidden";
  return isUnlocked() && !isMuted() && getLevel("music") > 0 && !hidden;
}

function schedule() {
  const { ctx, out } = player.output;
  const eighth = MUSIC.eighth;
  while (player.loopStart + NOTES[player.next].at * eighth < ctx.currentTime + MUSIC.lookahead) {
    const note = NOTES[player.next];
    try {
      INSTRUMENTS[note.voice](ctx, out, player.loopStart + note.at * eighth, note.dur * eighth, note.freq);
    } catch {
      // a missed note is no reason to stop the music
    }
    player.next += 1;
    if (player.next === NOTES.length) {
      player.next = 0;
      player.loopStart += LOOP_EIGHTHS * eighth;
    }
  }
}

function start() {
  if (player.running) return;
  const output = musicOutput();
  if (!output) return;
  player.output = output;
  player.running = true;
  // carry on from where it paused, a moment from now
  player.loopStart = output.ctx.currentTime + 0.1 - NOTES[player.next].at * MUSIC.eighth;
  schedule();
  player.timer = setInterval(schedule, 60);
}

function stop() {
  if (!player.running) return;
  clearInterval(player.timer);
  player.running = false;
}

// Starts or stops the music to match the sound switch, the slider and the tab.
export function updateMusic() {
  if (wanted()) start();
  else stop();
}

export function isPlaying() {
  return player.running;
}

// Ducking: down while the parrot talks, back up after.
onParrot((state) => {
  const output = player.output ?? musicOutput();
  if (!output) return;
  const now = output.ctx.currentTime;
  output.duck.gain.cancelScheduledValues?.(now);
  output.duck.gain.setTargetAtTime(state === "talking" ? MUSIC.duckTo : 1, now, state === "talking" ? 0.08 : 0.4);
});

onSoundChange(updateMusic);
globalThis.document?.addEventListener?.("visibilitychange", updateMusic);
