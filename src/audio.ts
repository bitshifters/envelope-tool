import { pitchToHz, type NoiseMode, type Sample } from "./envelope";

const CS = 0.01; // one centisecond, in seconds

let ctx: AudioContext | null = null;
interface ActiveNodes {
  source: OscillatorNode | AudioBufferSourceNode;
  gain: GainNode;
}
let activeNodes: ActiveNodes | null = null;
let playStart: number | null = null;
let playDuration: number | null = null;

// BBC Micro feeds the SN76489 at 4 MHz. The TI datasheet documents the noise
// shift rate as clock/N where N ∈ {512, 1024, 2048} — i.e., the divisors are
// applied to the raw input clock (the chip's own /16 prescaler is implied
// in those numbers). High = ~7.8 kHz shift, low = ~1.95 kHz, which is what
// makes white noise actually sound like noise rather than crackle.
const BBC_CHIP_CLOCK_HZ = 4_000_000;
const NOISE_DIVISORS = [512, 1024, 2048] as const;

/**
 * Build a one-shot mono AudioBuffer covering the entire sample stream for the
 * noise channel. The MOS writes the running pitch byte to the noise control
 * register on every envelope tick, so the LFSR's type (white/periodic) and
 * shift rate evolve as PI/PN advance the pitch envelope. We mirror that here:
 * each centisecond of output is generated using the noise mode encoded in
 * (basePitch + sample.pitchOffset) & 7. P=3 / P=7 ("follows tone 2") are
 * punted to medium rate.
 *
 * LFSR algorithm matches jsbeeb (src/soundchip.js):
 *   white    — feedback = bit0 ^ bit1, shifted into bit 14 (15-bit LFSR)
 *   periodic — pure right shift, reload to 0x4000 (bit 14) when it reaches 0
 */
function buildNoiseBufferForStream(ac: AudioContext, samples: Sample[], basePitch: number): AudioBuffer {
  const sampleRate = ac.sampleRate;
  const seconds = samples.length * CS;
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const buf = ac.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);

  let lfsr = 0x4000;
  let phase = 0;
  let out = (lfsr & 1) === 1 ? 1 : -1;
  const samplesPerCs = sampleRate * CS;
  let prevCsIdx = -1;
  let prevModeP = -1;

  for (let i = 0; i < n; i++) {
    const csIdx = Math.min(samples.length - 1, Math.floor(i / samplesPerCs));
    const p = ((basePitch + samples[csIdx]!.pitchOffset) | 0) & 0x07;
    if (csIdx !== prevCsIdx) {
      // The MOS only writes the noise control register when the pitch byte
      // (low 3 bits) actually changes — env3 trace confirms: pure-volume
      // envelopes emit zero noise-register writes. jsbeeb's `noisePoked`
      // resets the LFSR to 0x4000 only on those writes. Mirror that: keep
      // LFSR running normally on flat-pitch envelopes (clean white noise),
      // and reset it whenever PI/PN advance the noise mode (gives the BBC's
      // characteristic warble for pitch-modulated effects like hyperspace).
      if (p !== prevModeP) {
        lfsr = 0x4000;
        phase = 0;
        out = (lfsr & 1) === 1 ? 1 : -1;
      }
      prevCsIdx = csIdx;
      prevModeP = p;
    }
    const isWhite = (p & 0x04) !== 0;
    const rateBits = p & 0x03;
    const rateIdx = rateBits === 3 ? 1 : rateBits;
    const shiftsPerSample = (BBC_CHIP_CLOCK_HZ / NOISE_DIVISORS[rateIdx]!) / sampleRate;

    phase += shiftsPerSample;
    while (phase >= 1) {
      phase -= 1;
      if (isWhite) {
        const fb = (lfsr & 1) ^ ((lfsr >> 1) & 1);
        lfsr = ((lfsr >> 1) | (fb << 14)) & 0x7fff;
      } else {
        lfsr = lfsr >> 1;
        if (lfsr === 0) lfsr = 0x4000;
      }
      out = (lfsr & 1) === 1 ? 1 : -1;
    }
    data[i] = out;
  }
  return buf;
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/**
 * Map a BBC envelope amplitude (0..126) to an audible gain via the MOS
 * `setChannelXVolume` conversion at $eb0a (Toby Lobster S-s16 §3):
 *
 *     SEC / SBC #$40 / LSR x3 / EOR #$0F     (low 4 bits → SN attenuation)
 *
 * The BBC's working amplitude is a SIGNED byte (`channel0Volume`) spanning
 * $C0 (silent) through $3F (loudest), wrapping through zero. Our model
 * tracks unsigned amp 0..126; the corresponding chanVol is `(amp - $3F)`
 * mod 256. This shifts each att band by one amp unit relative to the
 * naïve `att = 15 - floor(amp/8)` — small but byte-accurate against the
 * MOS algorithm. Note: there's evidence (env1 trace's skipped att values
 * 1, 6, 11) that the OS has additional non-linear logic on top of this
 * algorithm, not yet reverse-engineered.
 */
function bbcAmpToGain(amp: number): number {
  const chanVol = (amp - 0x3F) & 0xff;
  const att = (((chanVol - 0x40) & 0xff) >> 3) ^ 0x0f;
  const lowNibble = att & 0x0f;
  if (lowNibble >= 15) return 0;
  // SN76489 attenuation step is 2 dB. Loudest = 0, silent = 15.
  return Math.pow(10, (-lowNibble * 2) / 20) * 0.4; // 0.4 = output headroom
}

/**
 * Play a sample stream as if produced by SOUND with the given base pitch.
 * The visualiser and the audio engine consume the same `samples` array, so
 * what you see is what you hear.
 *
 * For tone channels (1..3) `basePitch` is the BBC pitch byte that PI/PN
 * offsets are added to. For the noise channel (0) `basePitch` is ignored
 * and `noiseMode` selects type + rate; the chip ignores PI/PN there.
 */
export function play(samples: Sample[], basePitch: number, noiseMode: NoiseMode | null = null): void {
  stop();
  if (samples.length === 0) return;
  const ac = getCtx();
  if (ac.state === "suspended") ac.resume();

  const gain = ac.createGain();
  let source: OscillatorNode | AudioBufferSourceNode;

  if (noiseMode) {
    const noiseSrc = ac.createBufferSource();
    // The noise buffer is rendered to match the sample stream exactly,
    // walking through whatever noise modes the running pitch byte selects
    // each centisecond. No looping — playback length matches the envelope.
    noiseSrc.buffer = buildNoiseBufferForStream(ac, samples, basePitch);
    noiseSrc.connect(gain).connect(ac.destination);
    source = noiseSrc;
  } else {
    const osc = ac.createOscillator();
    osc.type = "square"; // closer to the BBC's tonal character than sine
    osc.connect(gain).connect(ac.destination);
    source = osc;
  }

  const t0 = ac.currentTime + 0.02;
  gain.gain.setValueAtTime(0, t0);
  if (!noiseMode && source instanceof OscillatorNode) {
    source.frequency.setValueAtTime(pitchToHz(basePitch + samples[0]!.pitchOffset), t0);
  }

  for (let i = 0; i < samples.length; i++) {
    const t = t0 + i * CS;
    const s = samples[i]!;
    gain.gain.setValueAtTime(bbcAmpToGain(s.amplitude), t);
    if (!noiseMode && source instanceof OscillatorNode) {
      source.frequency.setValueAtTime(pitchToHz(basePitch + s.pitchOffset), t);
    }
  }

  const tEnd = t0 + samples.length * CS;
  gain.gain.setValueAtTime(0, tEnd);
  source.start(t0);
  source.stop(tEnd + 0.05);

  activeNodes = { source, gain };
  playStart = t0;
  playDuration = samples.length * CS;
  source.onended = () => {
    // Only clear shared playback state if this source is still the active
    // one; otherwise a freshly-started note would have its timing wiped
    // when the previously-stopped source's onended fired late.
    if (activeNodes && activeNodes.source === source) {
      activeNodes = null;
      playStart = null;
      playDuration = null;
    }
  };
}

export function stop(): void {
  if (!activeNodes) return;
  try {
    activeNodes.source.stop();
  } catch {
    // already stopped
  }
  activeNodes = null;
  playStart = null;
  playDuration = null;
}

/** True if the AudioContext exists and is actively producing audio. */
export function audioContextIsRunning(): boolean {
  return ctx?.state === "running";
}

/**
 * Fraction (0..1) of the way through the currently-playing note, or null
 * when nothing is playing. Used to drive the visualiser playhead.
 */
export function playheadFraction(): number | null {
  if (playStart === null || playDuration === null || !ctx) return null;
  const t = ctx.currentTime - playStart;
  if (t < 0) return 0;
  if (t >= playDuration) return null;
  return t / playDuration;
}
