# BBC Micro ENVELOPE Editor

A static web app for editing, visualising, and auditioning `ENVELOPE` parameters for the BBC Micro `SOUND` command.

**Live:** https://bitshifters.github.io/envelope-tool/

## Features

- Edit all 14 `ENVELOPE` parameters and the 4 `SOUND` parameters with live preview.
- Editable BBC BASIC `ENVELOPE` and `SOUND` lines — paste an existing statement to populate the editor, or copy the formatted line for use in BASIC.
- Visualisation of the resulting amplitude envelope (with A/D/S/R phase markers) and the absolute pitch over time.
- Web Audio playback with a sweeping playhead synced to the audio clock.
- 12 presets covering single-shot envelopes (Piano, Pluck, Bell, Pad, Bass, Drum, Laser) and looping pitch envelopes (Vibrato, Trill, Siren, Arpeggio, Wobble).
- Shareable URL: every change is reflected in the URL bar via `?env=…&sound=…`, so copying the address reproduces the exact state.
- "Run in BBC emulator" button that opens the current `ENVELOPE`/`SOUND` in [bbc.xania.org](https://bbc.xania.org/) (jsbeeb) for one-click A/B against the real BBC.

## Development

Stack: Vite + TypeScript (vanilla, no framework).

```sh
npm install
npm run dev       # dev server with HMR
npm run build     # typecheck (tsc --noEmit) and produce dist/
npm run preview   # serve the built dist/ locally
```

`vite.config.ts` sets `base: "./"` so the build works at either an org-page root or a project subpath. GitHub Pages deployment runs from `.github/workflows/pages.yml` on every push to `main`.

## Architecture

Three concerns are kept separate so each can be tested in isolation:

| Module                | Responsibility                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/envelope.ts`     | Pure model. The 14-parameter tuple, parse/format, and `expand()` into a per-centisecond `Sample[]` stream.  |
| `src/visualizer.ts`   | Canvas rendering of the sample stream — amplitude and absolute pitch plots with phase markers and playhead. |
| `src/audio.ts`        | Web Audio engine that consumes the same sample stream and applies it to an oscillator + scheduled gain.    |
| `src/main.ts`         | UI wiring: inputs, presets, URL state, transport.                                                           |
| `src/presets.ts`      | Bundled envelope + sound parameter sets for one-click loading.                                              |

The visualiser and the audio engine consume the **same** sample array each render — what you see is exactly what you hear.

## BBC domain notes

The 14-parameter form is the source of truth. Anything in the UI must round-trip cleanly to and from `ENVELOPE N, T, PI1, PI2, PI3, PN1, PN2, PN3, AA, AD, AS, AR, ALA, ALD`.

A few non-obvious quirks (also documented in `CLAUDE.md`):

- `T` bit 7 polarity is inverted from intuition: `T = 1..127` (bit 7 **clear**) auto-repeats the pitch envelope; `T = 128..255` (bit 7 **set**) is single-sweep.
- Pitch sections with `PN = 0` are not free — the OS hits `BEQ skipToNextChannel` after loading the empty section, so each empty section costs `T` cs of dead time. Loop wraps and non-empty section transitions are free.
- The MOS allocates exactly **4** envelope slots (`N = 1..4`); higher numbers aren't usable.
- Pitch is musically quantised to the BBC's own divider table (`pitchToHz()` in `src/envelope.ts`), not to equal temperament — higher octaves drift slightly sharp, matching the real machine.

## Future work

- **Channel 0 (noise).** This tool currently restricts `SOUND` channel to 1..3 and uses a square oscillator. Real BBC channel 0 is a separate noise generator with several modes selected by the pitch parameter (white / periodic at different rates, plus a mode that tracks channel 2's frequency).
- **Periodic noise as bass.** When channel 0 is set to one of the periodic modes — particularly the mode that tracks channel 2 — the result is a coloured tone an octave or two below the reference. This is the classic BBC "periodic bass" trick used by many games. Supporting it requires emulating the SN76489's noise LFSR rather than substituting a square wave.
- **Static amplitude.** Negative `SOUND` amplitude (-15..-1) selects a static volume bypassing the envelope. Currently disallowed in the UI.
- **Stereo / multi-channel mixing.** Real BBC sequences usually involve simultaneous notes across multiple channels; this tool is single-note only.
- **Authentic SN76489 timbre on tone channels.** The current square oscillator is a stand-in. A `PeriodicWave` or AudioWorklet implementation of the SN76489 tone generator would give a closer match.

## Credits

By Kieran Connell and Claude. Thanks to [Toby Lobster's MOS disassembly](https://tobylobster.github.io/mos/mos/index.html) — the authoritative reference used to nail down the BBC's pitch and envelope timing.
