(function () {
"use strict";
/* ============================================================
   ui.js — two independent tracks (A/B), each with its own editor,
   status line, Run/Stop buttons and easter-egg trigger — but sharing one
   AudioContext, one master gain and one analyser, so both tracks' audio
   is summed and visualized together (see src/audio/engine.js and
   src/audio/visualizer.js).
   ============================================================ */
function wireTrack(track, ids) {
  const codeEl = document.getElementById(ids.code);
  const statusEl = document.getElementById(ids.status);
  const runBtn = document.getElementById(ids.run);
  const stopBtn = document.getElementById(ids.stop);

  runBtn.addEventListener("click", async () => {
    statusEl.textContent = "";
    let voices;
    try {
      const program = parseProgram(codeEl.value);
      voices = interpret(program);
      if (voices.length === 0) throw new Error("Program produced no sin(...)/~(...) voices");
    } catch (err) {
      statusEl.textContent = err.message;
      return;
    }
    try {
      const endTime = await playVoices(voices, track);
      playbackState.stopAtLoopEnd[track] = endTime;
      if (!playbackState.rafId) playbackState.rafId = requestAnimationFrame(entropyLoop);
    } catch (err) {
      statusEl.textContent = "Audio engine error: " + err.message;
    }
  });

  stopBtn.addEventListener("click", () => {
    const releaseSeconds = stopTrack(track);
    const ctx = getCtx();
    // No "let release" in effect: instant cut, same as before. With one in
    // effect: keep the visualizer animating through the fade instead of
    // stopping it right as the sound is still trailing off.
    playbackState.stopAtLoopEnd[track] = releaseSeconds > 0 && ctx ? ctx.currentTime + releaseSeconds : 0;
    if (playbackState.stopAtLoopEnd[track] > 0 && !playbackState.rafId) {
      playbackState.rafId = requestAnimationFrame(entropyLoop);
    }
    if (playbackState.rafId && ctx && ctx.currentTime >= Math.max(playbackState.stopAtLoopEnd.A, playbackState.stopAtLoopEnd.B)) {
      cancelAnimationFrame(playbackState.rafId);
      playbackState.rafId = null;
    }
  });

  // Easter egg: typing "~~" anywhere in this track's code vanishes it and
  // runs THIS track's program immediately, as if you'd pressed its own Run
  // button; typing "!!" does the same for Stop.
  const TRIGGERS = [
    { text: "~~", fire: () => runBtn.click() },
    { text: "!!", fire: () => stopBtn.click() },
  ];
  codeEl.addEventListener("input", () => {
    const pos = codeEl.selectionStart;
    for (const trig of TRIGGERS) {
      const len = trig.text.length;
      if (codeEl.value.slice(Math.max(0, pos - len), pos) === trig.text) {
        codeEl.value = codeEl.value.slice(0, pos - len) + codeEl.value.slice(pos);
        codeEl.selectionStart = codeEl.selectionEnd = pos - len;
        trig.fire();
        return;
      }
    }
  });
}

wireTrack("A", { code: "code", status: "status", run: "run", stop: "stop" });
wireTrack("B", { code: "code2", status: "status2", run: "run2", stop: "stop2" });
})();
