(function () {
"use strict";
/* ============================================================
   envelope.js — Envelope class: a linseg-style breakpoint envelope.

   `points` is already a cumulative-time (time, value) array, as produced
   by compiler.js's envPointsFromArgs() on the main thread and carried
   across the postMessage boundary as plain data — this class is what
   src/worklet/voice.js reconstructs it into on the worklet side.
   ============================================================ */
class Envelope {
  constructor(points) {
    this.points = points; // [{time, value}, ...]
  }
  valueAt(t) {
    const points = this.points;
    if (!points || points.length === 0) return 1;
    if (t <= points[0].time) return points[0].value;
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i].time) {
        const p0 = points[i - 1], p1 = points[i];
        const span = p1.time - p0.time;
        const frac = span > 0 ? (t - p0.time) / span : 1;
        return p0.value + (p1.value - p0.value) * frac;
      }
    }
    return points[points.length - 1].value;
  }
}

const _exports = { Envelope };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
