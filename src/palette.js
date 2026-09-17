"use strict";

/* Mirrors the main site's palette switcher (anthonydifuria.github.io's
   js/palette.js + the body:has(#pal-*:checked) rules in retro-tui.css) so
   this page picks up whatever palette was last chosen there. sinentropy is
   served from the same origin (anthonydifuria.github.io), so localStorage
   is shared automatically -- this works when opened from the home-page
   iframe or the GitHub Pages URL directly. It has no effect on a different
   origin (e.g. the custom domain), where there is nothing to sync from.

   This page can ALSO set the palette directly, via the .pal-btn buttons
   rendered near the top (index.html / manual.html) -- same localStorage
   key, so a choice made here is picked up by the main site too, and vice
   versa (live, through the "storage" listener below). */

(function () {
  const KEY = "palette";

  const PALETTES = {
    "pal-contrast-dark": {
      "--bg": "#000", "--fg": "#fff", "--muted": "#e3e3e3",
      "--link": "#00ffff", "--accent": "#ffff00", "--border": "#6a6a6a",
      "--tok-class": "#00ffff", "--tok-param": "#ffff00"
    },
    "pal-contrast-light": {
      "--bg": "#fff", "--fg": "#000", "--muted": "#222",
      "--link": "#0033ff", "--accent": "#cc0000", "--border": "#000",
      "--tok-class": "#0033ff", "--tok-param": "#cc0000"
    },
    "pal-sepia": {
      "--bg": "#f4ecd8", "--fg": "#2a2a2a", "--muted": "#555",
      "--link": "#0645ad", "--accent": "#9b6b00", "--border": "#a48f6a",
      "--tok-class": "#0645ad", "--tok-param": "#9b6b00"
    },
    "pal-crt": {
      "--bg": "#020402", "--fg": "#a8ffb0", "--muted": "#6edb8a",
      "--link": "#00ff7f", "--accent": "#00ff9a", "--border": "#2a7a4f",
      "--tok-class": "#39ff14", "--tok-param": "#00ff7f"
    },
    "pal-by": {
      "--bg": "#0a0f1a", "--fg": "#f5f7fa", "--muted": "#d5dbe3",
      "--link": "#ffd300", "--accent": "#7aa6ff", "--border": "#2a3550",
      "--tok-class": "#ffd300", "--tok-param": "#7aa6ff"
    }
  };
  const VAR_NAMES = [
    "--bg", "--fg", "--muted", "--link", "--accent", "--border",
    "--tok-class", "--tok-param"
  ];

  function apply(id) {
    const root = document.documentElement.style;
    const vars = PALETTES[id];
    if (vars) {
      for (const name in vars) root.setProperty(name, vars[name]);
    } else {
      // "pal-default" or anything unrecognized: clear overrides, fall back
      // to the :root defaults already in style.css
      VAR_NAMES.forEach(name => root.removeProperty(name));
    }
    markActive(id);
  }

  function markActive(id) {
    const active = id && PALETTES.hasOwnProperty(id) ? id : "pal-default";
    document.querySelectorAll(".pal-btn").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.pal === active));
    });
  }

  function setPalette(id) {
    try { localStorage.setItem(KEY, id); } catch (e) {}
    apply(id);
  }

  function wireButtons() {
    document.querySelectorAll(".pal-btn").forEach(btn => {
      btn.addEventListener("click", () => setPalette(btn.dataset.pal));
    });
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    markActive(saved);
  }

  try {
    apply(localStorage.getItem(KEY));
  } catch (e) {}

  // Live sync: if the palette changes on another same-origin page/tab (e.g.
  // the main site, or this same app open in another tab) without this page
  // reloading, pick it up immediately.
  window.addEventListener("storage", function (ev) {
    if (ev.key === KEY) apply(ev.newValue);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireButtons);
  } else {
    wireButtons();
  }
})();
