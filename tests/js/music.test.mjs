import assert from "node:assert/strict";
import { test } from "node:test";

// A fake audio engine (recording what the music asks of it) and a fake page.
const duckCalls = [];
const param = (name) => ({
  value: 0,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {},
  setTargetAtTime(v) {
    if (name === "duck") duckCalls.push(v);
  },
});
let oscillators = 0;
let gains = 0;
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = "running";
    this.destination = {};
  }
  createGain() {
    gains += 1;
    // the 4th gain made by sound.js is the ducking one (master, voice, music, duck)
    return { gain: param(gains === 4 ? "duck" : "gain"), connect: (to) => to };
  }
  createOscillator() {
    oscillators += 1;
    return { type: "", frequency: param("f"), connect: (to) => to, start() {}, stop() {} };
  }
  createBiquadFilter() {
    return { type: "", frequency: param("f"), Q: param("q"), connect: (to) => to };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }
  createBufferSource() {
    return { connect: (to) => to, start() {}, stop() {} };
  }
}
globalThis.AudioContext = FakeAudioContext;
const pageHandlers = {};
globalThis.document = {
  visibilityState: "visible",
  addEventListener: (type, fn) => (pageHandlers[type] = fn),
};

const sound = await import("../../web/js/sound.js");
const { LOOP_EIGHTHS, SCORE, events, frequency, isPlaying, updateMusic } = await import("../../web/js/music.js");

test("the score is well formed: 6/8 bars, real notes, known chords", () => {
  assert.equal(SCORE.length, 16);
  for (const [b, bar] of SCORE.entries()) {
    assert.equal(bar.tune.reduce((n, [, d]) => n + d, 0), 6, `bar ${b + 1} has six eighths`);
  }
  const list = events();
  assert.ok(list.every((e, i) => i === 0 || list[i - 1].at <= e.at), "in time order");
  assert.ok(list.every((e) => e.at < LOOP_EIGHTHS && e.freq > 20 && e.freq < 2000));
  assert.deepEqual(new Set(list.map((e) => e.voice)), new Set(["violin", "accordion", "bass"]));
  assert.equal(frequency("A4"), 440);
  assert.ok(Math.abs(frequency("C#5") - 554.37) < 0.01);
  assert.ok(Math.abs(frequency("Bb1") - 58.27) < 0.01);
});

test("no music on load: not before a gesture, not while sound is off", () => {
  updateMusic();
  assert.equal(isPlaying(), false);
  sound.unlock(); // the first click…
  assert.equal(isPlaying(), false, "…but sound is still off (the default)");
  assert.equal(oscillators, 0);
});

test("turning sound on starts it; the music slider at 0 stops it", () => {
  sound.setMuted(false);
  assert.equal(isPlaying(), true);
  assert.ok(oscillators > 0, "notes were scheduled");
  sound.setLevel("music", 0);
  assert.equal(isPlaying(), false);
  sound.setLevel("music", 0.4);
  assert.equal(isPlaying(), true);
});

test("a hidden tab pauses it and coming back resumes it", () => {
  globalThis.document.visibilityState = "hidden";
  pageHandlers.visibilitychange();
  assert.equal(isPlaying(), false);
  globalThis.document.visibilityState = "visible";
  pageHandlers.visibilitychange();
  assert.equal(isPlaying(), true);
});

test("it steps aside while the parrot speaks, then comes back", async () => {
  duckCalls.length = 0;
  sound.parrotSay("¡Hundido!", "zz"); // no voice for "zz": a squawk, then quiet again
  assert.ok(duckCalls[0] < 1, "ducked");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(duckCalls.at(-1), 1, "back to full level");
  sound.setMuted(true);
  assert.equal(isPlaying(), false);
});
