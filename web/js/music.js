// Background music, composed for this game and played live with the Web Audio API (no
// recordings): a calm sea shanty in 6/8 for the menus and the placing of the fleet, an
// epic battle piece while the cannons fire, and a short fanfare or lament at the end.
// One player for the whole page: it starts only after the first click with sound on,
// fades from one piece to the next (never two at once), steps aside while the parrot
// speaks, and pauses while the tab is hidden.

import { getLevel, isMuted, isUnlocked, musicOutput, onParrot, onSoundChange } from "./sound.js";

// --- tune the music here -----------------------------------------------------------------

export const MUSIC = {
  eighth: 0.32, // seconds per eighth note: a calm 6/8 (a dotted crotchet ≈ 62 per minute)
  lookahead: 0.3, // how far ahead notes are scheduled, in seconds
  duckTo: 0.28, // music level while the parrot speaks (fraction of the slider)
  fade: 0.9, // seconds for one piece to fade out before the next fades in
  violin: 0.15, // loudness of each instrument
  accordion: 0.045,
  bass: 0.11,
  brass: 0.085,
  strings: 0.05,
  drum: 0.38,
  snare: 0.07,
  timpani: 0.32,
  pad: 0.018,
  cymbal: 0.06,
};

// The shanty, bar by bar (6 eighths each): the violin's notes as [note, eighths] ("-" is a
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

// The battle (4/4, sixteenths at 132 a minute): war drums, a driving low-string ostinato
// on each bar's chord and a heroic brass line, A section then a higher B. Each bar's brass
// notes add up to 16 sixteenths.
export const BATTLE = {
  bpm: 132,
  bars: [
    // A
    { chord: "Dm", brass: [["D4", 4], ["A4", 4], ["D5", 6], ["C5", 2]] },
    { chord: "Dm", brass: [["A4", 12], ["-", 4]] },
    { chord: "Bb", brass: [["Bb4", 4], ["F4", 4], ["Bb4", 4], ["C5", 4]] },
    { chord: "Bb", brass: [["D5", 12], ["-", 4]] },
    { chord: "C", brass: [["C5", 4], ["G4", 4], ["C5", 4], ["E5", 4]] },
    { chord: "C", brass: [["D5", 8], ["C5", 4], ["Bb4", 4]] },
    { chord: "A", brass: [["A4", 4], ["C#5", 4], ["E5", 8]] },
    { chord: "A", brass: [["E5", 4], ["D5", 4], ["C#5", 8]], fill: true },
    // B
    { chord: "Dm", brass: [["F5", 6], ["E5", 2], ["D5", 8]] },
    { chord: "Bb", brass: [["D5", 6], ["C5", 2], ["Bb4", 8]] },
    { chord: "Gm", brass: [["Bb4", 4], ["D5", 4], ["G5", 8]] },
    { chord: "A", brass: [["E5", 4], ["F5", 4], ["E5", 4], ["C#5", 4]] },
    { chord: "Dm", brass: [["D5", 4], ["F5", 4], ["A5", 8]] },
    { chord: "Bb", brass: [["G5", 4], ["F5", 4], ["D5", 8]] },
    { chord: "C", brass: [["E5", 4], ["G5", 4], ["E5", 4], ["C5", 4]] },
    { chord: "A", brass: [["C#5", 8], ["E5", 4], ["A4", 4]], fill: true },
  ],
};

// Victory: a fanfare in D major (sixteenths at 112), with timpani and a final roll.
export const VICTORY = {
  bpm: 112,
  bars: [
    { chord: "D", brass: [["A3", 2], ["D4", 2], ["F#4", 2], ["A4", 2], ["D5", 8]] },
    { chord: "G", brass: [["B4", 4], ["D5", 4], ["G5", 8]] },
    { chord: "A", brass: [["A4", 2], ["B4", 2], ["C#5", 4], ["E5", 4], ["A5", 4]] },
    { chord: "D", brass: [["F#5", 4], ["E5", 2], ["D5", 2], ["A5", 8]] },
    { chord: "D", brass: [["D5", 16]], roll: true },
  ],
};

// Defeat: a slow lament in D minor (sixteenths at 66), a lone string over soft chords.
export const DEFEAT = {
  bpm: 66,
  bars: [
    { chord: "Dm", lament: [["A4", 4], ["G4", 4], ["F4", 4], ["E4", 4]] },
    { chord: "Gm", lament: [["D4", 8], ["Bb3", 4], ["A3", 4]] },
    { chord: "A", lament: [["C#4", 4], ["E4", 4], ["A3", 8]] },
    { chord: "Dm", lament: [["D4", 16]] },
  ],
};

const CHORDS = {
  Dm: { bass: ["D2", "A2"], notes: ["D4", "F4", "A4"] },
  C: { bass: ["C2", "G2"], notes: ["C4", "E4", "G4"] },
  Bb: { bass: ["Bb1", "F2"], notes: ["Bb3", "D4", "F4"] },
  A: { bass: ["A1", "E2"], notes: ["A3", "C#4", "E4"] },
  F: { bass: ["F2", "C3"], notes: ["F3", "A3", "C4"] },
  Gm: { bass: ["G2", "D3"], notes: ["G3", "Bb3", "D4"] },
  D: { bass: ["D2", "A2"], notes: ["D4", "F#4", "A4"] },
  G: { bass: ["G2", "D3"], notes: ["G3", "B3", "D4"] },
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

// Every note of one pass through the shanty: {at, dur (in eighths), voice, freq}, by time.
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

// The chord's root or fifth in another octave: ("Dm", 3) -> D3.
const pitchClass = (note) => note.replace(/-?\d$/, "");
const root = (chord, octave) => frequency(`${pitchClass(CHORDS[chord].bass[0])}${octave}`);
const fifth = (chord, octave) => frequency(`${pitchClass(CHORDS[chord].bass[1])}${octave}`);

// A melody, as {at, dur, voice, freq} from [note, sixteenths] pairs starting at `start`.
function melody(notes, start, voice) {
  const list = [];
  let at = start;
  for (const [note, dur] of notes) {
    if (note !== "-") list.push({ at, dur, voice, freq: frequency(note) });
    at += dur;
  }
  return list;
}

// Every note of the battle piece, in sixteenths. For the drums `freq` is a loudness, 0..1.
export function battleEvents(score = BATTLE) {
  const list = [];
  const ostinato = [0, 0, 1, 0, 0, 0, 1, 2, 0, 0, 1, 0, 2, 1, 0, 0]; // root, fifth, octave
  score.bars.forEach((bar, b) => {
    const start = b * 16;
    list.push(...melody(bar.brass, start, "brass"));
    list.push({ at: start, dur: 16, voice: "brass", freq: root(bar.chord, 2) }); // low brass
    ostinato.forEach((n, i) => {
      const freq = n === 1 ? fifth(bar.chord, 2) : root(bar.chord, n === 2 ? 3 : 2);
      list.push({ at: start + i, dur: 0.8, voice: "strings", freq });
    });
    for (const at of [0, 3, 8, 10, 11]) list.push({ at: start + at, dur: 4, voice: "drum", freq: at === 0 ? 1 : 0.7 });
    for (const at of [4, 12]) list.push({ at: start + at, dur: 2, voice: "snare", freq: 1 });
    if (bar.fill) for (let i = 8; i < 16; i++) list.push({ at: start + i, dur: 2, voice: "drum", freq: 0.45 + i * 0.04 });
  });
  return list.sort((x, y) => x.at - y.at);
}

// The victory fanfare, in sixteenths.
export function victoryEvents(score = VICTORY) {
  const list = [];
  score.bars.forEach((bar, b) => {
    const start = b * 16;
    list.push(...melody(bar.brass, start, "brass"));
    for (const note of CHORDS[bar.chord].notes) list.push({ at: start, dur: 16, voice: "pad", freq: frequency(note) });
    list.push({ at: start, dur: 16, voice: "brass", freq: root(bar.chord, 2) });
    for (const at of [0, 8]) list.push({ at: start + at, dur: 6, voice: "timpani", freq: root(bar.chord, 2) });
    if (bar.roll) {
      for (let i = 1; i < 12; i++) list.push({ at: start + i, dur: 2, voice: "timpani", freq: root(bar.chord, 2) });
      list.push({ at: start, dur: 16, voice: "cymbal", freq: 1 });
    }
  });
  return list.sort((x, y) => x.at - y.at);
}

// The lament, in sixteenths.
export function defeatEvents(score = DEFEAT) {
  const list = [];
  score.bars.forEach((bar, b) => {
    const start = b * 16;
    list.push(...melody(bar.lament, start, "violin"));
    for (const note of CHORDS[bar.chord].notes) list.push({ at: start, dur: 16, voice: "pad", freq: frequency(note) / 2 });
    list.push({ at: start, dur: 12, voice: "bass", freq: root(bar.chord, 2) });
    list.push({ at: start, dur: 6, voice: "drum", freq: 0.35 });
  });
  return list.sort((x, y) => x.at - y.at);
}

// The four pieces: how long a step lasts (seconds), every note, the length in steps, and
// whether it loops (the end-of-game pieces play once).
const sixteenth = (bpm) => 60 / bpm / 4;
export const TRACKS = {
  shanty: { unit: MUSIC.eighth, notes: events(), length: LOOP_EIGHTHS, loop: true },
  battle: { unit: sixteenth(BATTLE.bpm), notes: battleEvents(), length: BATTLE.bars.length * 16, loop: true },
  victory: { unit: sixteenth(VICTORY.bpm), notes: victoryEvents(), length: VICTORY.bars.length * 16 + 8, loop: false },
  defeat: { unit: sixteenth(DEFEAT.bpm), notes: defeatEvents(), length: DEFEAT.bars.length * 16 + 4, loop: false },
};

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

// White noise for the drums, made once per audio context.
const noises = new WeakMap();
function noiseOf(ctx) {
  if (!noises.has(ctx)) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return noises.get(ctx);
}

function noiseHit(ctx, out, start, dur, type, freq, peak) {
  const src = ctx.createBufferSource();
  src.buffer = noiseOf(ctx);
  src.loop = true;
  const tone = ctx.createBiquadFilter();
  tone.type = type;
  tone.frequency.value = freq;
  src.connect(tone).connect(envelope(ctx, out, start, dur, peak, 0.002, dur * 0.9));
  src.start(start);
  src.stop(start + dur + 0.05);
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
  // A brass section: two sawtooths a few cents apart through a filter that opens as the
  // note speaks, then settles (the "blare" of a horn).
  brass(ctx, out, start, dur, freq) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 2;
    tone.frequency.setValueAtTime(500, start);
    tone.frequency.exponentialRampToValueAtTime(2600, start + 0.07);
    tone.frequency.exponentialRampToValueAtTime(1500, start + Math.max(0.1, Math.min(dur, 0.5)));
    tone.connect(envelope(ctx, out, start, dur, MUSIC.brass * (freq < 130 ? 0.7 : 1), 0.05, 0.16));
    for (const cents of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq * 2 ** (cents / 1200);
      osc.connect(tone);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  },
  // Low strings playing short, driving notes.
  strings(ctx, out, start, dur, freq) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1100;
    tone.connect(envelope(ctx, out, start, dur, MUSIC.strings, 0.006, dur * 0.5));
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(tone);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  },
  // A big war drum: a deep thud that falls in pitch, and the slap of the skin.
  drum(ctx, out, start, dur, level) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, start);
    osc.frequency.exponentialRampToValueAtTime(46, start + 0.28);
    osc.connect(envelope(ctx, out, start, Math.min(dur, 0.55), MUSIC.drum * level, 0.004, 0.45));
    osc.start(start);
    osc.stop(start + 0.6);
    noiseHit(ctx, out, start, 0.08, "lowpass", 500, MUSIC.drum * level * 0.5);
  },
  snare(ctx, out, start) {
    noiseHit(ctx, out, start, 0.14, "bandpass", 1900, MUSIC.snare);
  },
  timpani(ctx, out, start, dur, freq) {
    for (const [ratio, level] of [
      [1, 1],
      [1.5, 0.35],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * ratio * 1.04, start);
      osc.frequency.exponentialRampToValueAtTime(freq * ratio, start + 0.08);
      osc.connect(envelope(ctx, out, start, Math.min(dur, 1.4), MUSIC.timpani * level, 0.005, 1.1));
      osc.start(start);
      osc.stop(start + 1.5);
    }
    noiseHit(ctx, out, start, 0.06, "lowpass", 700, MUSIC.timpani * 0.4);
  },
  // Soft held chords (strings and voices far away).
  pad(ctx, out, start, dur, freq) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 900;
    tone.connect(envelope(ctx, out, start, dur, MUSIC.pad, Math.min(0.6, dur / 3), Math.min(0.9, dur / 2)));
    for (const cents of [-9, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq * 2 ** (cents / 1200);
      osc.connect(tone);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  },
  // A cymbal swelling up to the last chord.
  cymbal(ctx, out, start, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseOf(ctx);
    src.loop = true;
    const tone = ctx.createBiquadFilter();
    tone.type = "highpass";
    tone.frequency.value = 5000;
    src.connect(tone).connect(envelope(ctx, out, start, dur, MUSIC.cymbal, dur * 0.8, dur * 0.2));
    src.start(start);
    src.stop(start + dur + 0.05);
  },
};

// One whole pass of a piece into `out`, from time `at` (for recording it offline).
export function playPass(ctx, out, at = 0, name = "shanty") {
  const track = TRACKS[name];
  for (const note of track.notes) INSTRUMENTS[note.voice](ctx, out, at + note.at * track.unit, note.dur * track.unit, note.freq);
  return track.length * track.unit;
}

// --- the player ---------------------------------------------------------------------------

// `track`: the piece the game is in; `gain`: that piece's own fader (each piece gets a new
// one, so the old one can fade out by itself); `done`: a piece that plays once has ended.
const player = { running: false, timer: null, track: "shanty", next: 0, loopStart: 0, output: null, gain: null, done: false };

function wanted() {
  const hidden = globalThis.document?.visibilityState === "hidden";
  return isUnlocked() && !isMuted() && getLevel("music") > 0 && !hidden;
}

// A fader for a new piece, rising from silence at `at`.
function fader(ctx, out, at) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(1, at + 0.6);
  gain.connect(out);
  return gain;
}

function schedule() {
  const { ctx } = player.output;
  const track = TRACKS[player.track];
  while (!player.done && player.loopStart + track.notes[player.next].at * track.unit < ctx.currentTime + MUSIC.lookahead) {
    const note = track.notes[player.next];
    try {
      INSTRUMENTS[note.voice](ctx, player.gain, player.loopStart + note.at * track.unit, note.dur * track.unit, note.freq);
    } catch {
      // a missed note is no reason to stop the music
    }
    player.next += 1;
    if (player.next === track.notes.length) {
      player.next = 0;
      if (track.loop) player.loopStart += track.length * track.unit;
      else player.done = true; // the fanfare or the lament has been played
    }
  }
}

function start() {
  if (player.running) return;
  const output = musicOutput();
  if (!output) return;
  player.output = output;
  player.running = true;
  const track = TRACKS[player.track];
  const now = output.ctx.currentTime;
  player.gain = fader(output.ctx, output.out, now);
  // carry on from where it paused, a moment from now
  player.loopStart = now + 0.1 - track.notes[player.next].at * track.unit;
  schedule();
  player.timer = setInterval(schedule, 60);
}

function stop() {
  if (!player.running) return;
  clearInterval(player.timer);
  player.running = false;
  // the notes already queued go quiet
  player.gain?.gain.setTargetAtTime?.(0, player.output.ctx.currentTime, 0.05);
}

// Starts or stops the music to match the sound switch, the slider and the tab.
export function updateMusic() {
  if (wanted()) start();
  else stop();
}

export function isPlaying() {
  return player.running;
}

// The piece for this moment of the game: "shanty" (menus, placing the fleet), "battle",
// "victory" or "defeat" (these two play once). The old piece fades out, then the new one
// fades in from its start; asking for the piece already chosen changes nothing.
export function setMusic(name) {
  if (!TRACKS[name] || name === player.track) return;
  player.track = name;
  player.next = 0;
  player.done = false;
  if (!player.running) return; // it will start with this piece when sound is allowed
  const { ctx, out } = player.output;
  const now = ctx.currentTime;
  const old = player.gain;
  old.gain.cancelScheduledValues?.(now);
  old.gain.setValueAtTime(old.gain.value, now);
  old.gain.linearRampToValueAtTime(0, now + MUSIC.fade);
  setTimeout(() => old.disconnect?.(), (MUSIC.fade + 1) * 1000);
  const at = now + MUSIC.fade;
  player.gain = fader(ctx, out, at);
  player.loopStart = at + 0.05;
  schedule();
}

export function currentMusic() {
  return player.track;
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
