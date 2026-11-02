import assert from "node:assert/strict";
import { test } from "node:test";

// Fakes for the browser's audio and speech engines, installed before the module loads.
let contexts = 0;
class FakeAudioContext {
  constructor() {
    contexts += 1;
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = {};
  }
  createGain() {
    return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }
  createOscillator() {
    return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
  }
  createBufferSource() {
    return { connect: (x) => x, start() {}, stop() {} };
  }
  createBiquadFilter() {
    return { Q: {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({}) };
  }
}
const spoken = [];
let voices = [];
globalThis.AudioContext = FakeAudioContext;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.speechSynthesis = { getVoices: () => voices, cancel() {}, speak: (u) => spoken.push(u) };

const { isMuted, setMuted, sfx, speak, unlock } = await import("../../web/js/sound.js");

test("silent by default, and nothing sounds before the first gesture", () => {
  assert.equal(isMuted(), true); // no remembered choice: muted
  setMuted(false);
  sfx.launch();
  sfx.splash();
  assert.equal(contexts, 0, "no audio context before a click or key press");
  voices = [{ lang: "es-ES", localService: true }];
  assert.equal(speak("¡Agua!", "es"), false);
  assert.equal(spoken.length, 0);
});

test("after a gesture: effects play and the parrot speaks high, in its language", () => {
  unlock();
  sfx.launch();
  sfx.sink();
  assert.equal(contexts, 1);
  voices = [
    { lang: "en-GB", localService: true },
    { lang: "es-ES", localService: false },
    { lang: "es-MX", localService: true },
  ];
  assert.equal(speak("¡Tocado, grumete!", "es"), true);
  const line = spoken.at(-1);
  assert.equal(line.text, "¡Tocado, grumete!");
  assert.equal(line.lang, "es-MX"); // a local Spanish voice is preferred
  assert.ok(line.pitch > 1.5);
});

test("no voice for the language, or sound off: speak declines so the parrot squawks", () => {
  voices = [{ lang: "fr-FR", localService: true }];
  assert.equal(speak("Water, water!", "en"), false);
  voices = [{ lang: "en-US", localService: true }];
  setMuted(true);
  assert.equal(speak("Water, water!", "en"), false);
  assert.equal(isMuted(), true);
});

test("a broken speech engine never throws into the game", () => {
  setMuted(false);
  voices = [{ lang: "es-ES", localService: true }];
  const realSpeak = globalThis.speechSynthesis.speak;
  globalThis.speechSynthesis.speak = () => {
    throw new TypeError("Failed to convert value to 'SpeechSynthesisVoice'");
  };
  assert.equal(speak("¡Hundido!", "es"), false);
  globalThis.speechSynthesis.speak = realSpeak;
  setMuted(true);
});
