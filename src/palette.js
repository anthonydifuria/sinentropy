"use strict";

/* Mirrors the main site's palette switcher (anthonydifuria.github.io's
   js/palette.js + the body:has(#pal-*:checked) rules in retro-tui.css) so
   this page picks up whatever palette was last chosen there. sinentropy is
   served from the same origin (anthonydifuria.github.io), so localStorage
   is shared automatically -- this works when opened from the home-page
   iframe or the GitHub Pages URL directly. It has no effect on a different
   origin (e.g. the custom domain), where there is nothing to sync from. */

(function () {
  const KEY = "palette";

  const PALETTES = {
    "pal-contrast-dark": {
      "--bg": "#000", "--fg": "#fff", "--muted": "#e3e3e3",
      "--link": "#00ffff", "--accent": "#ffff00", "--border": "#6a6a6a"
    },
    "pal-contrast-light": {
      "--bg": "#fff", "--fg": "#000", "--muted": "#222",
      "--link": "#0033ff", "--accent": "#cc0000", "--border": "#000"
    },
    "pal-sepia": {
      "--bg": "#f4ecd8", "--fg": "#2a2a2a", "--muted": "#555",
      "--link": "#0645ad", "--accent": "#9b6b00", "--border": "#a48f6a"
    },
    "pal-crt": {
      "--bg": "#020402", "--fg": "#a8ffb0", "--muted": "#6edb8a",
      "--link": "#00ff7f", "--accent": "#00ff9a", "--border": "#2a7a4f"
    },
    "pal-by": {
      "--bg": "#0a0f1a", "--fg": "#f5f7fa", "--muted": "#d5dbe3",
      "--link": "#ffd300", "--accent": "#7aa6ff", "--border": "#2a3550"
    }
  };
  const VAR_NAMES = ["--bg", "--fg", "--muted", "--link", "--accent", "--border"];

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
  }

  try {
    apply(localStorage.getItem(KEY));
  } catch (e) {}

  // Live sync: if the palette changes on another same-origin page/tab (e.g.
  // the main site, while this page sits in its home-page iframe) without
  // this page reloading, pick it up immediately.
  window.addEventListener("storage", function (ev) {
    if (ev.key === KEY) apply(ev.newValue);
  });
})();
