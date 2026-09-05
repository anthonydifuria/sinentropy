(function () {
"use strict";
/* ============================================================
   interpreter.js — runs statements, collects top-level voices.

   Top-level "name(params)_{ body }" definitions are collected up front
   (only at the top level of the program — not inside a for-loop or
   another definition's body), so a call can reference a definition
   regardless of textual order, including calling itself.
   ============================================================ */

let compileExpr, isSignal, coerceScalar, defaultStepEnv;
if (typeof module !== "undefined" && module.exports) {
  ({ compileExpr, isSignal, coerceScalar, defaultStepEnv } = require("./compiler.js"));
} else {
  ({ compileExpr, isSignal, coerceScalar, defaultStepEnv } = globalThis);
}

function collectDefs(stmts, defs) {
  for (const st of stmts) {
    if (st.type === "def") {
      if (defs[st.name]) throw new Error('"' + st.name + '(...)" is already defined');
      defs[st.name] = { params: st.params, body: st.body };
    }
  }
}

const MAX_CALL_DEPTH = 64;

function interpret(program) {
  const voices = [];
  const defs = Object.create(null);
  let callDepth = 0;

  collectDefs(program, defs);

  // Runs a previously-defined sound, collecting the voices it produces
  // (which may recursively include more seq/overlap blocks) into `sink`,
  // each optionally time-shifted by `startAt` seconds — used both for a
  // plain top-level call (startAt 0) and for a name(...) step inside a
  // seq/overlap block (startAt = that step's scheduled onset).
  function runCall(name, argNodes, env, sink, startAt) {
    const def = defs[name];
    if (!def) {
      throw new Error('Unknown sound "' + name + '(...)" — define it first with "' + name + '(...)_{ ... }"');
    }
    if (argNodes.length !== def.params.length) {
      throw new Error('"' + name + '(...)" expects ' + def.params.length + ' argument(s), got ' + argNodes.length);
    }
    const argVals = argNodes.map(a => compileExpr(a, env));
    if (callDepth >= MAX_CALL_DEPTH) {
      throw new Error('"' + name + '(...)" recursion is too deep (over ' + MAX_CALL_DEPTH + ' levels) — check for a call cycle that never bottoms out');
    }
    const callEnv = Object.create(null);
    def.params.forEach((p, i) => { callEnv[p] = argVals[i]; });
    const localSink = [];
    callDepth++;
    try {
      run(def.body, callEnv, localSink);
    } finally {
      callDepth--;
    }
    localSink.forEach(v => {
      v.startAt = (v.startAt || 0) + (startAt || 0);
      sink.push(v);
    });
  }

  // Schedules a seq/overlap block: walks its steps, accumulating a cumulative
  // onset time from the (constant, or per-step, cycled) hop, and compiles
  // each step into one or more voices tagged with that onset as .startAt —
  // the audio engine plays each voice sample-accurately from that offset.
  function runSeq(st, env, sink) {
    const hopVal = compileExpr(st.hop, env);
    let hopArr = null, hopConst = null;
    if (Array.isArray(hopVal)) {
      hopArr = hopVal.map(h => coerceScalar(h, "a seq/overlap hop value"));
      if (hopArr.length === 0) throw new Error("seq/overlap hop array cannot be empty");
    } else {
      hopConst = coerceScalar(hopVal, "a seq/overlap hop value");
    }
    // `t` (cumulative onset) and `i` (hop-cycling index) are shared across
    // every step actually scheduled, including ones produced by a `for`
    // loop's repeated iterations — a loop is purely a way to generate a
    // run of steps, not a separate timeline.
    let t = 0, i = 0;
    function runOneStep(step) {
      const dur = hopArr ? hopArr[i % hopArr.length] : hopConst;
      if (!(dur > 0)) throw new Error("seq/overlap hop must be a positive number of seconds");
      if (step.type === "step-osc") {
        const v = compileExpr(step.node, env);
        v.startAt = (v.startAt || 0) + t;
        sink.push(v);
      } else if (step.type === "step-call") {
        runCall(step.name, step.args, env, sink, t);
      } else if (step.type === "step-expr") {
        const val = compileExpr(step.node, env);
        const freqs = Array.isArray(val) ? val : [val];
        if (freqs.length === 0) throw new Error("seq/overlap chord step cannot be an empty array");
        const amp = 0.6 / freqs.length;
        freqs.forEach(f => {
          if (isSignal(f) || Array.isArray(f)) {
            throw new Error('A bare seq/overlap step must be a frequency number or an array of frequencies — for a custom sound use "sin(...)"/"~(...)" or a defined name(...) call');
          }
          sink.push({ __signal: true, type: "osc", freq: f, amp, phase: 0, pan: 0, env: defaultStepEnv(dur), startAt: t });
        });
      }
      t += dur;
      i++;
    }
    function runSteps(steps) {
      for (const step of steps) {
        if (step.type === "step-for") {
          if (step.kind === "range") {
            const a = Math.round(coerceScalar(compileExpr(step.start, env), "a for-range bound"));
            const b = Math.round(coerceScalar(compileExpr(step.end, env), "a for-range bound"));
            for (let k = a; k <= b; k++) {
              env[step.varName] = k;
              runSteps(step.body);
            }
          } else {
            const arr = compileExpr(step.source, env);
            if (!Array.isArray(arr)) throw new Error('"for ' + step.varName + ' in ..." expects an array');
            for (const v of arr) {
              env[step.varName] = v;
              runSteps(step.body);
            }
          }
        } else {
          runOneStep(step);
        }
      }
    }
    runSteps(st.steps);
  }

  function run(stmts, env, sink) {
    for (const st of stmts) {
      if (st.type === "def") {
        continue; // already collected above; nothing to do at run time
      } else if (st.type === "let") {
        env[st.name] = compileExpr(st.value, env);
      } else if (st.type === "for") {
        if (st.kind === "range") {
          const a = Math.round(coerceScalar(compileExpr(st.start, env), "a for-range bound"));
          const b = Math.round(coerceScalar(compileExpr(st.end, env), "a for-range bound"));
          for (let i = a; i <= b; i++) {
            env[st.varName] = i;
            run(st.body, env, sink);
          }
        } else {
          const arr = compileExpr(st.source, env);
          if (!Array.isArray(arr)) throw new Error('"for ' + st.varName + ' in ..." expects an array');
          for (const v of arr) {
            env[st.varName] = v;
            run(st.body, env, sink);
          }
        }
      } else if (st.type === "osc") {
        sink.push(compileExpr(st, env));
      } else if (st.type === "call") {
        runCall(st.name, st.args, env, sink, 0);
      } else if (st.type === "seq") {
        runSeq(st, env, sink);
      }
    }
  }
  const topEnv = Object.create(null);
  run(program, topEnv, voices);
  // A top-level "let release = <seconds>" is a reserved convention, not new
  // grammar: if present, it's how long Stop/Run fades out whatever's
  // currently playing instead of cutting it instantly (see
  // src/worklet/voice.js's startRelease() and src/audio/engine.js). Attached
  // to the array rather than changing interpret()'s return shape, so every
  // existing caller/test that treats the result as a plain voices array
  // keeps working unchanged.
  voices.release = typeof topEnv.release === "number" ? topEnv.release : 0;
  return voices;
}

const _exports = { collectDefs, MAX_CALL_DEPTH, interpret };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
