(function () {
"use strict";
/* ============================================================
   tokenizer.js — turns sinentropy source text into a flat token list.

   SIN/ENV/SEQ are each one token with two spellings: sin/~, env/^,
   seq/overlap. isSinTok/isEnvTok/isSeqTok are the single place that
   knows both spellings of each — everything downstream (parser) just
   calls these instead of comparing strings itself.
   ============================================================ */

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
    if ("(){}[],+-*/=~^".includes(c)) { tokens.push({ t: c }); i++; continue; }
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

// SIN and ENV are each two spellings of the same token: sin/~ and env/^.
function isSinTok(tok) { return !!tok && (tok.t === "~" || (tok.t === "id" && tok.v === "sin")); }
function isEnvTok(tok) { return !!tok && (tok.t === "^" || (tok.t === "id" && tok.v === "env")); }
// SEQ is each two spellings of the same token: seq/overlap.
function isSeqTok(tok) { return !!tok && tok.t === "id" && (tok.v === "seq" || tok.v === "overlap"); }

const _exports = { tokenize, isSinTok, isEnvTok, isSeqTok };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
