# Envelope-tool ↔ BBC OS sound-chip debugging notes

These notes accompany the four reference traces in the jsbeeb repo root:
`trace-env1.json`, `trace-env2.json`, `trace-env3.json`, `trace-env4.json`,
plus `trace-vol-sweep.csv`. Each trace was captured by running the same
`ENVELOPE` + `SOUND` pair on a real BBC OS 1.20 inside the jsbeeb headless
emulator and logging every byte the OS sends to the SN76489.

The traces are the ground truth. envelope-tool's job is to produce the same
sequence of register writes (modulo a small set of documented quirks) when
fed the same `ENVELOPE` and `SOUND` parameters.

---

## 1. The two scales involved

The BBC and the SN76489 use different volume conventions.

| Scale              | Range            | Type                            | Where it appears                     |
| ------------------ | ---------------- | ------------------------------- | ------------------------------------ |
| BBC amplitude      | `0..127` (7-bit) | **Linear**                      | `ENVELOPE` AA/AD/AS/AR, ALA, ALD     |
| SN76489 attenuation | `0..15` (4-bit) | **Logarithmic** (~2 dB per step) | What gets written to the sound chip  |

The OS continuously holds a current 7-bit amplitude per channel and converts
it to a 4-bit SN attenuation every time it issues a chip write.

## 2. The OS volume mapping

It is **not** a 128-byte lookup table. The OS uses a single arithmetic
expression:

```
attenuation = (127 - amplitude) >> 3       // integer divide, no rounding
```

Equivalently, sixteen uniform cells eight BBC units wide:

| Attenuation (loudness) | BBC amplitude range |
| ---------------------- | ------------------- |
| 0  (loudest)           | 120..127            |
| 1                      | 112..119            |
| 2                      | 104..111            |
| 3                      | 96..103             |
| 4                      | 88..95              |
| 5                      | 80..87              |
| 6                      | 72..79              |
| 7                      | 64..71              |
| 8                      | 56..63              |
| 9                      | 48..55              |
| 10                     | 40..47              |
| 11                     | 32..39              |
| 12                     | 24..31              |
| 13                     | 16..23              |
| 14                     | 8..15               |
| 15 (silent)            | 0..7                |

Verified empirically by the `trace-vol-sweep.csv` capture (envelope with
`AD=-1`, `T=1`, swept from BBC amp 127 → 0): the SN attenuation increments
exactly every eighth tick.

This linear-to-quasi-log mapping is the entire reason the BBC's "volume
curve" looks non-linear when you observe register writes — the BBC
amplitude is linear, the SN is log, and the conversion is integer
truncation.

### Implication: which `ENVELOPE` step sizes will skip attenuations?

The OS writes to the chip only when attenuation **changes** between ticks.
If a single tick changes BBC amplitude by enough to cross more than one
8-wide cell, intermediate attenuations are skipped:

| Per-tick BBC amp delta | Will it skip attenuations? |
| ---------------------- | -------------------------- |
| 1..7                   | Never (every cell entered) |
| 8                      | Sometimes (boundary aligned) |
| 9..15                  | Sometimes (one in N skipped) |
| 10                     | Skips ~1 in every 4 cells (see env1) |
| ≥16                    | Always skips ≥1 cell per tick |

env1 shows the canonical skip pattern (10 BBC units per tick → attenuations
1, 6, 11 skipped). envelope-tool must implement the same "write only on
change" logic, or it will emit extra writes envelope-tool didn't.

## 3. Trace format

Each entry in the JSON traces:

```js
{
  cycle: 5604034,        // CPU cycle, relative to first captured write (2 MHz clock)
  byte: 208,             // raw byte written to &FE43 (SN76489 data port)
  byteHex: "0xd0",
  channel: 2,            // SN76489 channel index (0/1/2 = tone, 3 = noise)
  kind: "vol",           // one of: "vol" | "periodLo" | "periodHi" | "noise"
  field: 0,              // decoded value (vol 0-15, period 0-15 lo/hi, noise 0-15)
  usedLatch: false       // true if this byte continued a previously-latched register
}
```

For tone period: `period = (periodHi << 4) | periodLo` (12-bit period, 4 lo
bits then 6 hi bits over the bus).

### BBC channel → SN76489 channel mapping

| BBC `SOUND` channel | SN76489 channel | Notes                        |
| ------------------- | --------------- | ---------------------------- |
| 0                   | 3               | Noise channel                |
| 1                   | 2               | Tone (this is what env1 uses) |
| 2                   | 1               | Tone                         |
| 3                   | 0               | Tone                         |

Yes, the order is reversed. envelope-tool must apply this mapping.

## 4. The traces, summarised

| Trace                | ENVELOPE                                          | SOUND                | Channel        | Writes | What it stresses                       |
| -------------------- | ------------------------------------------------- | -------------------- | -------------- | ------ | -------------------------------------- |
| `trace-env1.json`    | `1,8,1,-1,1,1,1,1,121,-10,-5,-2,120,-1`           | `SOUND 1,1,100,40`   | tone (SN 2)    | 48     | Volume **skips** + pitch wobble (PI±1) |
| `trace-env2.json`    | `2,1,14,-18,-1,44,32,50,6,1,0,-2,120,126`         | `SOUND 0,2,0,16`     | noise (SN 3)   | 173    | Pitch envelope writes to **noise control register** |
| `trace-env3.json`    | `3,4,0,0,0,1,1,1,126,-4,-2,-4,126,110`            | `SOUND 0,3,7,100`    | noise (SN 3)   | 16     | Volume-only, slow `T=4`                |
| `trace-env4.json`    | `1,1,0,0,0,0,0,0,127,-3,-2,-4,126,80`             | `SOUND 0,1,6,30`     | noise (SN 3)   | 16     | Volume-only, fast `T=1`, **decay→sustain transition** at ALD=80 |
| `trace-vol-sweep.csv`| `1,1,0,0,0,1,1,1,126,-1,-1,0,126,1`               | `SOUND 0,1,6,200`    | noise (SN 3)   | 17     | Sweep amp 126→0 to derive cell boundaries |

## 5. Behaviours envelope-tool must reproduce

### 5.1 Volume conversion (the big one)

Every tick:

1. Update BBC amplitude (signed add of AA/AD/AS/AR, clamp to 0..127).
2. Compute `att = (127 - amp) >> 3`.
3. If `att` differs from the previously written value, send `0x90 | (channel << 5) | att` to the chip (the high bit and `0x10` mark a volume write; channel is the SN channel, not the BBC channel).

### 5.2 Pitch envelope is per-tick, not per-step

Pitch sections (PI1/PI2/PI3 with PN1/PN2/PN3 step counts) advance one
unit per **envelope tick** (`T` × 10 ms), not per attenuation change. The
OS writes a new period every time the section's pitch value changes.

For tone channels the pitch byte goes through the SN's two-byte period
protocol: `periodLo` (latched), then `periodHi` ~400 cycles later. For
noise channels the same byte goes to the noise control register
(`0xE0 | (value & 0x0F)`), which selects shift rate / white-vs-periodic
mode rather than frequency.

**Crucial**: when all three PI values are zero, the OS writes nothing for
pitch — no redundant register writes. envelope-tool should suppress
writes when the value hasn't changed.

### 5.3 The note-start "double-write"

At note start, every trace shows the OS writing the initial attenuation
twice in quick succession:

```
cycle 0:    att 0   (initial level after attack reaches ALA)
cycle ~290: att 1   (first decay tick — fires immediately, ~145 µs later)
```

This is the OS's normal startup flow (attack target → first envelope tick
runs immediately) and is reproducible across all volume-only traces. It
is probably inaudible. envelope-tool can match it or skip it; just be
aware when diffing.

### 5.4 Decay → sustain transition

When BBC amplitude crosses `ALD`, the per-tick rate switches from `AD`
to `AS`. env4 demonstrates: 30 ms cadence (3 ticks/cell at `AD=-3`)
becomes 40 ms cadence (4 ticks/cell at `AS=-2`) at attenuation 7→8,
which corresponds to BBC amp ≈ 80 = `ALD`.

### 5.5 Pitch envelope continues during silence

Once attenuation reaches 15, the volume engine stops writing — but the
pitch envelope continues to advance and emit register writes for the
remainder of the SOUND duration. env1 and env2 both show this. env3
and env4 don't, because their pitch envelopes are zero so there's
nothing to write. envelope-tool must keep ticking pitch on silent
channels.

### 5.6 SOUND queue startup latency

In absolute cycle terms, every SOUND command in these traces fires
**~1 second after the BASIC line is typed**. The emulator's typing
finishes, the OS schedules the note via the sound queue, and the actual
register writes begin a noticeable delay later.

For envelope-tool this matters perceptually: if it begins emitting writes
the instant the user clicks "play," the attack will start sooner than the
real BBC. For trace diffing this can be ignored (cycles in the JSON are
already rebased to the first note write).

## 6. Suggested debug procedure

1. **Implement the volume formula first** (`att = (127 - amp) >> 3`).
   Diff against `trace-env3.json` and `trace-env4.json`. They are
   volume-only and the cleanest tests.
2. **Add the decay→sustain transition** so env4's timing change at
   attenuation 7 reproduces.
3. **Add "write only on change"** semantics. Diff against env1: you must
   see the same skipped attenuations (1, 6, 11) when `AD=-10`.
4. **Implement pitch envelopes for tone channels**. Diff against env1's
   period writes (oscillating between 0xECD and 0xECA).
5. **Implement pitch envelopes for noise channels** by writing to the
   noise control register. Diff against env2.
6. **Verify the BBC↔SN channel reversal** (BBC 0 ↔ SN 3, BBC 1 ↔ SN 2,
   etc.). All four traces use this mapping.

The diff doesn't have to be byte-for-byte cycle-perfect — small cycle
deltas (a few hundred cycles per write) are normal because the OS doesn't
schedule writes on exact cycle boundaries. Aim for **same byte values in
the same order** with cycle deltas within ±5%.

## 7. Reproducing the traces

The capture tool is `tools/sound-trace.js`. Command shape:

```sh
node tools/sound-trace.js \
  --cmd "ENVELOPE 1,8,1,-1,1,1,1,1,121,-10,-5,-2,120,-1" \
  --cmd "SOUND 1,1,100,40" \
  --run-cycles 12000000 \
  --skip-cycles 5000000 \
  --relative-cycles \
  --pretty \
  --out trace.json
```

`--skip-cycles` drops boot-time noise (the OS silences channel 0 at startup).
`--relative-cycles` rebases the first remaining write to cycle 0.

The tool requires `npm install` to have been run in the jsbeeb repo (it
pulls in `sharp` via `MachineSession`).
