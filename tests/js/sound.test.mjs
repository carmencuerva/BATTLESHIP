import assert from "node:assert/strict";
import { test } from "node:test";

// Fakes for the browser's audio and speech engines, installed before the module loads.
const made = { contexts: 0, oscillators: [] };
const param = () => ({ value: 0, ramps: [], setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.ramps.push(v); } });
const node = (extra = {}) => ({ connect: (to) => to, start() {}, stop() {}, ...extra });
class FakeAudioContext {
  constructor() {
    made.contexts += 1;
    this.state = "running";
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = {};
  }
  createGain() {
    return node({ gain: param() });
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }
  createOscillator() {
    const osc = node({ type: "sine", frequency: param() });
    made.oscillators.push(osc);
    return osc;
  }
  createBufferSource() {
    return node();
  }
  createBiquadFilter() {
    return node({ type: "", Q: param(), frequency: param() });
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

const { PARROT_MOODS, PARROT_VOICE, SQUAWK, SQUAWKS, deliveryOf, isMuted, parrotSay, phrases, setMuted, sfx, unlock } = await import(
  "../../web/js/sound.js"
);
const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000 + 30));

test("silent by default, and nothing sounds before the first gesture", () => {
  assert.equal(isMuted(), true); // no remembered choice: muted
  setMuted(false);
  sfx.launch();
  voices = [{ lang: "es-ES", localService: true }];
  assert.deepEqual(parrotSay("¡Hundido!", "es"), { squawk: false, words: false });
  assert.equal(made.contexts, 0, "no audio context before a click or key press");
});

test("a squawk first: hoarse sawtooths gliding down", () => {
  unlock();
  made.oscillators.length = 0;
  const result = parrotSay("¡Hundido! Quedan 3 barcos por hundir.", "es");
  assert.equal(result.squawk, true);
  const saws = made.oscillators.filter((o) => o.type === "sawtooth");
  assert.equal(saws.length, 2 * SQUAWK.chirps.length); // two detuned saws per chirp
  for (const saw of saws) assert.ok(saw.frequency.ramps[0] < saw.frequency.value, "the pitch falls");
});

test("then the words, phrase by phrase, lively, in the page's language", async () => {
  spoken.length = 0;
  voices = [
    { lang: "en-GB", localService: true, name: "English" },
    { lang: "es-ES", localService: false, name: "Spanish (old)" },
    { lang: "es-MX", localService: true, name: "Spanish local" },
  ];
  const result = parrotSay("¡Tocado y hundido! ¡Te quedan tres barcos por hundir!", "es", "sunk");
  assert.equal(result.words, true);
  assert.equal(spoken.length, 0, "the words wait for the squawk");
  await wait(PARROT_VOICE.afterSquawk);
  assert.deepEqual(spoken.map((u) => u.text), ["¡Tocado y hundido!", "¡Te quedan tres barcos por hundir!"]);
  assert.equal(spoken[0].lang, "es-MX"); // a local Spanish voice beats an old remote one
  assert.ok(spoken[0].pitch > 1, "a rather high, cartoon-parrot voice");
  assert.ok(spoken[0].pitch > spoken[1].pitch, "the exclamation is lifted above the rest");
});

test("a natural (neural) voice is preferred when the device has one", async () => {
  spoken.length = 0;
  voices = [
    { lang: "es-ES", localService: true, name: "Microsoft Helena - Spanish" },
    { lang: "es-ES", localService: false, name: "Microsoft Elvira Online (Natural) - Spanish" },
  ];
  parrotSay("¡Tu turno, capitán!", "es", "turn");
  await wait(PARROT_VOICE.afterSquawk);
  assert.match(spoken[0].voice.name, /Natural/);
});

test("each mood has its own delivery", () => {
  const happy = deliveryOf("¡Victoria!", "victory")[0];
  const sad = deliveryOf("Nos vamos a pique…", "defeat")[0];
  const worried = deliveryOf("¡Han hundido uno de tus barcos!", "lost")[0];
  const turn = deliveryOf("¡Tu turno!", "turn")[0];
  assert.ok(happy.pitch > worried.pitch && worried.pitch > sad.pitch);
  assert.ok(sad.rate < turn.rate, "sad is slow, your turn is quick");
  for (const mood of Object.keys(PARROT_MOODS)) assert.ok(SQUAWKS[PARROT_MOODS[mood].squawk], mood);
  assert.deepEqual(phrases("¡Otro al fondo! ¡Solo queda uno, capitán!"), ["¡Otro al fondo!", "¡Solo queda uno, capitán!"]);
  assert.deepEqual(phrases("Arr! Down we go…"), ["Arr!", "Down we go…"]);
});

test("no voice for the language: only the squawk (the bubble shows the words)", async () => {
  spoken.length = 0;
  voices = [{ lang: "fr-FR", localService: true }];
  assert.deepEqual(parrotSay("Sunk! 2 ships left to sink.", "en"), { squawk: true, words: false });
  await wait(PARROT_VOICE.afterSquawk);
  assert.equal(spoken.length, 0);
});

test("sound off: neither squawk nor words, and pending words are dropped", async () => {
  spoken.length = 0;
  voices = [{ lang: "en-US", localService: true }];
  parrotSay("Victory!", "en");
  setMuted(true); // turned off before the words come
  await wait(PARROT_VOICE.afterSquawk);
  assert.equal(spoken.length, 0);
  assert.deepEqual(parrotSay("Victory!", "en"), { squawk: false, words: false });
});

test("a broken speech engine never throws into the game", async () => {
  setMuted(false);
  voices = [{ lang: "es-ES", localService: true }];
  const real = globalThis.speechSynthesis.speak;
  globalThis.speechSynthesis.speak = () => {
    throw new TypeError("Failed to convert value to 'SpeechSynthesisVoice'");
  };
  assert.doesNotThrow(() => parrotSay("¡Hundido!", "es"));
  await wait(PARROT_VOICE.afterSquawk); // the delayed words fail quietly too
  globalThis.speechSynthesis.speak = real;
  setMuted(true);
});
