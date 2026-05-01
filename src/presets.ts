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
];
