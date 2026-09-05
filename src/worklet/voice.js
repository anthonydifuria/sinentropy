(function () {
"use strict";
/* ============================================================
   voice.js — Voice: one scheduled sound inside the pool (see
   voice-pool-processor.js), plus buildNode()/Voice.fromPlain(), which
   reconstruct the plain, structured-clone-safe descriptor objects that
   cross from the main thread (compiler.js's compileExpr() output —
   {type:"osc"/"binop"/"neg", ...}, or a bare number) into real
   Sine/BinOp/Neg/Envelope instances with working .eval() methods.
   postMessage strips prototypes, so this rebuild happens once per voice
   when it's added to the pool — never per sample.
   ============================================================ */

let Sine, BinOp, Neg, evalChild, Envelope;
if (typeof module !== "undefined" && module.exports) {
  ({ Sine, BinOp, Neg, evalChild } = require("./sine.js"));
  ({ Envelope } = require("./envelope.js"));
} else {
  ({ Sine, BinOp, Neg, evalChild, Envelope } = globalThis);
}

function buildNode(plain) {
  if (typeof plain === "number") return plain;
  switch (plain.type) {
    case "osc": {
      const env = plain.env ? new Envelope(plain.env) : null;
      return new Sine(buildNode(plain.freq), buildNode(plain.amp), buildNode(plain.phase), buildNode(plain.pan), env);
    }
    case "binop":
      return new BinOp(plain.op, buildNode(plain.left), buildNode(plain.right));
    case "neg":
      return new Neg(buildNode(plain.node));
  }
  throw new Error("Unknown compiled node type: " + plain.type);
}

class Voice {
  constructor(root, startOffset, sr) {
    this.root = root; // a Sine instance (the reconstructed tree's root — always an "osc" node)
    this.sampleCount = 0; // elapsed samples since THIS VOICE'S OWN start (after any startOffset wait)
    this.waited = 0; // elapsed samples since the voice was added, while still waiting to start
    this.startSamples = Math.max(0, Math.round((startOffset || 0) * sr));
    this.rootDur = root.duration(); // null => sustains until the pool is explicitly cleared
    this.releasing = false; // true once startRelease() has been called
    this.releaseSamplesTotal = 0;
    this.releaseSamplesElapsed = 0;
  }

  // Called by the pool when Stop/Run asks every currently-live voice to
  // fade out over `seconds` instead of being cut instantly (the "let
  // release = ..." convention — see interpreter.js/engine.js). Idempotent:
  // a voice already fading (e.g. from an earlier Run, still finishing its
  // own fade) keeps its original fade untouched rather than restarting it.
  startRelease(seconds, sr) {
    if (this.releasing) return;
    this.releasing = true;
    this.releaseSamplesTotal = Math.max(1, Math.round(seconds * sr));
    this.releaseSamplesElapsed = 0;
  }

  // Renders this voice's contribution into `left`/`right`, ADDING (not
  // overwriting) each sample, for one render quantum — multiple voices in
  // the same pool share one buffer, so summing happens here rather than
  // via the Web Audio graph. Returns true once this voice has played its
  // own envelope to the end; the pool then drops it from its list on this
  // very call — that's the whole resource-reclamation story: no lingering
  // AudioWorkletNode per voice, just one object removed from an array.
  renderBlock(left, right, sr) {
    const n = left.length;
    // Still waiting for its scheduled start, and won't reach it this
    // block at all: skip the whole quantum in one step instead of
    // looping sample-by-sample just to count. This is what keeps a
    // program with thousands of far-future voices cheap — each one costs
    // O(1) per block until its own start gets close, not O(block size).
    const remaining = this.startSamples - this.waited;
    if (remaining >= n) {
      // Told to release before it ever made a sound (a scheduled-but-not-
      // yet-due step in a long seq/overlap, still waiting when Stop/Run
      // was pressed): there's nothing audible to fade, so just drop it —
      // otherwise it would sit here doing nothing until its original
      // onset arrives, possibly many seconds later, then still play.
      if (this.releasing) return true;
      this.waited += n;
      return false;
    }
    let i = 0;
    if (remaining > 0) {
      this.waited += remaining;
      i = remaining;
    }
    for (; i < n; i++) {
      const t = this.sampleCount / sr;
      if (this.rootDur !== null && t > this.rootDur) {
        return true;
      }
      let gain = 1;
      if (this.releasing) {
        if (this.releaseSamplesElapsed >= this.releaseSamplesTotal) return true; // fade complete
        gain = 1 - this.releaseSamplesElapsed / this.releaseSamplesTotal;
        this.releaseSamplesElapsed++;
      }
      const pan = evalChild(this.root.pan, t, sr);
      const s = this.root.eval(t, sr) * gain;
      const p = Math.max(-1, Math.min(1, pan || 0));
      // equal-power pan law
      const angle = ((p + 1) * Math.PI) / 4; // 0 (left) .. pi/4 (center) .. pi/2 (right)
      left[i] += s * Math.cos(angle);
      right[i] += s * Math.sin(angle);
      this.sampleCount++;
    }
    return false;
  }

  static fromPlain(plainTree, startOffset, sr) {
    return new Voice(buildNode(plainTree), startOffset, sr);
  }
}

const _exports = { Voice, buildNode };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
