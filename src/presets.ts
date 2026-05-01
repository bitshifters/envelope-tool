import type { Envelope } from "./envelope";

export interface SoundPreset {
  channel: number;
  amplitude: number;
  pitch: number;
  duration: number;
}

export interface Preset {
  name: string;
  description: string;
  env: Envelope;
  sound: SoundPreset;
  /** True for envelopes that don't naturally terminate — sets the Hold
   *  checkbox so the audio keeps the envelope running indefinitely. */
  hold?: boolean;
}

// `T` in 1..127 auto-repeats the pitch envelope for the duration of the
// note; `T` in 128..255 (bit 7 set) is a single sweep that holds at the
// final pitch. Looping presets below use plain low T values.
export const PRESETS: Preset[] = [
  {
    name: "Piano",
    description: "Quick attack, gentle decay, slow fade through sustain",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -2, as: -1, ar: -10, ala: 126, ald: 80 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 40 },
  },
  {
    name: "Pluck",
    description: "Snappy string-like pluck",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -8, as: -1, ar: -20, ala: 126, ald: 40 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 30 },
  },
  {
    name: "Bell",
    description: "Sharp attack, long ringing decay",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -1, as: -1, ar: -8, ala: 126, ald: 110 },
    sound: { channel: 1, amplitude: 1, pitch: 130, duration: 80 },
  },
  {
    name: "Pad",
    description: "Slow rising drone",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 5, ad: -1, as: 0, ar: -3, ala: 100, ald: 90 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 100 },
  },
  {
    name: "Bass",
    description: "Punchy low-end thump",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 80, ad: -3, as: -1, ar: -15, ala: 110, ald: 70 },
    sound: { channel: 1, amplitude: 1, pitch: 60, duration: 30 },
  },
  {
    name: "Drum",
    description: "Short percussive hit",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -30, as: -20, ar: -30, ala: 126, ald: 40 },
    sound: { channel: 1, amplitude: 1, pitch: 30, duration: 5 },
  },
  {
    name: "Vibrato",
    description: "Looping ±½-semitone wobble around the note",
    env: { n: 1, t: 2, pi1: 1, pi2: -1, pi3: 1, pn1: 2, pn2: 4, pn3: 2,
           aa: 127, ad: -2, as: -1, ar: -10, ala: 126, ald: 100 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 60 },
  },
  {
    name: "Trill",
    description: "Looping alternation between two notes a whole step apart",
    env: { n: 1, t: 8, pi1: 8, pi2: -8, pi3: 0, pn1: 1, pn2: 1, pn3: 0,
           aa: 127, ad: -2, as: 0, ar: -10, ala: 126, ald: 100 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 60 },
  },
  {
    name: "Siren",
    description: "Looping octave sweep up and back down",
    env: { n: 1, t: 4, pi1: 2, pi2: -2, pi3: 0, pn1: 24, pn2: 24, pn3: 0,
           aa: 127, ad: -2, as: 0, ar: -2, ala: 126, ald: 100 },
    sound: { channel: 1, amplitude: 1, pitch: 80, duration: 80 },
  },
  {
    name: "Arpeggio",
    description: "Looping major triad: root → 3rd → 5th",
    env: { n: 1, t: 10, pi1: 16, pi2: 12, pi3: -28, pn1: 1, pn2: 1, pn3: 1,
           aa: 127, ad: -2, as: 0, ar: -10, ala: 126, ald: 100 },
    sound: { channel: 1, amplitude: 1, pitch: 80, duration: 100 },
  },
  {
    name: "Laser",
    description: "Fast downward pitch sweep — classic zap",
    env: { n: 1, t: 1, pi1: -12, pi2: -4, pi3: -1, pn1: 8, pn2: 8, pn3: 8,
           aa: 127, ad: -1, as: -2, ar: -30, ala: 126, ald: 100 },
    sound: { channel: 1, amplitude: 1, pitch: 200, duration: 20 },
  },
  {
    name: "Wobble",
    description: "Slow looping pitch wobble, sustained pad timbre",
    env: { n: 1, t: 12, pi1: 2, pi2: -2, pi3: 0, pn1: 4, pn2: 4, pn3: 0,
           aa: 20, ad: -1, as: 0, ar: -5, ala: 110, ald: 90 },
    sound: { channel: 1, amplitude: 1, pitch: 90, duration: 100 },
  },
  // Noise channel (channel 0) presets. The BBC's SN76489AN noise generator
  // takes only 3 bits of the SOUND P arg: bit 2 = type (0 periodic, 1 white),
  // bits 1..0 = LFSR shift rate (0 high, 1 medium, 2 low). T/PI/PN are
  // ignored on this channel so the envelope is purely amplitude-shaped.
  {
    name: "Noise: kick",
    description: "Channel 0 percussion — periodic noise at low shift rate gives a deep punchy thump",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -25, as: -10, ar: -40, ala: 126, ald: 30 },
    sound: { channel: 0, amplitude: 1, pitch: 2, duration: 6 },
  },
  {
    name: "Noise: snare",
    description: "Channel 0 percussion — white noise, medium rate, short sharp envelope",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -15, as: -8, ar: -20, ala: 126, ald: 60 },
    sound: { channel: 0, amplitude: 1, pitch: 5, duration: 8 },
  },
  {
    name: "Noise: hat",
    description: "Channel 0 percussion — white noise at high rate, very short",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -40, as: -30, ar: -60, ala: 126, ald: 30 },
    sound: { channel: 0, amplitude: 1, pitch: 4, duration: 3 },
  },
  {
    name: "Noise: cymbal",
    description: "Channel 0 percussion — white noise high rate with a long ringing tail",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -2, as: -3, ar: -2, ala: 126, ald: 100 },
    sound: { channel: 0, amplitude: 1, pitch: 4, duration: 40 },
  },
  {
    name: "Noise: bass buzz",
    description: "Channel 0 'periodic bass' trick — periodic noise low rate with the LFSR period producing a pitched buzz, sustained",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 60, ad: -1, as: 0, ar: -10, ala: 110, ald: 100 },
    sound: { channel: 0, amplitude: 1, pitch: 2, duration: 40 },
  },
  {
    name: "Noise: explosion",
    description: "Channel 0 — sustained white noise with slow decay, classic 8-bit explosion bed",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: -3, as: -2, ar: -4, ala: 126, ald: 80 },
    sound: { channel: 0, amplitude: 1, pitch: 6, duration: 30 },
  },
  // The presets below are sourced from disassemblies of classic BBC Micro
  // games. Each ENVELOPE row is the 14-byte sound chip configuration the
  // game uploads via OSWORD &08 or BASIC ENVELOPE. SOUND parameters are
  // chosen for sensible audition (the game's actual SOUND parameters are
  // often set programmatically and vary per invocation).
  {
    name: "Sentinel: tune",
    description: "The Sentinel (1986) — short looping tune note with a tiny pitch wobble",
    env: { n: 4, t: 2, pi1: 1, pi2: -1, pi3: 0, pn1: 1, pn2: 1, pn3: 8,
           aa: 120, ad: -1, as: 0, ar: -1, ala: 120, ald: 8 },
    sound: { channel: 1, amplitude: 4, pitch: 80, duration: 20 },
  },
  {
    name: "Sentinel: targeted",
    description: "The Sentinel (1986) — alarm when the player is being targeted; slow rising attack with looping ±6 quarter-tone oscillation",
    env: { n: 3, t: 1, pi1: 6, pi2: -6, pi3: 0, pn1: 1, pn2: 1, pn3: 0,
           aa: 1, ad: -1, as: 0, ar: 0, ala: 120, ald: 8 },
    sound: { channel: 1, amplitude: 3, pitch: 100, duration: 20 },
  },
  {
    name: "Sentinel: energy",
    description: "The Sentinel (1986) — energy-loss / bad-action sting; single-sweep pitch bend with a fast amplitude decay",
    env: { n: 4, t: 130, pi1: 1, pi2: -1, pi3: 0, pn1: 2, pn2: 1, pn3: 7,
           aa: 120, ad: -6, as: -2, ar: -2, ala: 120, ald: 0 },
    sound: { channel: 1, amplitude: 4, pitch: 144, duration: 20 },
  },
  {
    name: "Zalaga: active",
    description: "Zalaga (1983, Aardvark) — enemy-becoming-active sting; rising-then-falling pitch sweep over a long single shot",
    env: { n: 4, t: 130, pi1: 0, pi2: 2, pi3: -1, pn1: 3, pn2: 10, pn3: 70,
           aa: 6, ad: -1, as: -2, ar: -126, ala: 110, ald: 120 },
    sound: { channel: 1, amplitude: 4, pitch: 120, duration: 40 },
  },
  {
    name: "Elite: laser",
    description: "Elite (1984, Acornsoft / Braben & Bell) — pulse laser firing; envelope 1 from the cassette loader's E% table",
    env: { n: 1, t: 1, pi1: 0, pi2: 111, pi3: -8, pn1: 4, pn2: 1, pn3: 8,
           aa: 8, ad: -2, as: 0, ar: -1, ala: 112, ald: 44 },
    sound: { channel: 2, amplitude: 1, pitch: 0, duration: 16 },
  },
  {
    name: "Elite: hit",
    description: "Elite — hit by enemy laser fire; envelope 2 (also used for hyperspace)",
    env: { n: 2, t: 1, pi1: 14, pi2: -18, pi3: -1, pn1: 44, pn2: 32, pn3: 50,
           aa: 6, ad: 1, as: 0, ar: -2, ala: 120, ald: 126 },
    sound: { channel: 2, amplitude: 2, pitch: 44, duration: 8 },
  },
  {
    name: "Elite: ECM",
    description: "Elite — E.C.M. (Electronic Counter Measures) firing; envelope 4 with sweeping pitch over a long duration",
    env: { n: 4, t: 1, pi1: 4, pi2: -8, pi3: 44, pn1: 4, pn2: 6, pn3: 8,
           aa: 22, ad: 0, as: 0, ar: -127, ala: 126, ald: 0 },
    sound: { channel: 3, amplitude: 4, pitch: 194, duration: 80 },
  },
  {
    name: "Elite: explosion",
    description: "Elite — death / kill; SFX entry 24 in the cassette source — channel 0 white noise (P=7), originally static amp -15, duration 26",
    // Original: SOUND 0,-15,7,26. Converted to a flat-max envelope with a
    // hard release (AR=-127) so the noise cuts off cleanly when the SOUND
    // duration ends — mimicking the real chip's gate behaviour.
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: 0, as: 0, ar: -127, ala: 126, ald: 126 },
    sound: { channel: 0, amplitude: 1, pitch: 7, duration: 26 },
  },
  {
    name: "Elite: missile",
    description: "Elite — missile launch / ship launching from station; SFX entry 48 — channel 0 white noise (P=6), originally static amp -15",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: 0, as: 0, ar: -127, ala: 126, ald: 126 },
    sound: { channel: 0, amplitude: 1, pitch: 6, duration: 12 },
  },
  {
    name: "Elite: hyperspace",
    description: "Elite — hyperspace drive engaged; SFX entry 56 — channel 0 noise with envelope 2 (the same envelope used for laser hits) and pitch 96 (P&7 = 0 → periodic noise, high rate)",
    env: { n: 2, t: 1, pi1: 14, pi2: -18, pi3: -1, pn1: 44, pn2: 32, pn3: 50,
           aa: 6, ad: 1, as: 0, ar: -2, ala: 120, ald: 126 },
    sound: { channel: 0, amplitude: 2, pitch: 96, duration: 16 },
  },
  {
    name: "Chuckie: blip",
    description: "Chuckie Egg (1983, A&F / Alderton) — short percussive bleep used for collecting eggs and similar",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 126, ad: -50, as: 0, ar: 0, ala: 100, ald: 0 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 5 },
  },
  {
    name: "Thrust: gun",
    description: "Thrust (1986, Superior / Smith) — player's gun firing (envelope 1)",
    env: { n: 1, t: 2, pi1: -5, pi2: -3, pi3: -5, pn1: 2, pn2: 3, pn3: 50,
           aa: 126, ad: -7, as: -7, ar: -12, ala: 126, ald: 0 },
    sound: { channel: 2, amplitude: 1, pitch: 80, duration: 2 },
  },
  {
    name: "Thrust: hostile",
    description: "Thrust — hostile gun firing (envelope 4)",
    env: { n: 4, t: 1, pi1: -1, pi2: -1, pi3: -1, pn1: 18, pn2: 18, pn3: 18,
           aa: 50, ad: -12, as: -12, ar: -12, ala: 110, ald: 70 },
    sound: { channel: 3, amplitude: 4, pitch: 30, duration: 20 },
  },
  {
    name: "Thrust: orbit",
    description: "Thrust — entering orbit blip (envelope 3)",
    env: { n: 3, t: 4, pi1: 0, pi2: 0, pi3: 0, pn1: 1, pn2: 1, pn3: 1,
           aa: 126, ad: -4, as: -2, ar: -4, ala: 126, ald: 110 },
    sound: { channel: 2, amplitude: 3, pitch: 185, duration: 5 },
  },
  {
    name: "Thrust: engine",
    description: "Thrust — engine-thrust noise blip retriggered every frame while thrusting; channel 0 white noise medium rate (P=5), originally static amp -10",
    // Original sound block: $10,$00,$F6,$FF,$05,$00,$03,$00 → channel 0,
    // amp -10, pitch 5, duration 3. Converted to an envelope holding at
    // ~84/126 (the BBC level corresponding to static -10) for the duration.
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 127, ad: 0, as: 0, ar: -127, ala: 84, ald: 84 },
    sound: { channel: 0, amplitude: 1, pitch: 5, duration: 4 },
  },
  // Examples from the BBC Microcomputer User Guide chapter on SOUND/ENVELOPE.
  {
    name: "UG #1 wobble",
    description: "BBC User Guide example — slow attack with a looping ±5 semitone pitch wobble",
    env: { n: 2, t: 1, pi1: 2, pi2: -2, pi3: 2, pn1: 10, pn2: 20, pn3: 10,
           aa: 1, ad: 0, as: 0, ar: -1, ala: 100, ald: 100 },
    sound: { channel: 1, amplitude: 2, pitch: 100, duration: 80 },
  },
  {
    name: "UG #2 arp",
    description: "BBC User Guide example — slow rising arpeggio (T=25, three pitch sections climbing in semitones)",
    env: { n: 3, t: 25, pi1: 16, pi2: 12, pi3: 8, pn1: 1, pn2: 1, pn3: 1,
           aa: 10, ad: -10, as: 0, ar: -10, ala: 100, ald: 50 },
    sound: { channel: 1, amplitude: 3, pitch: 60, duration: 60 },
  },
  {
    name: "UG #3 pad",
    description: "BBC User Guide example — slow swelling pad with no pitch modulation",
    env: { n: 1, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 2, ad: 0, as: -10, ar: -5, ala: 120, ald: 0 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 80 },
  },
  {
    name: "UG #4 note",
    description: "BBC User Guide example — basic ADSR note shape, no pitch envelope",
    env: { n: 2, t: 3, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 121, ad: -10, as: -5, ar: -2, ala: 120, ald: 120 },
    sound: { channel: 1, amplitude: 2, pitch: 100, duration: 20 },
  },
  {
    name: "UG #5 rise",
    description: "BBC User Guide example — looped rising pitch over a sustained note",
    env: { n: 3, t: 7, pi1: 2, pi2: 1, pi3: 1, pn1: 1, pn2: 1, pn3: 1,
           aa: 121, ad: -10, as: -5, ar: -2, ala: 120, ald: 120 },
    sound: { channel: 1, amplitude: 3, pitch: 80, duration: 30 },
  },
  {
    name: "UG #6 blip",
    description: "BBC User Guide example — fast attack, held tone, very fast release (AR=-120)",
    env: { n: 4, t: 1, pi1: 0, pi2: 0, pi3: 0, pn1: 0, pn2: 0, pn3: 0,
           aa: 61, ad: 0, as: -10, ar: -120, ala: 120, ald: 0 },
    sound: { channel: 1, amplitude: 4, pitch: 100, duration: 15 },
  },
  {
    name: "UG #7 vibrato",
    description: "BBC User Guide example — looping ±¼-semitone pitch vibrato over an ADSR note",
    env: { n: 1, t: 8, pi1: 1, pi2: -1, pi3: 1, pn1: 1, pn2: 1, pn3: 1,
           aa: 121, ad: -10, as: -5, ar: -2, ala: 120, ald: 1 },
    sound: { channel: 1, amplitude: 1, pitch: 100, duration: 40 },
  },
  {
    name: "UG #8 sweep",
    description: "BBC User Guide example — large negative pitch deltas wrap the chip's 8-bit pitch register, producing a rapidly cycling sweep. Held loud (AA=127, AR=0) over a short SOUND duration so the wrapping pitch is the dominant feature.",
    env: { n: 1, t: 1, pi1: -26, pi2: -36, pi3: -45, pn1: 255, pn2: 255, pn3: 255,
           aa: 127, ad: 0, as: 0, ar: 0, ala: 126, ald: 0 },
    sound: { channel: 1, amplitude: 1, pitch: 1, duration: 1 },
    hold: true,
  },
  {
    name: "UG #9 ramp",
    description: "BBC User Guide example — three-section pitch envelope with large excursions (rise +100, drop -200, rise +200 per loop). Net +100 per loop produces an upward-drifting sweep over a long held-loud tone.",
    env: { n: 2, t: 3, pi1: 2, pi2: -4, pi3: 4, pn1: 50, pn2: 50, pn3: 50,
           aa: 127, ad: 0, as: 0, ar: 0, ala: 126, ald: 0 },
    sound: { channel: 1, amplitude: 2, pitch: 1, duration: 10 },
    hold: true,
  },
];
