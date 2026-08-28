# sinentropy

A tiny language for additive synthesis: sum sine oscillators shaped by
Csound-style `linseg` envelopes, built with arrays and `for` loops, and
watch the spectral entropy of the result update live in the browser.

Try it live on [anthonydifuria.github.io](https://anthonydifuria.github.io) &mdash;
or open `index.html` here directly (via a local server, or GitHub Pages).

## Grammar

```
sin(freq, amp, phase[, pan]) * env(v0, t1,v1, t2,v2, ...)
```

- `sin(freq, amp, phase, pan)` &mdash; frequency in Hz, amplitude, phase in
  radians, pan from `-1` (left) to `1` (right); `pan` is optional and
  defaults to `0` (center)
- `env(v0, t1,v1, t2,v2, ...)` &mdash; a Csound `linseg`-style envelope: a
  starting value followed by any number of (time, value) pairs, all times
  in seconds
- terms sum automatically; `+` between them is optional, purely cosmetic
- `let name = expr` / `let name = [a, b, c]` &mdash; variables and arrays
- `for x in a..b { ... }` &mdash; loop over an integer range
- `for x in array { ... }` &mdash; loop over an array's elements
- `#` starts a line comment

## Example

A detuned chord panned left plus a harmonic series spread across the stereo
field by loop index, built with a loop:

```
let freqs = [220, 277, 330, 415]
for f in freqs {
  sin(f, 0.2, 0, -1) * env(0, 0.02,1, 0.4,0.5, 0.3,0)
}

for i in 1..8 {
  sin(220*i, 1/i, i*0.3, -1 + (i-1)/3.5) * env(0, 0.01,1, 0.5,0.4, 0.3,0)
}
```

Everything runs at audio rate &mdash; frequency, amplitude and phase are
baked into real `OscillatorNode`/`AudioParam` automation, with no separate
control rate.

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

No build step, no dependencies: plain HTML/CSS/JS on the Web Audio API.

Part of [anthonydifuria.github.io](https://anthonydifuria.github.io) &mdash;
embedded live on the home page.

## License

MIT &mdash; see [LICENSE](LICENSE). See also [CITATION.cff](CITATION.cff).
