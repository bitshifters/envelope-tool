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

// Noise buffer cache, keyed by `${type}:${rate}` and rebuilt per AudioContext.
let noiseBufferCache: { ctx: AudioContext; buffers: Map<string, AudioBuffer> } | null = null;

// BBC Micro feeds the SN76489 at 4 MHz. The TI datasheet documents the noise
// shift rate as clock/N where N ∈ {512, 1024, 2048} — i.e., the divisors are
// applied to the raw input clock (the chip's own /16 prescaler is implied
// in those numbers). High = ~7.8 kHz shift, low = ~1.95 kHz, which is what
// makes white noise actually sound like noise rather than crackle.
const BBC_CHIP_CLOCK_HZ = 4_000_000;
const NOISE_DIVISORS = [512, 1024, 2048] as const;

/**
 * Build a tiled mono AudioBuffer of the SN76489AN noise output for one
 * (type, rate) combination. We simulate a 15-bit LFSR — white feeds back the
 * XOR of bits 0 and 1, periodic feeds back bit 0 only (period 15 → the
 * characteristic BBC "drum" buzz). The LFSR is advanced sub-sample-accurately
 * with a fractional counter so the output is correct at any AudioContext rate.
 *
 * Two seconds is plenty: white noise loops imperceptibly, periodic loops at
 * ~30 Hz/8 Hz so two seconds easily contains a whole number of cycles.
 */
function buildNoiseBuffer(ac: AudioContext, mode: NoiseMode): AudioBuffer {
  const sampleRate = ac.sampleRate;
  const seconds = 2;
  const n = Math.floor(sampleRate * seconds);
  const buf = ac.createBuffer(1, n, sampleRate);
  const data = buf.getChannelData(0);

  // Rate 3 ("follows tone2") is punted to medium (rate 1).
  const rateIdx = mode.rate === 3 ? 1 : mode.rate;
  const shiftHz = BBC_CHIP_CLOCK_HZ / NOISE_DIVISORS[rateIdx]!;
  const shiftsPerSample = shiftHz / sampleRate;

  let lfsr = 0x4000;
  let phase = 0;
  let out = (lfsr & 1) === 1 ? 1 : -1;

  for (let i = 0; i < n; i++) {
    phase += shiftsPerSample;
    while (phase >= 1) {
      phase -= 1;
      const fb = mode.type === "white"
        ? (lfsr & 1) ^ ((lfsr >> 1) & 1)
        : (lfsr & 1);
      lfsr = ((lfsr >> 1) | (fb << 14)) & 0x7fff;
      if (lfsr === 0) lfsr = 0x4000; // guard against the trivial lock-up state
      out = (lfsr & 1) === 1 ? 1 : -1;
    }
    data[i] = out;
  }
  return buf;
}

function getNoiseBuffer(ac: AudioContext, mode: NoiseMode): AudioBuffer {
  if (!noiseBufferCache || noiseBufferCache.ctx !== ac) {
    noiseBufferCache = { ctx: ac, buffers: new Map() };
  }
  const key = `${mode.type}:${mode.rate}`;
  let buf = noiseBufferCache.buffers.get(key);
  if (!buf) {
    buf = buildNoiseBuffer(ac, mode);
    noiseBufferCache.buffers.set(key, buf);
  }
  return buf;
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/**
 * Map a BBC envelope amplitude (0..126) to an audible gain that follows the
 * SN76489's 4-bit attenuation register. The OS converts amp via a lookup
 * table that's effectively `att = 15 - floor(amp / 8)` — verified against
 * a real-BBC trace where AD=-10 produced attenuations 0,2,3,4,5,7,8,9,10,
 * 12,13,14,15. amp 0..7 maps to attenuation 15 (silent on chip).
 */
function bbcAmpToGain(amp: number): number {
  if (amp < 8) return 0;
  const att = 15 - Math.floor(amp / 8);
  // SN76489 attenuation step is 2 dB. Loudest = 0, silent = 15.
  return Math.pow(10, (-att * 2) / 20) * 0.4; // 0.4 = output headroom
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
    noiseSrc.buffer = getNoiseBuffer(ac, noiseMode);
    noiseSrc.loop = true;
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
