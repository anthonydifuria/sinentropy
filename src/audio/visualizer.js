(function () {
"use strict";
/* ============================================================
   visualizer.js — spectral entropy + spectrum/waveform draw. Reads
   whatever the shared AnalyserNode currently sees — both tracks' audio
   summed, since they share one master bus — independent of which
   track(s) are actually playing.
   ============================================================ */

let getAnalyser, getCtx, playbackState;
if (typeof module !== "undefined" && module.exports) {
  ({ getAnalyser, getCtx } = require("./engine.js"));
  ({ playbackState } = require("./playback-state.js"));
} else {
  ({ getAnalyser, getCtx, playbackState } = globalThis);
}

const entropyEl = document.getElementById("entropy");
const canvas = document.getElementById("spectrum");
const cctx = canvas.getContext("2d");
const waveCanvas = document.getElementById("waveform");
const wctx = waveCanvas.getContext("2d");

// Read the current palette's accent color live (instead of a hardcoded
// hex) so the spectrum bars and oscilloscope trace follow whatever palette
// is active -- same source of truth as everything else (see src/palette.js).
function accentColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  return v || "#ffa500";
}

function drawSpectrum(byteData) {
  const w = canvas.width, h = canvas.height;
  cctx.clearRect(0, 0, w, h);
  cctx.fillStyle = accentColor();
  const n = byteData.length;
  const barW = w / n;
  for (let i = 0; i < n; i++) {
    const v = byteData[i] / 255;
    const barH = v * h;
    cctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
  }
}

// Time-domain view (an oscilloscope) of the exact same summed signal the
// spectrum is computed from — same analyser, just read a different way
// (getByteTimeDomainData instead of getByteFrequencyData), so this costs no
// extra audio nodes either.
function drawWaveform(byteTimeData) {
  const w = waveCanvas.width, h = waveCanvas.height;
  wctx.clearRect(0, 0, w, h);
  wctx.strokeStyle = accentColor();
  wctx.lineWidth = 1.5;
  wctx.beginPath();
  const n = byteTimeData.length;
  const stepX = w / (n - 1);
  for (let i = 0; i < n; i++) {
    const v = byteTimeData[i] / 128 - 1; // -1..1
    const y = (0.5 - v * 0.5) * h;
    if (i === 0) wctx.moveTo(0, y);
    else wctx.lineTo(i * stepX, y);
  }
  wctx.stroke();
}

function entropyLoop() {
  const analyser = getAnalyser();
  const ctx = getCtx();
  if (!analyser) return;
  const bins = analyser.frequencyBinCount;
  const dbData = new Float32Array(bins);
  const byteData = new Uint8Array(bins);
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getFloatFrequencyData(dbData);
  analyser.getByteFrequencyData(byteData);
  analyser.getByteTimeDomainData(timeData);

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
  drawWaveform(timeData);

  // Keep drawing as long as EITHER track still has time left on its
  // estimated end — each track's own Run resets only its own entry, so one
  // track finishing (or being Stopped) never cuts the loop short while the
  // other is still playing.
  if (ctx && ctx.currentTime < Math.max(playbackState.stopAtLoopEnd.A, playbackState.stopAtLoopEnd.B)) {
    playbackState.rafId = requestAnimationFrame(entropyLoop);
  } else {
    playbackState.rafId = null;
  }
}

const _exports = { entropyLoop, drawSpectrum, drawWaveform };
if (typeof module !== "undefined" && module.exports) module.exports = _exports;
else Object.assign(globalThis, _exports);
})();
