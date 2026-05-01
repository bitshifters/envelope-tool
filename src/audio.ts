import { pitchToHz, type Sample } from "./envelope";

const CS = 0.01; // one centisecond, in seconds

let ctx: AudioContext | null = null;
let activeNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
let playStart: number | null = null;
let playDuration: number | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}

/**
 * Play a sample stream as if produced by SOUND with the given base pitch.
 * The visualiser and the audio engine consume the same `samples` array, so
 * what you see is what you hear.
 */
export function play(samples: Sample[], basePitch: number): void {
  stop();
  if (samples.length === 0) return;
  const ac = getCtx();
  if (ac.state === "suspended") ac.resume();

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square"; // closer to the BBC's tonal character than sine
  osc.connect(gain).connect(ac.destination);

  const t0 = ac.currentTime + 0.02;
  gain.gain.setValueAtTime(0, t0);
  osc.frequency.setValueAtTime(pitchToHz(basePitch + samples[0]!.pitchOffset), t0);

  for (let i = 0; i < samples.length; i++) {
    const t = t0 + i * CS;
    const s = samples[i]!;
    // BBC amplitude 0..126 -> linear gain 0..0.4 (leave headroom).
    gain.gain.setValueAtTime((s.amplitude / 126) * 0.4, t);
    osc.frequency.setValueAtTime(pitchToHz(basePitch + s.pitchOffset), t);
  }

  const tEnd = t0 + samples.length * CS;
  gain.gain.setValueAtTime(0, tEnd);
  osc.start(t0);
  osc.stop(tEnd + 0.05);

  activeNodes = { osc, gain };
  playStart = t0;
  playDuration = samples.length * CS;
  osc.onended = () => {
    // Only clear shared playback state if this osc is still the active one;
    // otherwise a freshly-started note would have its timing wiped when the
    // previously-stopped osc's onended fired late.
    if (activeNodes && activeNodes.osc === osc) {
      activeNodes = null;
      playStart = null;
      playDuration = null;
    }
  };
}

export function stop(): void {
  if (!activeNodes) return;
  try {
    activeNodes.osc.stop();
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
