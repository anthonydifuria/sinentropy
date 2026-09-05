(function () {
"use strict";
/* ============================================================
   compiler.js — AST -> number | array | signal-descriptor.

   A "signal" is anything that must be evaluated sample-by-sample at
   playback time because it depends on an oscillator somewhere inside it
   (directly, or nested arbitrarily deep as an FM/AM/PM/pan modulator).
   Plain arithmetic on plain numbers still collapses to a number here, at
   compile time — only expressions actually touching an oscillator turn
   into a signal-descriptor tree (a plain, structured-clone-safe object:
   {__signal:true, type:"osc"/"binop"/"neg", ...}) for the worklet's
   src/worklet/voice.js to reconstruct into real Sine/BinOp/Neg/Envelope
   instances on the other side of the postMessage boundary.
   ============================================================ */

function isSignal(v) { return !!v && typeof v === "object" && v.__signal === true; }

function coerceScalar(v, what) {
  if (isSignal(v)) throw new Error((what || "this value") + " must be a constant number, not an audio-rate signal");
  if (Array.isArray(v)) throw new Error((what || "this value") + " must be a number, not an array");
  return v;
}

function envPointsFromArgs(values) {
  // values = [v0, t1,v1, t2,v2, ...] -> cumulative-time (time,value) points
  const points = [{ time: 0, value: values[0] }];
  let t = 0;
  for (let k = 1; k < values.length; k += 2) {
    t += values[k];
    points.push({ time: t, value: values[k + 1] });
  }
  return points;
}

// Implicit envelope for a bare-frequency seq/overlap step: a short
// attack/release wrapped around a hold that fills exactly one hop, so
// plain notes in a sequence don't click and don't (by default) ring past
// their own slot — a full sin(...)/~(...) or name(...) step can still
// carry its own, longer envelope to deliberately spill into the next slot.
function defaultStepEnv(dur) {
  const atk = Math.min(0.008, dur / 4);
  const rel = Math.min(0.015, dur / 4);
  const hold = Math.max(atk, dur - rel);
  return [
    { time: 0, value: 0 },
    { time: atk, value: 1 },
    { time: hold, value: 1 },
    { time: dur, value: 0 },
  ];
}

function compileExpr(node, env) {
  switch (node.type) {
    case "num": return node.v;
    case "var": {
      if (!(node.name in env)) throw new Error('Unknown variable "' + node.name + '"');
      return env[node.name];
    }
    case "neg": {
      const v = compileExpr(node.node, env);
      if (Array.isArray(v)) throw new Error("Cannot negate an array");
      if (isSignal(v)) return { __signal: true, type: "neg", node: v };
      return -v;
    }
    case "array":
      return node.items.map(it => compileExpr(it, env));
    case "index": {
      const arr = compileExpr(node.array, env);
      if (!Array.isArray(arr)) throw new Error("Cannot index a non-array value");
      const idx = Math.round(coerceScalar(compileExpr(node.index, env), "an array index"));
      if (idx < 0 || idx >= arr.length) {
        throw new Error("Array index " + idx + " out of bounds (length " + arr.length + ")");
      }
      return arr[idx];
    }
    case "binop": {
      const l = compileExpr(node.left, env), r = compileExpr(node.right, env);
      if (Array.isArray(l) || Array.isArray(r)) throw new Error("Arithmetic on arrays is not supported");
      if (!isSignal(l) && !isSignal(r)) {
        switch (node.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return l / r;
        }
      }
      return { __signal: true, type: "binop", op: node.op, left: l, right: r };
    }
    case "rand": {
      // Drawn right now, once — never a signal, never re-drawn later (no
      // live randomness needed per-sample; a for-loop calling rand(...)
      // draws once per iteration simply because compileExpr runs once per
      // iteration).
      const label = node.kind === "int" ? "randi(...)" : "rand(...)";
      const min = coerceScalar(compileExpr(node.min, env), label + " min");
      const max = coerceScalar(compileExpr(node.max, env), label + " max");
      if (node.kind === "int") {
        const lo = Math.round(min), hi = Math.round(max);
        if (hi < lo) throw new Error("randi(min, max): max must be >= min");
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      }
      if (max < min) throw new Error("rand(min, max): max must be >= min");
      return min + Math.random() * (max - min);
    }
    case "osc": {
      const freq = compileExpr(node.freq, env);
      const amp = compileExpr(node.amp, env);
      const phase = compileExpr(node.phase, env);
      const pan = compileExpr(node.pan, env);
      for (const v of [freq, amp, phase, pan]) {
        if (Array.isArray(v)) throw new Error("An oscillator argument cannot be an array");
      }
      let envPoints = null;
      if (node.env) {
        const vals = node.env.map(n => coerceScalar(compileExpr(n, env), "an env(...) value"));
        envPoints = envPointsFromArgs(vals);
      }
      return { __signal: true, type: "osc", freq, amp, phase, pan, env: envPoints };
    }
  }
  throw new Error("Internal error: unknown node type " + node.type);
}

const _exports = { isSignal, coerceScalar, envPointsFromArgs, defaultStepEnv, compileExpr };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
