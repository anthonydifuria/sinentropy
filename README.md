# sinentropy

A tiny language for additive synthesis: sum oscillators shaped by
Csound-style `linseg` envelopes, built with arrays and `for` loops, and
watch the spectral entropy of the result update live in the browser.

Try it live on [anthonydifuria.github.io](https://anthonydifuria.github.io) &mdash;
or open `index.html` here directly (via a local server, or GitHub Pages).
The full manual, with an example for every feature, is `manual.html`
(also linked from the `[ Manual ]` button on the page itself).

## Grammar

```
sin(freq, amp, phase[, pan]) [* env(v0, t1,v1, t2,v2, ...)]
```

- `sin(freq, amp, phase, pan)` &mdash; frequency in Hz, amplitude, phase in
  radians, pan from `-1` (left) to `1` (right); `pan` is optional and
  defaults to `0` (center). Can also be spelled `~(...)`.
- `env(v0, t1,v1, t2,v2, ...)` &mdash; a Csound `linseg`-style envelope: a
  starting value followed by any number of (time, value) pairs, all times
  in seconds. Can also be spelled `^(...)`. **Optional**: `sin(...)` on its
  own sustains at a constant amplitude until you press Stop.
- `sin`/`~` and `env`/`^` are two spellings of the same token &mdash; use
  whichever reads better in the moment.
- any of `freq`, `amp`, `phase`, `pan` can be another `sin(...)`/`~(...)`
  instead of a plain number &mdash; that nested oscillator becomes a true
  audio-rate signal driving the parameter (FM / AM / PM / pan modulation),
  nestable to any depth. Numbers and signals can also be mixed with
  `+ - * /`, e.g. `sin(220 + sin(5,50,0), 1, 0)`.
- terms sum automatically; `+` between them is optional, purely cosmetic
- `name(params)_{ ... }` &mdash; defines a reusable, named sound: pure
  substitution (no closures), e.g. `gianni(f)_{ sin(f,1,0) * env(0,0.05,1,0.2,0) }`.
  Only definitions written at the top level of the program are registered
  (one inside a `for` loop or another definition's body is silently
  ignored), so a definition can be called before or after it appears in the
  file, and it may call itself or another definition (recursion is capped
  at 64 nested calls, to fail loudly instead of freezing the audio thread).
- `name(args)` &mdash; calls a previously defined sound; every `sin(...)`/`~(...)`
  it contains fires together as one event, e.g. `gianni(220)`
- `seq(hop) { step step ... }` / `overlap(hop) { ... }` &mdash; a sequencer:
  fires each step at its own sample-accurate scheduled onset. `seq` and
  `overlap` are two spellings of the same construct &mdash; `hop` is either
  one number (a constant number of seconds between onsets) or an array of
  numbers (a rhythmic pattern, cycled if there are more steps than hop
  values, e.g. `seq([0.2,0.2,0.4]) { ... }`). A step can be:
  a bare frequency number or arithmetic expression (`220`, `base*1.5`); an
  array of frequencies fired together as a chord (`[220,277,330]`); a full
  `sin(...)`/`~(...)` term, envelope and all; or a `name(...)` call, whose
  every voice fires at that step's onset. A bare number/array step gets a
  short implicit attack/release lasting exactly one hop, so plain notes
  don't click and don't spill into the next slot by default &mdash; but a
  `sin(...)`/`~(...)` or `name(...)` step keeps whatever envelope duration
  it already has, so if that outlasts the hop the note rings into the next
  one. That's what turns "seq" into "overlap": one mechanism for ordinary
  sequencing and for dense, granular, overlapping textures, depending only
  on hop vs. envelope length. Frequencies only, never note names. A
  definition (`name(...)_{ ... }`) can't be written inside a seq/overlap
  block. `seq`/`overlap` can itself appear inside a `name(...)_{ ... }`
  body, so calling that name schedules a whole nested pattern at once. A
  `for` loop can also appear inside a `seq`/`overlap` block, wrapped around
  any step type &mdash; each iteration just generates more steps in the
  same sequence, still advancing the shared onset clock (and the hop-array
  cycling) one step at a time, so `for i in 1..8 { 220*i }` inside a `seq`
  schedules 8 separate steps, not one repeated 8 times.
- `rand(min, max)` / `randi(min, max)` &mdash; a fresh random number every
  time the line is evaluated (so one per loop iteration): `rand` is a
  float, `randi` a whole number, both ends inclusive.
- `let name = expr` / `let name = [a, b, c]` &mdash; variables and arrays
- `let release = seconds` &mdash; reserved top-level name: if declared,
  Stop (and pressing Run again) fades whatever's currently playing to
  silence over that many seconds instead of cutting it instantly. Without
  it, both behave exactly as before.
- `arr[i]` &mdash; index into an array, 0-based
- `for x in a..b { ... }` &mdash; loop over an integer range
- `for x in array { ... }` &mdash; loop over an array's elements
- `#` starts a line comment

## Example

A detuned chord swept left&rarr;right by index, plus a harmonic series swept
right&rarr;left, both built with loops:

```
let freqs = [220, 277, 330, 415]

for i in 0..3 {
  sin(freqs[i], 0.2, 0, -1 + i*(2/3)) * env(0, 0.02,1, 0.4,0.5, 0.3,0)
}

for i in 1..8 {
  sin(220*i, 1/i, i*0.3, 1 - (i-1)*(2/7)) * env(0, 0.01,1, 0.5,0.4, 0.3,0)
}
```

Frequency modulation with a nested oscillator (short alias, no envelope on
the modulator &mdash; it just needs to keep oscillating):

```
~(~(5, 50, 0), 1, 0) * ^(0, 0.05,1, 1.5,0)
```

A named, reusable sound, called twice at different pitches (each call is
one event &mdash; here just one oscillator, but the body could hold several):

```
gianni(f)_{
  sin(f, 1, 0) * env(0, 0.05,1, 0.2,0)
}

gianni(220)
gianni(330)
```

A little sequence: a steady eighth-note pulse of bare frequencies, then a
faster granular flurry made of the very same mechanism &mdash; just a much
smaller hop with a note whose envelope outlasts it, so the grains overlap:

```
seq(0.2) {
  220
  277
  330
  [220, 277, 330]
}

overlap(0.03) {
  sin(440, 0.3, 0) * env(0, 0.01,1, 0.15,0)
  sin(550, 0.3, 0) * env(0, 0.01,1, 0.15,0)
  sin(660, 0.3, 0) * env(0, 0.01,1, 0.15,0)
}
```

The same overlap, but with the frequencies generated by a `for` loop
instead of written out one by one &mdash; still 9 separate, sample-accurate
steps:

```
overlap(0.5) {
  for i in 1..3 {
    sin(440*i, 0.3, 0) * env(0, 0.01,1, 10.15,0)
    sin(440*i + 2, 0.3, 0) * env(0, 0.01,1, 10.15,0)
    sin(440*i + 10, 0.3, 0) * env(0, 0.01,1, 10.15,0)
  }
}
```

Everything is computed sample-by-sample inside a custom `AudioWorklet`
(a phase-accumulator oscillator, evaluated recursively for nested
modulators) &mdash; frequency, amplitude, phase and pan are all true
audio-rate signals, not `AudioParam` automation curves.

Each track uses a single persistent `AudioWorkletNode` — a "voice pool" —
rather than one node per voice: new voices are added to it by message as
they're scheduled, and a voice is dropped from the pool's internal list
the instant its own envelope ends. A 3-step program and a 300-step
program cost the same one node per track; only the finished voice's
object goes away, immediately, not a whole extra node.

## Spectral entropy

The Shannon entropy of the normalized power spectrum of the summed signal:
the Web Audio `AnalyserNode`'s FFT is converted from dB to linear
magnitude, normalized so it sums to 1, then

```
H = -Σ p_i · log2(p_i)
```

normalized again by `log2(bins)` to a 0&ndash;1 range. It's a rough measure
of how spread across the spectrum vs. how concentrated on a few
frequencies the sound is &mdash; a single sine sits low (~0.19), a spray of
40 partials sits high (~0.72).

## About

No build step, no dependencies: plain HTML/CSS/JS on the Web Audio API,
organized as small, single-purpose files under `src/` (language:
tokenizer/parser/compiler/interpreter; audio: engine/visualizer; worklet:
`Sine`/`Envelope`/`Voice`/`VoicePoolProcessor`), loaded via plain
`<script>` tags — no bundler, no build step, just files in a folder.

Part of [anthonydifuria.github.io](https://anthonydifuria.github.io) &mdash;
embedded live on the home page.

## License

MIT &mdash; see [LICENSE](LICENSE). See also [CITATION.cff](CITATION.cff).
