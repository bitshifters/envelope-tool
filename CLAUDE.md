# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static web app for editing, visualising, and generating `ENVELOPE` parameters for the BBC Micro `SOUND` command. Designed to be hosted on GitHub Pages (target: `bitshifters.github.io`), so the build output must be a fully static site with no server-side dependencies.

Initial scope: an ADSR-style envelope editor that visualises the resulting amplitude (and pitch) waveform over time and lets the user audition the envelope with configurable `SOUND` parameters (channel, amplitude, pitch, duration) via the Web Audio API.

Reference PDFs in the repo root:
- `BBCUserGuide-1.00.pdf` — `SOUND` and `ENVELOPE` user-level documentation.
- `BBC_Microcomputer_Advanced_User_Guide.pdf` — lower-level sound system details.

Authoritative reference for the OS sound implementation: https://tobylobster.github.io/mos/mos/S-s16.html#SP2

## Domain notes (BBC Micro `ENVELOPE`)

The BBC `ENVELOPE` statement takes 14 parameters (`N, T, PI1, PI2, PI3, PN1, PN2, PN3, AA, AD, AS, AR, ALA, ALD`). Anything in the UI must round-trip cleanly to/from this 14-value form, since that is what users copy into BBC BASIC. Key constraints to preserve in any model:

- `T` is the length of each pitch step in 1/100 s units. Polarity is the inverse of what you'd guess: `T = 1..127` (bit 7 clear) **auto-repeats** the pitch envelope for the duration of the note; `T = 128..255` (bit 7 set) is a **single sweep** that holds the final pitch. Verified against the MOS source — see https://tobylobster.github.io/mos/mos/S-s16.html §6 (the `BMI` after the last pitch section skips the loop reset when bit 7 is set).
- Pitch (`PI1..3`, `PN1..3`) is a stepped, signed change-per-step model — *not* a continuous frequency curve. Visualisation should show the stepped shape, not interpolate it away.
- Amplitude (`AA, AD, AS, AR`) values are signed change-per-step; `ALA` is attack target level, `ALD` is the level at the end of decay (start of sustain). Sustain holds until the `SOUND` duration elapses, then release runs. This differs from a classical ADSR — keep the BBC semantics, don't silently substitute a generic ADSR model.
- The OS updates envelopes every 1/100 s (the centisecond tick). Time axes in visualisations should use that as the natural unit.

When the model and the UI disagree, the 14-parameter form is the source of truth.

## Commands

Stack: Vite + TypeScript (vanilla, no framework). `vite.config.ts` sets `base: "./"` so the build works at either an org-page root (`bitshifters.github.io/`) or a project subpath (`bitshifters.github.io/envelope-tool/`).

- `npm install` — first-time setup
- `npm run dev` — Vite dev server with HMR
- `npm run build` — typecheck (`tsc --noEmit`) then produce `dist/` for GitHub Pages
- `npm run preview` — serve the built `dist/` locally

Node is not installed on the development host as of writing; install it before running the above.

## Architecture guidance (for when code lands)

Keep three concerns separated so each can be tested in isolation:

1. **Envelope model** — pure functions over the 14-parameter tuple: parse/format, validate, and expand into a per-centisecond sample stream of `(amplitude, pitch)` pairs. No DOM, no audio. This is the part that must match the BBC OS behaviour exactly.
2. **Visualisation** — renders the sample stream from (1). Should not own envelope state.
3. **Audio playback** — Web Audio graph that consumes the same sample stream and applies it to an oscillator + gain, parameterised by the user's `SOUND` arguments. Should not own envelope state either.

Sharing the sample stream between the visualiser and the audio engine is what keeps "what you see" and "what you hear" guaranteed-consistent.

Current layout:
- `src/envelope.ts` — model. `Envelope` type, `expand()`, `formatBasic()`, `pitchToHz()`. No DOM, no audio.
- `src/visualizer.ts` — `render(canvas, samples)`, phase-coloured amplitude plot + pitch-offset plot.
- `src/audio.ts` — `play(samples, basePitch)` / `stop()` over Web Audio (square oscillator + scheduled gain).
- `src/main.ts` — wires inputs, calls `expand()` once per change, hands the same sample array to the visualiser and (on Play) the audio engine.

The audio engine currently uses a square oscillator as a stand-in for the SN76489's tone; if more authentic timbre is wanted later, swap it for a `PeriodicWave` or a small AudioWorklet without touching the model.
