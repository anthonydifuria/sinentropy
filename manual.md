# sinentropy — Language Manual

sinentropy is a tiny text-based language for additive synthesis. You type a
short program describing one or more oscillators (with optional
Csound-style envelopes), press Run, and it plays in the browser via the Web
Audio API while a live spectral-entropy meter, spectrum display and
waveform (oscilloscope) update in real time.

This manual documents every language feature, in the order you'll likely
want to learn them, plus a full grammar reference at the end.

**Contents:** [1. Quick start](#s1) · [2. The oscillator](#s2) ·
[3. Envelopes](#s3) · [4. Signal-rate modulation](#s4) ·
[5. Summing terms](#s5) · [6. Variables and arrays](#s6) ·
[7. Random numbers](#s7) · [8. for loops](#s8) ·
[9. Named, reusable sounds](#s9) · [10. The sequencer](#s10) ·
[11. Loops inside seq/overlap](#s11) · [12. Comments](#s12) ·
[13. Running your program](#s13) · [14. Spectral entropy, spectrum and
waveform](#s14) · [15. How it's built](#s15) ·
[16. Grammar reference](#s16) · [Appendix: why two spellings?](#appendix)

## <a id="s1"></a>1. Quick start

Type a single oscillator and press Run (or the "Run" button):

```
sin(440, 0.5, 0)
```

This plays a 440 Hz sine wave at amplitude 0.5, phase 0, forever (until you
press Stop) — because there's no envelope, the note simply sustains.

Add an envelope to make it start and stop on its own:

```
sin(440, 0.5, 0) * env(0, 0.05,1, 0.5,0)
```

`env(0, 0.05,1, 0.5,0)` is a Csound `linseg`-style envelope: start at 0,
ramp to 1 over 0.05s, then ramp to 0 over the next 0.5s. The note now has a
fast attack and a half-second decay, and stops automatically.

## <a id="s2"></a>2. The oscillator: `sin(...)` / `~(...)`

```
sin(freq, amp, phase[, pan])
```

- **freq** — frequency in Hz
- **amp** — amplitude (linear, not dB)
- **phase** — starting phase, in radians
- **pan** — stereo position, from `-1` (hard left) through `0` (center,
  the default) to `1` (hard right). Optional — omit it and you get `0`.

`sin` can also be spelled `~`. They are exactly the same token — two
spellings so you can pick whichever reads better in the moment:

```
~(440, 0.5, 0)
```

## <a id="s3"></a>3. Envelopes: `env(...)` / `^(...)`

```
env(v0, t1,v1, t2,v2, t3,v3, ...)
```

A `linseg`-style envelope: a starting value `v0`, followed by any number of
`(time, value)` pairs. Each `time` is a *duration in seconds relative to the
previous point*, not an absolute timestamp — so `env(0, 0.05,1, 0.5,0)`
means "start at 0, take 0.05s to reach 1, then take another 0.5s to reach
0" (ending at t = 0.55s total, not t = 0.5s).

`env` can also be spelled `^` — same token, two spellings:

```
sin(440, 0.5, 0) * ^(0, 0.05,1, 0.5,0)
```

The envelope is attached to an oscillator with `*`:

```
sin(freq, amp, phase[, pan]) * env(v0, t1,v1, ...)
```

**The envelope is optional.** A bare `sin(...)`/`~(...)` with no `* env(...)`
sustains at constant amplitude until you press Stop. This is useful for
drones, pads, or FM/AM modulators that just need to keep oscillating (see
§4) — they don't need their own envelope if the carrier's envelope is what
actually shapes the sound.

## <a id="s4"></a>4. Signal-rate modulation (FM / AM / PM / pan)

Any of `freq`, `amp`, `phase`, or `pan` can be another `sin(...)`/`~(...)`
instead of a plain number. That nested oscillator becomes a true
**audio-rate signal** driving the parameter — not a slow LFO approximation,
but the same phase-accumulator engine recursively evaluated sample by
sample. This gives you real frequency modulation (FM), amplitude modulation
(AM), phase modulation (PM), and even pan modulation, and it nests to any
depth.

Frequency modulation with a slow modulator (5 Hz) sweeping ±50 Hz around a
carrier, itself shaped by an envelope:

```
sin(220 + sin(5, 50, 0), 1, 0) * env(0, 0.05,1, 1.5,0)
```

The same thing with the short aliases, and no envelope on the modulator
(it just needs to keep oscillating for as long as the carrier's envelope
runs):

```
~(~(5, 50, 0), 1, 0) * ^(0, 0.05,1, 1.5,0)
```

Numbers and signals can be freely mixed with `+ - * /`:

```
sin(220 + sin(5, 50, 0), 1, 0)
```

Because this is genuine sample-by-sample evaluation, nesting depth costs
CPU, not extra audio nodes — the whole modulation tree for one voice runs
inside a single `AudioWorkletNode`.

## <a id="s5"></a>5. Summing terms

Every top-level oscillator term in your program is summed into the output.
The `+` between terms is entirely optional — it's there for readability
only:

```
sin(220, 0.2, 0)
sin(330, 0.2, 0)
sin(440, 0.2, 0)
```

is identical to:

```
sin(220, 0.2, 0) +
sin(330, 0.2, 0) +
sin(440, 0.2, 0)
```

## <a id="s6"></a>6. Variables and arrays

```
let name = expr
let name = [a, b, c]
```

`let` binds a name to a number, an array, or any expression. Arrays are
indexed with `arr[i]`, 0-based:

```
let freqs = [220, 277, 330, 415]
sin(freqs[0], 0.2, 0)
```

## <a id="s7"></a>7. Random numbers: `rand(...)` / `randi(...)`

```
rand(min, max)     # a float, uniformly distributed in [min, max]
randi(min, max)    # a whole number, min and max both inclusive
```

Both draw a **fresh number every time that line is actually evaluated** —
they're not a value you compute once and reuse, they're a dice roll each
time. That's what makes them useful inside a `for` loop: every iteration
gets its own independent draw.

A single random frequency between 200 and 400 Hz:

```
sin(rand(200, 400), 0.4, 0) * env(0, 0.05,1, 0.5,0)
```

Ten short notes, each at a different random pitch:

```
for i in 1..10 {
  sin(randi(200, 800), 0.15, 0) * env(0, 0.01,1, 0.2,0)
}
```

`rand`/`randi` work anywhere a number is allowed — inside `sin(...)`,
inside `env(...)`, inside an array literal, as a loop bound, mixed into
arithmetic:

```
let freqs = [rand(100,200), rand(200,300), rand(300,400)]
sin(freqs[0] + rand(-5,5), 0.3, 0)
```

`randi(5, 5)` (equal bounds) always returns `5`; non-integer bounds are
rounded first, so `randi(1.2, 4.8)` draws a whole number from 1 to 5.
`max` must be `>= min` for both, and neither accepts an oscillator/signal
as an argument — only plain numbers, since the draw happens once, before
the sound starts, not sample-by-sample.

## <a id="s8"></a>8. `for` loops

```
for x in a..b { ... }      # integer range, inclusive of both ends
for x in array { ... }     # loop over an array's elements
```

At the top level of a program, a `for` loop's body is a list of statements
(oscillators, more `let`s, nested `for`s, `seq`/`overlap` blocks, calls —
anything a top-level statement can be):

A detuned chord swept left→right by index, plus a harmonic series swept
right→left, both built with loops:

```
let freqs = [220, 277, 330, 415]

for i in 0..3 {
  sin(freqs[i], 0.2, 0, -1 + i*(2/3)) * env(0, 0.02,1, 0.4,0.5, 0.3,0)
}

for i in 1..8 {
  sin(220*i, 1/i, i*0.3, 1 - (i-1)*(2/7)) * env(0, 0.01,1, 0.5,0.4, 0.3,0)
}
```

Note two limitations: a range `a..b` only counts **upward** (you can't
write `3..0` to count down — build a reversed array instead, see §11), and
there is no modulo (`%`) operator.

## <a id="s9"></a>9. Named, reusable sounds: `name(params)_{ ... }`

```
name(p1, p2, ...)_{
  ...body...
}
```

Defines a reusable, *parametric* sound — pure substitution, no closures. A
definition's parameters are just names that get replaced with whatever
values the call passes:

```
gianni(f)_{
  sin(f, 1, 0) * env(0, 0.05,1, 0.2,0)
}

gianni(220)
gianni(330)
```

Each call — `gianni(220)`, `gianni(330)` — is one event: every
`sin(...)`/`~(...)` the body contains fires together, using that call's own
argument values.

Rules:

- **Only definitions at the top level of the program are registered.** A
  `name(...)_{ ... }` written inside a `for` loop, or inside another
  definition's body, is silently ignored (never registered) — this is
  intentional: definitions are meant to be a fixed, top-level vocabulary of
  reusable sounds, not something generated dynamically.
- Because registration happens as a pre-pass over the whole program, order
  doesn't matter — a definition can be called *before* it appears later in
  the file, and it may call itself or another definition.
- Recursion is capped at 64 nested calls, so a call cycle that never
  bottoms out fails loudly with an error instead of freezing the audio
  thread.
- A definition's body can itself contain a `seq`/`overlap` block (§10) — so
  calling that name schedules a whole nested pattern at once, not just a
  single event.
- A definition's body can use `rand`/`randi` (§7) — each call to that name
  gets its own fresh draw.

## <a id="s10"></a>10. The sequencer: `seq(hop) { ... }` / `overlap(hop) { ... }`

This is the tool for anything that isn't "everything starts at t = 0" —
rhythms, arpeggios, granular textures. Every step inside a `seq`/`overlap`
block fires at its own **sample-accurate scheduled onset**, computed
entirely inside the audio engine (not with `setTimeout` or any other
JS-thread timer, which would drift).

```
seq(hop) {
  step
  step
  ...
}
```

`seq` and `overlap` are two spellings of the exact same construct — see
"Why two names?" below.

### The hop

`hop`, in parentheses, controls the spacing between step onsets. It's
either:

- **a single number** — a constant number of seconds between onsets:
  `seq(0.2) { 220  277  330 }`
- **an array of numbers** — a rhythmic pattern. If there are more steps
  than hop values, the hop array cycles:
  `seq([0.2, 0.2, 0.4]) { 220  277  330  415  440  494 }`

  Here step 1 uses hop `0.2`, step 2 uses `0.2`, step 3 uses `0.4`, step 4
  wraps back around to `0.2`, and so on.

### What a step can be

- **A bare frequency number or arithmetic expression** — `220`, `base*1.5`,
  `220 + i*10`, `randi(200,600)`. Frequencies only, never note names.
- **An array of frequencies** — `[220, 277, 330]` — fired together as a
  chord, one voice per frequency, each at reduced amplitude so the chord
  doesn't clip.
- **A full `sin(...)`/`~(...)` term**, envelope and all — you get complete
  control over that one step's sound.
- **A `name(...)` call** — every voice the named sound's body produces
  fires together at that step's onset.
- **A `for` loop** — see §11.

### Implicit envelopes and the seq/overlap distinction

A **bare number or array step** automatically gets a short implicit
attack/release envelope that lasts *exactly one hop* — so plain notes in a
sequence don't click on and don't spill past their own slot by default.

A **full `sin(...)`/`~(...)` or `name(...)` step**, by contrast, keeps
*whatever envelope duration it already carries* (or none, if you wrote
none). If that duration is longer than the hop, the note simply rings on
into the next slot — and the next, if its envelope is longer still.

That's the entire difference between "seq" and "overlap": **the exact same
mechanism**, with the outcome depending purely on how each step's own
duration compares to the hop. Write short hops and short/implicit
envelopes and you get ordinary rhythmic sequencing. Write a small hop with
notes whose envelopes deliberately outlast it, and the same mechanism
produces dense, granular, overlapping textures:

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

The second block's hop is 0.03s but each note's envelope lasts 0.16s, so
five or six grains are always sounding at once — that's granular synthesis,
built from nothing but the sequencer you already know.

### Restrictions

- A definition (`name(...)_{ ... }`) cannot be written inside a
  `seq`/`overlap` block. Define your sounds at the top level, then call
  them as steps.
- A `seq`/`overlap` block needs at least one step.
- `seq`/`overlap` can itself appear inside a `name(...)_{ ... }` body — so
  calling that name schedules a whole nested pattern at once (§9).

## <a id="s11"></a>11. Loops inside `seq`/`overlap` — arpeggios and repeated patterns

A `for` loop can appear *inside* a `seq`/`overlap` block, wrapped around
any step type. Each iteration of the loop generates one more step in the
**same** sequence — it does not start a separate timeline. The shared
onset clock, and the hop-array cycling index, both keep advancing across
every iteration exactly as if you'd written each iteration's steps out by
hand.

This is your numeric-loop module for arpeggios and repeated patterns. The
simplest arpeggio — step through a chord's notes in order, using array
indexing:

```
let freqs = [220, 277, 330, 415]

seq(0.15) {
  for i in 0..3 {
    freqs[i]
  }
}
```

Repeat the arpeggio several times by nesting another `for` — nesting works
to any depth, and each nested level just keeps generating more steps in
the one sequence:

```
seq(0.15) {
  for rep in 0..3 {
    for i in 0..3 {
      freqs[i]
    }
  }
}
```

This plays 4 full passes of the 4-note arpeggio — 16 steps total, all
scheduled sample-accurately on one continuous clock.

Since ranges only count upward and there's no modulo operator (§8), an
up-down (ping-pong) arpeggio is easiest to write as two arrays, one already
reversed:

```
let up   = [220, 277, 330, 415]
let down = [415, 330, 277, 220]

seq(0.15) {
  for i in 0..3 { up[i] }
  for i in 0..3 { down[i] }
}
```

A loop step can be anything a step can be — a bare frequency, a full
`sin(...)`/`~(...)` term with its own envelope, a `name(...)` call, or a
random draw:

```
blip(f)_{ sin(f, 1, 0) * env(0, 0.02,1, 0.05,0) }

seq(0.1) {
  for i in 1..8 {
    blip(110*i)
  }
}

overlap(0.05) {
  for i in 1..40 {
    randi(150, 900)
  }
}
```

— the first is an 8-partial arpeggio built entirely from one named sound
and one loop; the second is 40 short random grains, a one-line granular
cloud.

## <a id="s12"></a>12. Comments

```
# this is a comment, to end of line
```

## <a id="s13"></a>13. Running your program

The page has two independent editors, Track A and Track B, each with its
own **Run** and **Stop** button and its own status line. Pressing Run on
one track parses and plays only that track's code; it never stops or
restarts the other track. Both tracks' audio is simply mixed together into
the same output, so you can, for example, run a drone or pad in Track A
and layer a `seq`/`overlap` pattern on top in Track B, starting and
stopping each independently. Pressing Stop on a track silences only that
track's voices — instantly, unless you've declared a release time (below).

### Fading out instead of cutting: `let release = ...`

By default, Stop (and pressing Run again while something's still playing)
cuts whatever's currently sounding immediately — including a drone with no
envelope, which would otherwise sustain forever. If you'd rather it faded
out, declare a release time anywhere at the top level of your program:

```
let release = 0.4   # seconds

sin(220, 0.5, 0)
```

With `release` declared, Stop fades every currently-playing voice on that
track to silence over that many seconds instead of cutting it — this works
whether the voice is a drone or already partway through its own `env(...)`,
since the fade is a separate multiplier on top of whatever the voice is
already doing. A voice that hasn't started playing yet when you press Stop
(still waiting its turn in a long `seq`/`overlap`) is simply dropped —
there's nothing audible to fade, so it never sounds at all rather than
playing anyway. Pressing Run again behaves the same way toward whatever
was playing before: the old voices fade out over their own release time
while the new ones start immediately at full volume, so pressing Run
repeatedly layers a trail of fading-out generations under each fresh one
rather than hard-cutting between them. Without `let release`, both Stop
and Run behave exactly as before (instant cut) — this is purely opt-in.

`release` is a plain top-level variable, not new grammar: it's read once,
right after your program is parsed, so it must be a plain number in
seconds. If you don't declare it, the release time is 0 (instant, today's
default).

While either track is running, the spectral-entropy meter, spectrum
display and waveform display (§14) update live from the combined signal
of both tracks.

### Keyboard shortcuts

Typing one of these two-character sequences anywhere in EITHER track's code
editor removes it and immediately fires that action on THAT track, as if
you'd pressed its own button (it never affects the other track):

- `~~` — Run, echoing the oscillator's `~` alias
- `!!` — Stop

## <a id="s14"></a>14. Spectral entropy, spectrum and waveform

The number shown while a program plays is the Shannon entropy of the
normalized power spectrum of the summed signal (both tracks combined): the
Web Audio `AnalyserNode`'s FFT is converted from dB to linear magnitude,
normalized so it sums to 1, then

```
H = -Σ p_i · log2(p_i)
```

normalized again by `log2(bins)` to a 0–1 range. It's a rough measure of
how spread across the spectrum vs. how concentrated on a few frequencies
the sound is — a single sine sits low (~0.19), a spray of 40 partials sits
high (~0.72).

It's a read-only readout, not something you dial in: you don't set an
entropy value, you build a program, and the number tells you where you
landed. Use it as feedback while you compose — stack more partials in a
`for` loop, add a modulator, detune a chord, and watch the number climb as
the sound moves from a pure tone toward a dense, noise-like texture; strip
things back down and watch it fall.

Next to the spectrum display is a live waveform (oscilloscope) view: the
same combined signal read as a time-domain snapshot
(`getByteTimeDomainData`) instead of a frequency-domain one, so it costs no
extra audio nodes — it's the same single `AnalyserNode` powering the
entropy meter and spectrum bars, just read a second way.

## <a id="s15"></a>15. How it's built (for the curious)

Everything is computed sample-by-sample inside a custom `AudioWorklet` — a
phase-accumulator oscillator, evaluated recursively for nested modulators.
Frequency, amplitude, phase, and pan are all true audio-rate signals, not
`AudioParam` automation curves, which is what makes genuine through-zero
FM/AM/PM/pan modulation possible.

Rather than one `AudioWorkletNode` per voice, each track uses a single
persistent node — a "voice pool" — holding a plain JS array of live
`Voice` objects (`Sine`/`Envelope`/`Voice`/`VoicePoolProcessor` classes,
under `src/worklet/`). Pressing Run sends that track's newly-interpreted
voices to its pool node by message instead of creating new nodes, so a
3-step program and a 300-step program cost the same one node per track. A
voice not yet due to play costs O(1) per render block, not O(block size) —
so a program with thousands of far-future scheduled voices stays cheap
until each one's own turn actually arrives. A voice is dropped from the
pool's internal list the instant its own envelope ends (or its release
fade completes) — no lingering node to disconnect, no waiting on the audio
graph, just one object removed from an array. A `seq`/`overlap` step's
scheduled onset is still passed along as a sample-accurate `startOffset`,
so timing never depends on the JS thread.

`rand`/`randi` (§7) are resolved once, on the main thread, while your
program is being interpreted (compiled into the plain numbers the worklet
receives) — never inside the audio thread's per-sample loop, so they cost
nothing at playback time.

No build step, no dependencies: plain HTML/CSS/JS on the Web Audio API,
split into small, single-purpose files under `src/` (language:
tokenizer/parser/compiler/interpreter; audio: engine/visualizer; worklet:
the four classes above) and loaded via plain `<script>` tags — no
bundler, just files in a folder.

## <a id="s16"></a>16. Grammar reference

```
program    := statement*
statement  := letStmt | forStmt | oscExpr | defStmt | callStmt | seqStmt

letStmt    := "let" IDENT "=" (arrayLit | expr)
              -- "let release = <seconds>" at the top level is a reserved
                 convention (not separate grammar): it sets how long
                 Stop/Run fade out instead of cutting instantly (§13).

forStmt    := "for" IDENT "in" (expr ".." expr | expr) "{" statement* "}"

oscExpr    := SIN "(" expr "," expr "," expr ("," expr)? ")"
              ("*" ENV "(" expr ("," expr)+ ")")?
              -- SIN is "sin" or "~"; ENV is "env" or "^" (same token, two
                 spellings each). sin(freq, amp, phase[, pan]); the
                 * env(...) part is OPTIONAL. pan defaults to 0.
                 freq/amp/phase/pan can each be a plain expression OR
                 another oscExpr, nested to any depth.

defStmt    := IDENT "(" (IDENT ("," IDENT)*)? ")" "_" "{" statement* "}"
              -- defines a reusable, parametric sound. Pure substitution
                 (no closures). Only registered at the top level of the
                 program. May call itself or another def (capped at 64
                 nested calls).

callStmt   := IDENT "(" (expr ("," expr)*)? ")"
              -- plays a previously defined sound; every osc(...) it
                 contains fires together as one event.

seqStmt    := SEQ "(" expr ")" "{" seqStep* "}"
              -- SEQ is "seq" or "overlap" (same token, two spellings).
                 The parenthesized expr is the hop: one number (constant
                 seconds between step onsets) or an array of numbers (a
                 rhythmic pattern, cycled if there are more steps than hop
                 values). Needs at least one step.

seqStep    := oscExpr | callStmt | seqForStmt | expr
              -- a bare expr must resolve to a frequency (number) or an
                 array of frequencies (a chord fired together). It gets an
                 implicit short attack/release envelope lasting exactly
                 one hop. A defStmt is not allowed inside a seq/overlap
                 block.

seqForStmt := "for" IDENT "in" (expr ".." expr | expr) "{" seqStep* "}"
              -- generates a run of steps, one per loop iteration, each
                 still consuming its own onset (and its own place in a
                 cycled hop array) in the surrounding seq/overlap. Nests
                 to any depth.

expr       := term (("+" | "-") term)*
term       := factor (("*" | "/") factor)*
factor     := "-" factor | primary
primary    := primaryBase ("[" expr "]")*
primaryBase := NUMBER | IDENT | "(" expr ")" | arrayLit | oscExpr | randExpr
randExpr   := ("rand"|"randi") "(" expr "," expr ")"
              -- a fresh random number, drawn right when this line is
                 evaluated (so a rand(...) written inside a for-loop body
                 draws a new one every iteration). rand(min,max) is a
                 float uniformly in [min,max]; randi(min,max) is an
                 integer, both ends inclusive (rounded if min/max aren't
                 already whole numbers).
arrayLit   := "[" (expr ("," expr)*)? "]"
```

`arr[i]` indexes into an array, 0-based. `+` between top-level statements
(and between seq/overlap steps) is optional and purely cosmetic — terms
sum automatically. There is no modulo (`%`) operator and no downward
(`b..a`) range.

## <a id="appendix"></a>Appendix: why two spellings for everything?

`sin`/`~`, `env`/`^`, and `seq`/`overlap` are each exactly one token with
two spellings — the parser treats them identically. This exists purely for
readability in the moment: `~` and `^` read fast and dense when you're
sketching or nesting modulators (`~(~(5,50,0),1,0) * ^(0,0.05,1,1.5,0)`),
while `sin`/`env`/`seq`/`overlap` read more clearly in longer, more
deliberate programs. Use whichever fits what you're writing — you can even
mix both spellings freely in the same program.
