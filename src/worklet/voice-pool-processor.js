(function () {
"use strict";
/* ============================================================
   voice-pool-processor.js — VoicePoolProcessor: one persistent
   AudioWorkletNode per track (see src/audio/engine.js), holding a plain
   JS array of live Voice instances instead of one AudioWorkletNode per
   voice.

   This is the actual efficiency fix: pressing Run sends the new
   program's voices to this SAME node via postMessage({type:"add", ...})
   instead of creating new nodes, so a 3-step program and a 300-step
   program cost the same number of nodes (one, per track). A voice that
   reaches the end of its own envelope is spliced out of the array on the
   very render quantum it finishes — its memory and CPU are freed
   immediately, with no extra node to disconnect or garbage-collect.

   Voices with no envelope (drones) never finish on their own, by design
   — {type:"clear"} empties the whole array instantly, with no fade.

   {type:"release", seconds} is the graceful counterpart: every voice
   currently in the pool starts fading its own output to zero over
   `seconds` (see voice.js's startRelease()), and is only dropped once its
   fade actually reaches zero — a voice already fading (from an earlier
   Run/Stop) is left alone rather than having its fade restarted. Stop and
   Run both use this when the program declares "let release = ..."
   (src/audio/engine.js decides the seconds; 0 there behaves like
   {type:"clear"}).

   A voice that hasn't started yet must stay cheap: see voice.js's
   renderBlock, which skips a whole not-yet-due render quantum in one
   step (O(1)) instead of looping sample-by-sample just to count — that's
   what keeps a program with thousands of far-future steps (a big
   overlap/seq) from choking the audio thread before any of them even
   make a sound.
   ============================================================ */

let Voice;
if (typeof module !== "undefined" && module.exports) {
  ({ Voice } = require("./voice.js"));
} else {
  ({ Voice } = globalThis);
}

class VoicePoolProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.port.onmessage = e => {
      const msg = e.data;
      if (msg.type === "add") {
        this.voices.push(Voice.fromPlain(msg.tree, msg.startOffset, sampleRate));
      } else if (msg.type === "addBatch") {
        // One message for a whole program's worth of voices instead of
        // one per voice — with hundreds/thousands of steps that's many
        // fewer structured-clone hops right when Run is pressed.
        for (const item of msg.items) {
          this.voices.push(Voice.fromPlain(item.tree, item.startOffset, sampleRate));
        }
      } else if (msg.type === "clear") {
        this.voices.length = 0;
      } else if (msg.type === "release") {
        const seconds = msg.seconds || 0;
        if (seconds <= 0) {
          this.voices.length = 0;
        } else {
          for (const v of this.voices) v.startRelease(seconds, sampleRate);
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];
    left.fill(0);
    if (right !== left) right.fill(0);
    const sr = sampleRate;
    // iterate backwards so splicing a finished voice doesn't skip the
    // next one
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const finished = this.voices[i].renderBlock(left, right, sr);
      if (finished) this.voices.splice(i, 1);
    }
    return true; // this node lives for the whole track's session, not per-voice
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VoicePoolProcessor };
} else {
  registerProcessor("sinentropy-voice-pool", VoicePoolProcessor);
}
})();
