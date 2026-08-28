"use strict";

/* =========================================================
   sinentropy — language v2
   Grammar:
     program   := statement*
     statement := letStmt | forStmt | termStmt
     letStmt   := "let" IDENT "=" (arrayLit | expr)
     forStmt   := "for" IDENT "in" (expr ".." expr | expr) "{" statement* "}"
     termStmt  := "sin" "(" expr "," expr "," expr ("," expr)? ")" "*"
                  "env" "(" expr ("," expr)+ ")"
                  -- sin(freq, amp, phase[, pan]); env(v0, t1,v1, t2,v2, ...)
                  -- pan: -1 (left) .. 0 (center) .. 1 (right), defaults to 0
     expr      := term (("+"|"-") term)*
     term      := factor (("*"|"/") factor)*
     factor    := "-" factor | primary
     primary   := NUMBER | IDENT | "(" expr ")" | arrayLit
     arrayLit  := "[" (expr ("," expr)*)? "]"
   Everything runs at audio rate: freq/amp/phase are baked into real
   OscillatorNode/AudioParam automation, no separate control rate.
   ========================================================= */

/* ---------- tokenizer ---------- */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const isDigit = c => c >= "0" && c <= "9";
  const isAlpha = c => /[A-Za-z_]/.test(c);
  const KEYWORDS = new Set(["let", "for", "in"]);
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; } // comments
    if (c === "." && src[i + 1] === ".") { tokens.push({ t: ".." }); i += 2; continue; }
    if ("(){}[],+-*/=".includes(c)) { tokens.push({ t: c }); i++; continue; }
    if (isDigit(c)) {
      let j = i + 1;
      while (j < src.length && isDigit(src[j])) j++;
      if (src[j] === "." && isDigit(src[j + 1])) {
        j++;
        while (j < src.length && isDigit(src[j])) j++;
      }
      tokens.push({ t: "num", v: parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push(KEYWORDS.has(word) ? { t: word } : { t: "id", v: word });
      i = j; continue;
    }
    throw new Error('Unexpected character "' + c + '" at position ' + i);
  }
  return tokens;
}

/* ---------- parser: produces an AST ---------- */
function parseProgram(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (k = 0) => tokens[pos + k];
  const next = () => tokens[pos++];
  const describe = tok => {
    if (!tok) return "end of input";
    return tok.t === "num" || tok.t === "id" ? String(tok.v) : '"' + tok.t + '"';
  };
  function expect(t) {
    const tok = next();
    if (!tok || tok.t !== t) throw new Error('Expected "' + t + '" but found ' + describe(tok));
    return tok;
  }
  function expectId(name) {
    const tok = next();
    if (!tok || tok.t !== "id" || tok.v !== name) {
      throw new Error('Expected "' + name + '" but found ' + describe(tok));
    }
    return tok;
  }

  // ---- expressions ----
  function primary() {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of input");
    if (tok.t === "num") { next(); return { type: "num", v: tok.v }; }
    if (tok.t === "id") { next(); return { type: "var", name: tok.v }; }
    if (tok.t === "(") { next(); const e = expr(); expect(")"); return e; }
    if (tok.t === "[") return arrayLit();
    throw new Error("Unexpected " + describe(tok) + " in expression");
  }
  function arrayLit() {
    expect("[");
    const items = [];
    if (peek() && peek().t !== "]") {
      items.push(expr());
      while (peek() && peek().t === ",") { next(); items.push(expr()); }
    }
    expect("]");
    return { type: "array", items };
  }
  function factor() {
    if (peek() && peek().t === "-") { next(); return { type: "neg", node: factor() }; }
    return primary();
  }
  function term() {
    let node = factor();
    while (peek() && (peek().t === "*" || peek().t === "/")) {
      const op = next().t;
      node = { type: "binop", op, left: node, right: factor() };
    }
    return node;
  }
  function expr() {
    let node = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = next().t;
      node = { type: "binop", op, left: node, right: term() };
    }
    return node;
  }

  // ---- statements ----
  function argList(minCount) {
    expect("(");
    const args = [expr()];
    while (peek() && peek().t === ",") { next(); args.push(expr()); }
    expect(")");
    if (args.length < minCount) throw new Error("Expected at least " + minCount + " argument(s)");
    return args;
  }
  function termStmt() {
    expectId("sin");
    const sinArgs = argList(3);
    if (sinArgs.length < 3 || sinArgs.length > 4) {
      throw new Error("sin(freq, amp, phase[, pan]) takes 3 or 4 arguments");
    }
    expect("*");
    expectId("env");
    const envArgs = argList(3);
    if (envArgs.length % 2 !== 1) {
      throw new Error("env(v0, t1,v1, t2,v2, ...) needs a starting value followed by (time, value) pairs");
    }
    return { type: "term", sin: sinArgs, env: envArgs };
  }
  function letStmt() {
    expect("let");
    const name = expect("id").v;
    expect("=");
    const value = peek() && peek().t === "[" ? arrayLit() : expr();
    return { type: "let", name, value };
  }
  function forStmt() {
    expect("for");
    const varName = expect("id").v;
    expect("in");
    const start = expr();
    let node;
    if (peek() && peek().t === "..") {
      next();
      const end = expr();
      node = { type: "for", varName, kind: "range", start, end, body: block() };
    } else {
      node = { type: "for", varName, kind: "array", source: start, body: block() };
    }
    return node;
  }
  function statementSeq(stopType) {
    const stmts = [];
    while (peek() && peek().t !== stopType) {
      stmts.push(statement());
      // "+" between statements is optional, purely cosmetic: every
      // sin(...)*env(...) term sums into the output whether or not
      // it's separated from the next one by a "+".
      if (peek() && peek().t === "+") next();
    }
    return stmts;
  }
  function block() {
    expect("{");
    const stmts = statementSeq("}");
    expect("}");
    return stmts;
  }
  function statement() {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of input");
    if (tok.t === "let") return letStmt();
    if (tok.t === "for") return forStmt();
    if (tok.t === "id" && tok.v === "sin") return termStmt();
    throw new Error("Expected a statement (let / for / sin(...)) but found " + describe(tok));
  }

  const program = statementSeq(undefined);
  return program;
}

/* ---------- interpreter ---------- */
function evalExpr(node, env) {
  switch (node.type) {
    case "num": return node.v;
    case "var": {
      if (!(node.name in env)) throw new Error('Unknown variable "' + node.name + '"');
      return env[node.name];
    }
    case "neg": {
      const v = evalExpr(node.node, env);
      if (Array.isArray(v)) throw new Error("Cannot negate an array");
      return -v;
    }
    case "array":
      return node.items.map(it => evalExpr(it, env));
    case "binop": {
      const l = evalExpr(node.left, env), r = evalExpr(node.right, env);
      if (Array.isArray(l) || Array.isArray(r)) throw new Error("Arithmetic on arrays is not supported");
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
      }
    }
  }
  throw new Error("Internal error: unknown node type " + node.type);
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

function interpret(program) {
  const env = Object.create(null);
  const voices = [];

  function run(stmts) {
    for (const st of stmts) {
      if (st.type === "let") {
        env[st.name] = evalExpr(st.value, env);
      } else if (st.type === "for") {
        if (st.kind === "range") {
          const a = Math.round(evalExpr(st.start, env));
          const b = Math.round(evalExpr(st.end, env));
          for (let i = a; i <= b; i++) {
            env[st.varName] = i;
            run(st.body);
          }
        } else {
          const arr = evalExpr(st.source, env);
          if (!Array.isArray(arr)) throw new Error('"for ' + st.varName + ' in ..." expects an array');
          for (const v of arr) {
            env[st.varName] = v;
            run(st.body);
          }
        }
      } else if (st.type === "term") {
        const freq = evalExpr(st.sin[0], env);
        const amp = evalExpr(st.sin[1], env);
        const phase = evalExpr(st.sin[2], env);
        const pan = st.sin.length === 4 ? evalExpr(st.sin[3], env) : 0;
        const envValues = st.env.map(n => evalExpr(n, env));
        voices.push({ freq, amp, phase, pan, points: envPointsFromArgs(envValues) });
      }
    }
  }
  run(program);
  return voices;
}

/* ---------- audio engine ---------- */
let ctx = null, master = null, analyser = null;
let activeNodes = [];
let rafId = null;
let stopAtLoopEnd = 0;

function ensureCtx() {
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
}

function stopAll() {
  activeNodes.forEach(n => { try { n.stop(); } catch (e) {} });
  activeNodes = [];
}

const TWO_PI = 2 * Math.PI;

function playVoices(voices) {
  ensureCtx();
  stopAll();
  const now = ctx.currentTime;
  let maxEnd = now;
  voices.forEach(({ freq, amp, phase, pan, points }) => {
    const f = Math.max(1, freq);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;

    // A steady sinusoid's phase offset is equivalent to a small start-time
    // delay: sin(2*pi*f*t + phase) === sin(2*pi*f*(t + phase/(2*pi*f)))
    const normPhase = ((phase % TWO_PI) + TWO_PI) % TWO_PI;
    const phaseDelay = normPhase / (TWO_PI * f);

    const gain = ctx.createGain();
    const g = gain.gain;
    const startAt = now + phaseDelay;
    g.setValueAtTime(points[0].value * amp, startAt);
    for (let i = 1; i < points.length; i++) {
      g.linearRampToValueAtTime(points[i].value * amp, startAt + points[i].time);
    }

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan || 0));

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(master);

    const endTime = startAt + points[points.length - 1].time + 0.05;
    osc.start(startAt);
    osc.stop(endTime);
    activeNodes.push(osc);
    maxEnd = Math.max(maxEnd, endTime);
  });
  return maxEnd;
}

/* ---------- spectral entropy + spectrum draw ---------- */
const entropyEl = document.getElementById("entropy");
const canvas = document.getElementById("spectrum");
const cctx = canvas.getContext("2d");

function drawSpectrum(byteData) {
  const w = canvas.width, h = canvas.height;
  cctx.clearRect(0, 0, w, h);
  cctx.fillStyle = "#ffa500";
  const n = byteData.length;
  const barW = w / n;
  for (let i = 0; i < n; i++) {
    const v = byteData[i] / 255;
    const barH = v * h;
    cctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
  }
}

function entropyLoop() {
  if (!analyser) return;
  const bins = analyser.frequencyBinCount;
  const dbData = new Float32Array(bins);
  const byteData = new Uint8Array(bins);
  analyser.getFloatFrequencyData(dbData);
  analyser.getByteFrequencyData(byteData);

  const floor = analyser.minDecibels;
  let sum = 0;
  const mags = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    const db = Number.isFinite(dbData[i]) ? dbData[i] : floor;
    const lin = Math.pow(10, db / 20);
    mags[i] = lin;
    sum += lin;
  }
  let H = 0;
  if (sum > 0) {
    for (let i = 0; i < bins; i++) {
      const p = mags[i] / sum;
      if (p > 0) H -= p * Math.log2(p);
    }
  }
  const maxH = Math.log2(bins);
  const normH = maxH > 0 ? H / maxH : 0;
  entropyEl.textContent = normH.toFixed(4);
  drawSpectrum(byteData);

  if (ctx && ctx.currentTime < stopAtLoopEnd) {
    rafId = requestAnimationFrame(entropyLoop);
  } else {
    rafId = null;
  }
}

/* ---------- UI wiring ---------- */
const codeEl = document.getElementById("code");
const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
const stopBtn = document.getElementById("stop");

runBtn.addEventListener("click", () => {
  statusEl.textContent = "";
  let voices;
  try {
    const program = parseProgram(codeEl.value);
    voices = interpret(program);
    if (voices.length === 0) throw new Error("Program produced no sin(...) * env(...) voices");
  } catch (err) {
    statusEl.textContent = err.message;
    return;
  }
  const endTime = playVoices(voices);
  stopAtLoopEnd = endTime;
  if (!rafId) rafId = requestAnimationFrame(entropyLoop);
});

stopBtn.addEventListener("click", () => {
  stopAll();
  stopAtLoopEnd = 0;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
});
