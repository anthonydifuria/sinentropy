(function () {
"use strict";
/* ============================================================
   parser.js — recursive-descent parser: token list -> AST.

   Grammar (language v7 — same language as before, just split across
   files; see interpreter.js for the seq/overlap + for-loop semantics):

     program   := statement*
     statement := letStmt | forStmt | oscExpr | defStmt | callStmt | seqStmt
     letStmt   := "let" IDENT "=" (arrayLit | expr)
     forStmt   := "for" IDENT "in" (expr ".." expr | expr) "{" statement* "}"
     oscExpr   := SIN "(" expr "," expr "," expr ("," expr)? ")"
                  ("*" ENV "(" expr ("," expr)+ ")")?
                  -- SIN is "sin" or "~", ENV is "env" or "^" (same token, two spellings)
                  -- sin(freq, amp, phase[, pan]); env(v0, t1,v1, t2,v2, ...) is now OPTIONAL
                  -- pan: -1 (left) .. 0 (center) .. 1 (right), defaults to 0
                  -- freq/amp/phase/pan can each be a plain expression OR another
                     oscExpr, nested to any depth (FM/AM/PM/pan-modulation)
     defStmt   := IDENT "(" (IDENT ("," IDENT)*)? ")" "_" "{" statement* "}"
                  -- defines a reusable, parametric sound: e.g. gianni(f) { ... }.
                     Pure substitution (no closures) — only visible at the top
                     level of the program, so a def written inside a for-loop
                     or another def's body is never registered. May call
                     itself or another def (recursion is capped, see below).
     callStmt  := IDENT "(" (expr ("," expr)*)? ")"
                  -- plays a previously def'd sound; every osc(...) it
                     contains fires together as one event. Recursion is
                     capped at 64 nested calls to fail loudly instead of
                     freezing the audio thread.
     seqStmt   := SEQ "(" (expr) ")" "{" seqStep* "}"
                  -- SEQ is "seq" or "overlap" (same token, two spellings).
                     The parenthesized expr is the "hop": either one number
                     (constant seconds between step onsets) or an array of
                     numbers (a rhythmic pattern, cycled if there are more
                     steps than hop values). Each step fires at its own
                     scheduled, sample-accurate start time — a plain
                     sin(...)/~(...) or a name(...) call keeps whatever
                     envelope duration it already has, so if that duration
                     outlasts the hop the note rings into the next one
                     (this is what turns "seq" into "overlap": one
                     mechanism for both ordinary sequencing and granular,
                     overlapping textures, depending only on hop vs.
                     envelope length).
     seqStep   := oscExpr | callStmt | seqForStmt | expr
                  -- a bare expr must resolve to a frequency (number) or an
                     array of frequencies (a chord fired together) — only
                     frequencies, never note names. It gets an implicit
                     short attack/release envelope lasting exactly one hop.
                     A defStmt is not allowed inside a seq/overlap block.
     seqForStmt := "for" IDENT "in" (expr ".." expr | expr) "{" seqStep* "}"
                  -- generates a run of steps, one per loop iteration, each
                     still consuming its own onset (and its own place in a
                     cycled hop array) in the surrounding seq/overlap — the
                     loop is only a way to write many steps compactly, not
                     a separate timeline. Nests to any depth.
     expr      := term (("+"|"-") term)*
     term      := factor (("*"|"/") factor)*
     factor    := "-" factor | primary
     primary   := primaryBase ("[" expr "]")*
     primaryBase := NUMBER | IDENT | "(" expr ")" | arrayLit | oscExpr | randExpr
     randExpr  := ("rand"|"randi") "(" expr "," expr ")"
                  -- a fresh random number, drawn right when this line is
                     evaluated (so a rand(...) written inside a for-loop
                     body draws a new one every iteration). rand(min,max)
                     is a float uniformly in [min,max]; randi(min,max) is
                     an integer, both ends inclusive (rounded if min/max
                     aren't already whole numbers). Not a reusable RNG
                     seed/state — every call is an independent draw.
     arrayLit  := "[" (expr ("," expr)*)? "]"
   arr[i] indexes into an array, 0-based.
   ============================================================ */

let tokenize, isSinTok, isEnvTok, isSeqTok;
if (typeof module !== "undefined" && module.exports) {
  ({ tokenize, isSinTok, isEnvTok, isSeqTok } = require("./tokenizer.js"));
} else {
  ({ tokenize, isSinTok, isEnvTok, isSeqTok } = globalThis);
}

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

  // ---- expressions ----
  function primary() {
    let node = primaryBase();
    while (peek() && peek().t === "[") {
      next();
      const idx = expr();
      expect("]");
      node = { type: "index", array: node, index: idx };
    }
    return node;
  }
  function primaryBase() {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of input");
    if (isSinTok(tok)) return oscExpr();
    if (tok.t === "id" && (tok.v === "rand" || tok.v === "randi") && peek(1) && peek(1).t === "(") {
      const kind = tok.v === "randi" ? "int" : "float";
      next(); // consume "rand"/"randi"
      const args = argList(2);
      if (args.length !== 2) throw new Error(tok.v + "(min, max) takes exactly 2 arguments");
      return { type: "rand", kind, min: args[0], max: args[1] };
    }
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

  // ---- sin(...)  [* env(...)]  ----
  function argList(minCount) {
    expect("(");
    const args = [];
    if (peek() && peek().t !== ")") {
      args.push(expr());
      while (peek() && peek().t === ",") { next(); args.push(expr()); }
    }
    expect(")");
    if (args.length < minCount) throw new Error("Expected at least " + minCount + " argument(s)");
    return args;
  }
  function oscExpr() {
    next(); // consume "sin"/"~"
    const sinArgs = argList(3);
    if (sinArgs.length < 3 || sinArgs.length > 4) {
      throw new Error("sin(freq, amp, phase[, pan]) takes 3 or 4 arguments");
    }
    let envPoints = null;
    // Only consume "*" here if it's followed by env/^ — otherwise it belongs
    // to an enclosing multiplication (e.g. sin(...) * 2) and must bubble up.
    if (peek() && peek().t === "*" && isEnvTok(peek(1))) {
      next(); // "*"
      next(); // "env"/"^"
      const envArgs = argList(3);
      if (envArgs.length % 2 !== 1) {
        throw new Error("env(v0, t1,v1, t2,v2, ...) needs a starting value followed by (time, value) pairs");
      }
      envPoints = envArgs;
    }
    return {
      type: "osc",
      freq: sinArgs[0],
      amp: sinArgs[1],
      phase: sinArgs[2],
      pan: sinArgs.length === 4 ? sinArgs[3] : { type: "num", v: 0 },
      env: envPoints, // raw expr nodes, or null — resolved to numbers at compile time
    };
  }

  // ---- name(...)  either a definition  name(params)_{ body }
  //                 or a call            name(args)
  function nameStmt() {
    const name = next().v; // id
    const args = argList(0);
    if (peek() && peek().t === "id" && peek().v === "_") {
      next(); // consume "_"
      const seen = new Set();
      const params = args.map(a => {
        if (a.type !== "var") {
          throw new Error('Definition parameters must be plain names, e.g. "' + name + '(f, a, p)_{ ... }"');
        }
        if (seen.has(a.name)) throw new Error('Duplicate parameter name "' + a.name + '" in definition of "' + name + '"');
        seen.add(a.name);
        return a.name;
      });
      const body = block();
      return { type: "def", name, params, body };
    }
    return { type: "call", name, args };
  }

  // ---- seq(hop) { step step ... }  /  overlap(hop) { ... } ----
  function seqStep() {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of input inside seq/overlap block");
    if (tok.t === "for") return seqForStep();
    if (isSinTok(tok)) return { type: "step-osc", node: oscExpr() };
    if (tok.t === "id" && peek(1) && peek(1).t === "(") {
      const name = next().v;
      const args = argList(0);
      if (peek() && peek().t === "id" && peek().v === "_") {
        throw new Error('Cannot write a definition ("' + name + '(...)_{ ... }") inside a seq/overlap block — definitions must be at the top level of the program');
      }
      return { type: "step-call", name, args };
    }
    return { type: "step-expr", node: expr() };
  }
  // A "for" inside a seq/overlap block repeats a group of steps, one loop
  // iteration at a time, each of its steps still consuming its own onset
  // slot (and its own place in a cycled hop array) in the surrounding
  // sequence — so `for i in 1..8 { i*220 }` inside a seq(...) schedules 8
  // steps in a row, not one. Nests to any depth; a defStmt is still not
  // allowed here (seqStep() rejects it inside the loop body too).
  function seqStepsUntilBrace() {
    const steps = [];
    while (peek() && peek().t !== "}") {
      steps.push(seqStep());
      if (peek() && peek().t === ",") next(); // optional separator, purely cosmetic
    }
    return steps;
  }
  function seqForStep() {
    expect("for");
    const varName = expect("id").v;
    expect("in");
    const start = expr();
    let node;
    if (peek() && peek().t === "..") {
      next();
      const end = expr();
      expect("{");
      const body = seqStepsUntilBrace();
      expect("}");
      node = { type: "step-for", varName, kind: "range", start, end, body };
    } else {
      expect("{");
      const body = seqStepsUntilBrace();
      expect("}");
      node = { type: "step-for", varName, kind: "array", source: start, body };
    }
    return node;
  }
  function seqStmt() {
    next(); // consume "seq"/"overlap"
    expect("(");
    const hop = expr();
    expect(")");
    expect("{");
    const steps = seqStepsUntilBrace();
    expect("}");
    if (steps.length === 0) throw new Error("seq/overlap needs at least one step");
    return { type: "seq", hop, steps };
  }

  // ---- statements ----
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
      // oscillator term sums into the output whether or not it's
      // separated from the next one by a "+".
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
    if (isSinTok(tok)) return oscExpr();
    if (isSeqTok(tok)) return seqStmt();
    if (tok.t === "id" && peek(1) && peek(1).t === "(") return nameStmt();
    throw new Error("Expected a statement (let / for / sin(...) / ~(...) / name(...) / seq(...) / overlap(...)) but found " + describe(tok));
  }

  const program = statementSeq(undefined);
  return program;
}

const _exports = { parseProgram };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
