"use strict";
/* ============================================================
   highlight.js — live syntax highlighting for the Track A/B editors.

   Stacks a transparent-text <textarea> over a colored <pre><code> and
   re-tokenizes on every input, so the native caret/selection keep working
   while the visible text is colored. Colors come entirely from the site's
   palette variables (--muted/--link/--tok-class/--tok-param/--fg), via the
   .tok-* classes in style.css, so this follows whatever palette is active
   with no extra wiring.

   This is a SEPARATE, more lenient tokenizer than src/lang/tokenizer.js: it
   must never throw (the user is mid-keystroke most of the time) and it has
   to preserve every character -- whitespace, newlines, comments -- so the
   colored text can be reassembled 1:1 with what's in the textarea.
   ============================================================ */
(function () {
  const CLASS_WORDS = new Set(["sin", "env", "seq", "overlap"]);
  const KEYWORDS = new Set(["let", "for", "in"]);

  function tokenizeForHighlight(src) {
    const out = [];
    let i = 0;
    const isDigit = c => c >= "0" && c <= "9";
    const isAlpha = c => /[A-Za-z_]/.test(c);
    const push = (cls, text) => out.push({ cls, text });

    while (i < src.length) {
      const c = src[i];

      if (c === "\n") { push(null, "\n"); i++; continue; }
      if (c === " " || c === "\t" || c === "\r") {
        let j = i + 1;
        while (j < src.length && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++;
        push(null, src.slice(i, j)); i = j; continue;
      }
      if (c === "#") {
        let j = i;
        while (j < src.length && src[j] !== "\n") j++;
        push("tok-com", src.slice(i, j)); i = j; continue;
      }
      if (c === "." && src[i + 1] === ".") { push("tok-op", ".."); i += 2; continue; }
      // ~ and ^ are spelling-aliases of sin/env (see isSinTok/isEnvTok in
      // src/lang/tokenizer.js) -- same "class" color as the word forms.
      if (c === "~" || c === "^") { push("tok-class", c); i++; continue; }
      if ("(){}[],+-*/=".includes(c)) { push("tok-op", c); i++; continue; }
      if (isDigit(c)) {
        let j = i + 1;
        while (j < src.length && isDigit(src[j])) j++;
        if (src[j] === "." && isDigit(src[j + 1])) {
          j++;
          while (j < src.length && isDigit(src[j])) j++;
        }
        push("tok-num", src.slice(i, j)); i = j; continue;
      }
      if (isAlpha(c)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        const word = src.slice(i, j);
        if (CLASS_WORDS.has(word)) push("tok-class", word);
        else if (KEYWORDS.has(word)) push("tok-kw", word);
        else push("tok-id", word);
        i = j; continue;
      }
      // Anything else (mid-typing, a stray character): pass through
      // unstyled rather than throwing, one character at a time.
      push(null, c); i++;
    }
    return out;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render(src) {
    let html = "";
    for (const tok of tokenizeForHighlight(src)) {
      const esc = escapeHtml(tok.text);
      html += tok.cls ? '<span class="' + tok.cls + '">' + esc + "</span>" : esc;
    }
    // A <pre> can collapse the height of a final trailing blank line
    // relative to the textarea -- pad it so the two stay in sync.
    if (src.length === 0 || src[src.length - 1] === "\n") html += "​";
    return html;
  }

  const wired = new WeakMap(); // textarea -> <pre>

  function refresh(codeEl) {
    const pre = wired.get(codeEl);
    if (pre) pre.querySelector("code").innerHTML = render(codeEl.value);
  }

  function wire(codeEl, preEl) {
    wired.set(codeEl, preEl);
    refresh(codeEl);
    codeEl.addEventListener("input", () => refresh(codeEl));
    codeEl.addEventListener("scroll", () => {
      preEl.scrollTop = codeEl.scrollTop;
      preEl.scrollLeft = codeEl.scrollLeft;
    });
  }

  function init() {
    document.querySelectorAll(".code-wrap").forEach(wrap => {
      const codeEl = wrap.querySelector("textarea.code-input");
      const preEl = wrap.querySelector(".code-highlight");
      if (codeEl && preEl) wire(codeEl, preEl);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // src/ui.js calls this directly after it splices "~~"/"!!" out of a
  // textarea's value programmatically (that doesn't fire a native "input"
  // event, so the overlay would otherwise go stale until the next keystroke).
  window.sinHighlight = { refresh };
})();
