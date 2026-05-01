// Pure model for the BBC Micro ENVELOPE statement.
//
// References:
//   - BBC User Guide, ENVELOPE / SOUND
//   - Toby Lobster's MOS disassembly: https://tobylobster.github.io/mos/mos/S-s16.html#SP2
//
// The 14-parameter form is the source of truth. All UI state must round-trip
// to and from this tuple unchanged.

export interface Envelope {
  n: number;   // envelope number, 1..16 (cosmetic in this tool)
  t: number;   // length of each pitch step, in 1/100 s. Bit 7 = auto-repeat pitch envelope.
  pi1: number; // pitch change per step, section 1 (signed, -128..127)
  pi2: number; // pitch change per step, section 2
  pi3: number; // pitch change per step, section 3
  pn1: number; // number of steps in section 1 (0..255)
  pn2: number; // number of steps in section 2
  pn3: number; // number of steps in section 3
  aa: number;  // attack:  amplitude change per centisecond (signed)
  ad: number;  // decay:   amplitude change per centisecond (signed)
  as: number;  // sustain: amplitude change per centisecond (signed)
  ar: number;  // release: amplitude change per centisecond (signed; usually negative)
  ala: number; // attack target level (0..126)
  ald: number; // level at end of decay / start of sustain (0..126)
}

export const DEFAULT_ENVELOPE: Envelope = {
  n: 1,
  t: 1,
  pi1: 0, pi2: 0, pi3: 0,
  pn1: 0, pn2: 0, pn3: 0,
  aa: 121, ad: -8, as: -1, ar: -10,
  ala: 126, ald: 80,
};

/** A single centisecond sample of the expanded envelope. */
export interface Sample {
  /** Pitch offset to add to the SOUND base pitch, after stepping. */
  pitchOffset: number;
  /** Amplitude in 0..126 (BBC internal range). */
  amplitude: number;
  /** Phase that produced this sample, useful for visualisation colouring. */
  phase: "attack" | "decay" | "sustain" | "release";
}

// Per the BBC User Guide and MOS source: T in 1..127 auto-repeats the pitch
// envelope for the lifetime of the note; T in 128..255 (bit 7 set) is a
// single sweep that holds at the final pitch when sections are exhausted.
const PITCH_NO_REPEAT_BIT = 0x80;

/**
 * Expand an envelope into a stream of per-centisecond samples for a given
 * SOUND command. `soundDuration` is in 1/20 s units (the BBC unit), and the
 * release runs after that elapses.
 *
 * The returned stream covers attack + decay + sustain + release, i.e. the
 * full audible lifetime of the note.
 */
export function expand(env: Envelope, soundAmplitude: number, soundDuration: number): Sample[] {
  const samples: Sample[] = [];

  // SOUND amplitude argument: 0 = silence, -15..-1 = static volume, 1..4 = envelope number.
  // For envelope playback (positive arg referencing this envelope) the BBC starts amplitude
  // at 0 and runs the full attack/decay/sustain/release cycle. For static negative amplitudes
  // the envelope is bypassed entirely; we still let callers preview the envelope shape.
  const useEnvelope = soundAmplitude > 0;

  // Pitch envelope state.
  const tStep = env.t & 0x7f;          // step length in centiseconds
  const repeat = (env.t & PITCH_NO_REPEAT_BIT) === 0;
  const sections: Array<[number, number]> = [
    [env.pi1, env.pn1],
    [env.pi2, env.pn2],
    [env.pi3, env.pn3],
  ];
  let pitchOffset = 0;
  let sectionIdx = 0;
  let stepInSection = 0;
  let csUntilNextStep = Math.max(1, tStep);

  // BBC-accurate pitch envelope advance. Subtleties:
  //   - When a section's PN is exhausted but the next section has PN > 0, the
  //     transition is "free": we immediately apply the next section's first
  //     step in the same tick (the OS effectively decrements sectC, advances
  //     the section index, and applies the next step before returning).
  //   - When the next section has PN=0, the OS hits `BEQ skipToNextChannel`
  //     after loading the empty section, which costs the full step countdown
  //     (T cs of dead time) before the next section is reached. We model this
  //     by *not* recursing into a PN=0 section — just advance and return, so
  //     the caller's csUntilNextStep reset gives the dead time.
  //   - On loop wrap (sectionIdx past the end with repeat enabled) the OS
  //     resets offset and runs the same tick's step from section 0, so the
  //     wrap itself doesn't cost extra time (matches a normal step interval).
  const stepPitch = () => {
    if (tStep === 0) return; // T=0 disables the pitch envelope
    if (sectionIdx >= sections.length) {
      if (!repeat) return;
      sectionIdx = 0;
      stepInSection = 0;
      pitchOffset = 0;
      // Fall through to apply section 0's first step this tick.
    }
    const [pi, pn] = sections[sectionIdx]!;
    if (pn === 0) {
      // Empty section: advance and return (consumes T cs).
      sectionIdx += 1;
      return;
    }
    if (stepInSection >= pn) {
      sectionIdx += 1;
      stepInSection = 0;
      stepPitch();
      return;
    }
    pitchOffset = (pitchOffset + pi) | 0;
    stepInSection += 1;
  };

  // Amplitude envelope state.
  // Phases run in order: attack -> decay -> sustain (until note ends) -> release (to 0).
  const noteCentiseconds = soundDuration * 5; // 1/20s -> 1/100s
  let amplitude = 0;
  let phase: Sample["phase"] = "attack";
  let csElapsed = 0;

  // Hard cap to protect against pathological envelopes (e.g. AA=0, ALA>0 -> never reach target).
  const MAX_CS = 60_000; // 10 minutes of centiseconds

  while (csElapsed < MAX_CS) {
    samples.push({ pitchOffset, amplitude: clamp(amplitude, 0, 126), phase });

    // Pitch tick.
    csUntilNextStep -= 1;
    if (csUntilNextStep <= 0) {
      stepPitch();
      csUntilNextStep = Math.max(1, tStep);
    }

    // Amplitude tick.
    if (useEnvelope) {
      switch (phase) {
        case "attack": {
          amplitude += env.aa;
          if (env.aa >= 0 ? amplitude >= env.ala : amplitude <= env.ala) {
            amplitude = env.ala;
            phase = "decay";
          }
          break;
        }
        case "decay": {
          amplitude += env.ad;
          if (env.ad >= 0 ? amplitude >= env.ald : amplitude <= env.ald) {
            amplitude = env.ald;
            phase = "sustain";
          }
          break;
        }
        case "sustain": {
          amplitude += env.as;
          if (csElapsed + 1 >= noteCentiseconds) phase = "release";
          break;
        }
        case "release": {
          amplitude += env.ar;
          if (amplitude <= 0) {
            amplitude = 0;
            samples.push({ pitchOffset, amplitude: 0, phase: "release" });
            return samples;
          }
          break;
        }
      }
    } else {
      // Static amplitude: -15..-1 maps linearly to BBC level 0..126.
      const staticLevel = Math.round((-soundAmplitude / 15) * 126);
      amplitude = clamp(staticLevel, 0, 126);
      if (csElapsed + 1 >= noteCentiseconds) {
        samples.push({ pitchOffset, amplitude: 0, phase: "release" });
        return samples;
      }
    }

    csElapsed += 1;
  }

  return samples;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Format an envelope as a BBC BASIC `ENVELOPE` line. */
export function formatBasic(env: Envelope): string {
  const parts = [
    env.n, env.t,
    env.pi1, env.pi2, env.pi3,
    env.pn1, env.pn2, env.pn3,
    env.aa, env.ad, env.as, env.ar,
    env.ala, env.ald,
  ];
  return `ENVELOPE ${parts.join(",")}`;
}

/** Format a BBC BASIC `SOUND` statement. */
export function formatSound(channel: number, amplitude: number, pitch: number, duration: number): string {
  return `SOUND ${channel},${amplitude},${pitch},${duration}`;
}

/**
 * Pull comma-separated integers out of a BBC BASIC statement, ignoring an
 * optional leading keyword and any surrounding whitespace. Returns null if
 * the wrong number of integers is present or any token isn't a valid integer.
 */
function parseStatement(line: string, keyword: string, expected: number): number[] | null {
  const trimmed = line.trim().replace(/^[A-Za-z]+\s*/, ""); // drop optional keyword
  void keyword; // keyword is matched loosely; users may paste with or without it
  if (trimmed.length === 0) return null;
  const tokens = trimmed.split(",").map((t) => t.trim());
  if (tokens.length !== expected) return null;
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^-?\d+$/.test(t)) return null;
    out.push(Number.parseInt(t, 10));
  }
  return out;
}

/** Parse a BBC BASIC `ENVELOPE` statement. Returns null on malformed input. */
export function parseEnvelope(line: string): Envelope | null {
  const v = parseStatement(line, "ENVELOPE", 14);
  if (!v) return null;
  return {
    n: v[0]!, t: v[1]!,
    pi1: v[2]!, pi2: v[3]!, pi3: v[4]!,
    pn1: v[5]!, pn2: v[6]!, pn3: v[7]!,
    aa: v[8]!, ad: v[9]!, as: v[10]!, ar: v[11]!,
    ala: v[12]!, ald: v[13]!,
  };
}

/** Parse a BBC BASIC `SOUND` statement. Returns null on malformed input. */
export function parseSound(line: string): { channel: number; amplitude: number; pitch: number; duration: number } | null {
  const v = parseStatement(line, "SOUND", 4);
  if (!v) return null;
  return { channel: v[0]!, amplitude: v[1]!, pitch: v[2]!, duration: v[3]! };
}

// MOS 1.20 pitch lookup tables ($EDFB and $EE07).
// pitchLookupHigh packs two things: the low 2 bits give bits [9:8] of the
// divider, and the top nybble gives the per-quarter-tone delta to subtract
// for the fractional semitone interpolation.
const PITCH_LOW =  [0xF0, 0xB7, 0x82, 0x4F, 0x20, 0xF3, 0xC8, 0xA0, 0x7B, 0x57, 0x35, 0x16];
const PITCH_HIGH = [0xE7, 0xD7, 0xCB, 0xC3, 0xB7, 0xAA, 0xA2, 0x9A, 0x92, 0x8A, 0x82, 0x7A];

/**
 * Map a BBC pitch byte (0..255) to Hz, replicating the MOS 1.20 algorithm
 * (see Toby Lobster's disassembly §16). Octaves are produced by integer
 * right-shifts of the 10-bit divider, which causes the BBC's tuning to drift
 * slightly sharp of equal temperament in higher octaves — that quirk is
 * what we want to reproduce so playback matches the real machine.
 */
export function pitchToHz(pitch: number): number {
  const p = clamp(pitch, 0, 255) | 0;
  const fractional = p & 3;
  let count = p >> 2;
  let octave = 0;
  while (count >= 12) {
    octave += 1;
    count -= 12;
  }
  const low = PITCH_LOW[count]!;
  const high = PITCH_HIGH[count]!;
  const baseDivider = ((high & 0x03) << 8) | low;
  const fractionalDelta = (high & 0xf0) >> 4;
  let divider = baseDivider - fractional * fractionalDelta;
  for (let i = 0; i < octave; i++) divider = divider >> 1;
  if (divider < 1) divider = 1;
  return 4_000_000 / (32 * divider);
}
