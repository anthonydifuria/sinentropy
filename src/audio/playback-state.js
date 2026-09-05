(function () {
"use strict";
/* ============================================================
   playback-state.js — the small bit of mutable state that both
   src/ui.js (starting/stopping playback) and src/audio/visualizer.js
   (deciding how long to keep animating) need to share. A single
   long-lived object, mutated in place, rather than a value reassigned
   independently by each file — that's what keeps two plain <script>
   files in sync without any module/event-bus machinery.
   ============================================================ */
const playbackState = {
  rafId: null, // current requestAnimationFrame handle for the entropy/spectrum/waveform loop, or null
  stopAtLoopEnd: { A: 0, B: 0 }, // each track's own estimated end time (ctx.currentTime), Infinity if indefinite
};

const _exports = { playbackState };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
