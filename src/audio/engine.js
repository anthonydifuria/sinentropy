(function () {
"use strict";
/* ============================================================
   engine.js — main-thread audio engine: owns the AudioContext, the
   master bus/analyser, and one persistent "voice pool" AudioWorkletNode
   per track (src/worklet/voice-pool-processor.js).

   Each track's pool node is created ONCE, on first use, and reused
   across every Run press — pressing Run never spins up a new node, it
   just clears the pool and posts the new voices into it. That's what
   keeps a 100-step seq/overlap program cheap: the node count per track
   stays at 1 no matter how many voices the program schedules, and a
   voice that finishes its own envelope is dropped from the pool's
   internal list the moment it happens (see voice.js/renderBlock), not
   left waiting on the audio graph to tear down a whole extra node.
   ============================================================ */

const WORKLET_MODULES = [
  "src/worklet/envelope.js",
  "src/worklet/sine.js",
  "src/worklet/voice.js",
  "src/worklet/voice-pool-processor.js",
];

let ctx = null, master = null, analyser = null, workletReady = null;
const poolNodes = { A: null, B: null };
// The release time (seconds) declared by whatever is CURRENTLY alive on
// each track — i.e. the value its own "let release = ..." produced when it
// was started. Stop, and the next Run, use this (not the new program's own
// release value) to decide how to end what's already playing.
const lastRelease = { A: 0, B: 0 };

async function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  if (!workletReady) {
    // Sequential, not Promise.all: the four files share one global scope
    // and must execute in dependency order (envelope/sine before voice,
    // voice before the processor that constructs Voice instances).
    workletReady = (async () => {
      for (const url of WORKLET_MODULES) await ctx.audioWorklet.addModule(url);
    })();
  }
  await workletReady;
  ensurePoolNodes();
}

function ensurePoolNodes() {
  for (const track of ["A", "B"]) {
    if (!poolNodes[track]) {
      const node = new AudioWorkletNode(ctx, "sinentropy-voice-pool", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.connect(master);
      poolNodes[track] = node;
    }
  }
}

// Ends whatever's currently playing on `track`: an instant cut if no
// "let release" was in effect for it, otherwise a fade over that many
// seconds (see voice-pool-processor.js's {type:"release"}). Returns the
// release time actually used, so the caller (the Stop button, or the next
// Run) knows how long to keep the visualizer animating for.
function stopTrack(track) {
  const seconds = lastRelease[track] || 0;
  if (poolNodes[track]) poolNodes[track].port.postMessage({ type: "release", seconds });
  lastRelease[track] = 0; // nothing of the old program is left to release again
  return seconds;
}

// Sends the freshly-interpreted voices to `track`'s pool node. Whatever
// was already playing is ended via stopTrack() first (instantly, or faded,
// per ITS OWN declared release time) — the new voices always start fresh
// at full amplitude, unaffected by that fade. Returns an estimated end
// time (or Infinity if any voice has no envelope) — used only by the
// visualizer to decide how long to keep animating; it never affects when a
// voice's own resources are actually freed, which the pool decides for
// itself.
async function playVoices(voices, track) {
  await ensureCtx();
  stopTrack(track);
  lastRelease[track] = typeof voices.release === "number" ? voices.release : 0;
  const node = poolNodes[track];
  const now = ctx.currentTime;
  let maxEnd = now;
  let anyIndefinite = false;
  // One postMessage for the whole program instead of one per voice: with
  // a big seq/overlap (hundreds or thousands of steps) sending them one
  // at a time means that many separate structured-clone hops, which adds
  // up to a real hitch right when Run is pressed.
  const items = [];
  voices.forEach(v => {
    const startAt = v.startAt || 0; // seconds after playback starts (seq/overlap scheduling)
    items.push({ tree: v, startOffset: startAt });
    if (v.env) {
      const dur = v.env[v.env.length - 1].time + 0.05;
      maxEnd = Math.max(maxEnd, now + startAt + dur);
    } else {
      anyIndefinite = true; // no envelope: sustains until Stop is pressed
    }
  });
  node.port.postMessage({ type: "addBatch", items });
  return anyIndefinite ? Infinity : maxEnd;
}

function getCtx() { return ctx; }
function getAnalyser() { return analyser; }

const _exports = { ensureCtx, playVoices, stopTrack, getCtx, getAnalyser };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
