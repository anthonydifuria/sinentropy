(function () {
"use strict";
/* ============================================================
   sine.js — Sine/BinOp/Neg: the recursive, sample-evaluated tree that
   makes up one voice's oscillator, plus any nested FM/AM/PM/pan
   modulators (to any depth).

   A "child slot" (freq/amp/phase/pan on a Sine, left/right on a BinOp,
   node on a Neg) is either a plain number or another node object with
   its own .eval(t, sr) — evalChild() is the one place that distinguishes
   the two, so every node's own .eval() stays simple.

   Each Sine keeps its own running phase accumulator (._acc) across
   process() calls, exactly like the un-split worklet did — nesting depth
   costs CPU inside one voice's .eval(), never extra AudioWorkletNodes.
   ============================================================ */

function evalChild(child, t, sr) {
  return typeof child === "number" ? child : child.eval(t, sr);
}

class Sine {
  constructor(freq, amp, phase, pan, env) {
    this.freq = freq;
    this.amp = amp;
    this.phase = phase;
    this.pan = pan; // read by Voice, not by .eval() — see voice.js
    this.env = env || null; // an Envelope instance, or null (sustains until stopped)
    this._acc = 0;
  }
  eval(t, sr) {
    const freq = evalChild(this.freq, t, sr);
    const amp = evalChild(this.amp, t, sr);
    const phaseArg = evalChild(this.phase, t, sr);
    const out = Math.sin(this._acc + phaseArg);
    this._acc += (2 * Math.PI * freq) / sr;
    // keep the accumulator from growing without bound over long,
    // envelope-less (sustained) voices
    if (this._acc > 1e7 || this._acc < -1e7) this._acc %= 2 * Math.PI;
    const envMul = this.env ? this.env.valueAt(t) : 1;
    return out * amp * envMul;
  }
  // Duration in seconds implied by this oscillator's own envelope, or null
  // if it has none (sustains indefinitely, until the pool drops it on an
  // explicit "clear" — see voice-pool-processor.js).
  duration() {
    if (!this.env || !this.env.points || this.env.points.length === 0) return null;
    return this.env.points[this.env.points.length - 1].time + 0.05;
  }
}

class BinOp {
  constructor(op, left, right) {
    this.op = op;
    this.left = left;
    this.right = right;
  }
  eval(t, sr) {
    const l = evalChild(this.left, t, sr);
    const r = evalChild(this.right, t, sr);
    switch (this.op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/": return l / r;
    }
    return 0;
  }
}

class Neg {
  constructor(node) { this.node = node; }
  eval(t, sr) { return -evalChild(this.node, t, sr); }
}

const _exports = { Sine, BinOp, Neg, evalChild };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
