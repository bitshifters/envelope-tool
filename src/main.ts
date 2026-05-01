import "./style.css";
import {
  DEFAULT_ENVELOPE,
  expand,
  formatBasic,
  formatSound,
  parseEnvelope,
  parseSound,
  type Envelope,
} from "./envelope";
import { render } from "./visualizer";
import { audioContextIsRunning, play, playheadFraction, stop } from "./audio";
import { PRESETS, type Preset } from "./presets";

interface FieldSpec {
  key: keyof Envelope;
  code: string;   // BBC parameter mnemonic
  label: string;  // human-readable description
  min: number;
  max: number;
  hint?: string;
}

const PITCH_FIELDS: FieldSpec[] = [
  { key: "t",   code: "T",   label: "Step length",   min: 0,    max: 255, hint: "duration of each pitch step in 1/100 s. T=1..127 auto-repeats the pitch envelope; T=128..255 single sweep (holds final pitch)." },
  { key: "pi1", code: "PI1", label: "Section 1 Δ",   min: -128, max: 127, hint: "pitch change per step in section 1" },
  { key: "pn1", code: "PN1", label: "Section 1 steps", min: 0,  max: 255, hint: "number of steps in section 1" },
  { key: "pi2", code: "PI2", label: "Section 2 Δ",   min: -128, max: 127, hint: "pitch change per step in section 2" },
  { key: "pn2", code: "PN2", label: "Section 2 steps", min: 0,  max: 255, hint: "number of steps in section 2" },
  { key: "pi3", code: "PI3", label: "Section 3 Δ",   min: -128, max: 127, hint: "pitch change per step in section 3" },
  { key: "pn3", code: "PN3", label: "Section 3 steps", min: 0,  max: 255, hint: "number of steps in section 3" },
];

const AMP_FIELDS: FieldSpec[] = [
  { key: "aa",  code: "AA",  label: "Attack rate",         min: -127, max: 127, hint: "amplitude change per centisecond during attack" },
  { key: "ala", code: "ALA", label: "Attack peak level",   min: 0,    max: 126, hint: "level reached at end of attack" },
  { key: "ad",  code: "AD",  label: "Decay rate",          min: -127, max: 127, hint: "amplitude change per centisecond during decay" },
  { key: "ald", code: "ALD", label: "Sustain start level", min: 0,    max: 126, hint: "level at end of decay (start of sustain)" },
  { key: "as",  code: "AS",  label: "Sustain rate",        min: -127, max: 127, hint: "amplitude change per centisecond during sustain (until SOUND duration ends)" },
  { key: "ar",  code: "AR",  label: "Release rate",        min: -127, max: 127, hint: "amplitude change per centisecond during release; usually negative" },
];

const ENV_FIELDS: FieldSpec[] = [...PITCH_FIELDS, ...AMP_FIELDS];

interface SoundParams {
  channel: number;
  amplitude: number;
  pitch: number;
  duration: number;
}

const DEFAULT_SOUND: SoundParams = { channel: 1, amplitude: 1, pitch: 100, duration: 20 };

const SOUND_FIELDS: { key: keyof SoundParams; code: string; label: string; min: number; max: number; hint: string }[] = [
  { key: "channel",   code: "C", label: "Channel",   min: 1, max: 3,   hint: "1..3 = tone (channel 0 noise is not supported by this tool)" },
  { key: "amplitude", code: "A", label: "Amplitude", min: 1, max: 4,   hint: "1..4 selects envelope number (negative static volumes are not supported by this tool)" },
  { key: "pitch",     code: "P", label: "Pitch",     min: 0, max: 255, hint: "4 units per semitone, 48 per octave" },
  { key: "duration",  code: "D", label: "Duration",  min: 1, max: 255, hint: "in 1/20 s" },
];

const env: Envelope = { ...DEFAULT_ENVELOPE };
const sound: SoundParams = { ...DEFAULT_SOUND };

// Capture before refresh() rewrites the URL via history.replaceState (which
// strips presence-only params like `play`).
const autoplayRequested = new URLSearchParams(location.search).has("play");
loadFromUrlParams();

const canvas = document.getElementById("viz") as HTMLCanvasElement;
const envelopeLine = document.getElementById("envelope-line") as HTMLInputElement;
const soundLine = document.getElementById("sound-line") as HTMLInputElement;
const envNInput = document.getElementById("env-n") as HTMLInputElement;
const pitchGrid = document.getElementById("pitch-grid") as HTMLElement;
const ampGrid = document.getElementById("amp-grid") as HTMLElement;
const soundGrid = document.getElementById("sound-grid") as HTMLElement;

const envInputs = new Map<keyof Envelope, HTMLInputElement>();
const soundInputs = new Map<keyof SoundParams, HTMLInputElement>();

/**
 * Refresh derived UI: visualisation and the BASIC text fields.
 *
 * `skipLine` lets us avoid stomping the BASIC field that the user is
 * currently typing in — we still want to update the parameter inputs and the
 * canvas, but writing back a re-formatted version of the same statement
 * mid-edit moves the caret and feels broken.
 */
let currentSamples: ReturnType<typeof expand> = [];
let playheadRaf: number | null = null;

/**
 * Keep env.n and sound.amplitude in lockstep — the BBC SOUND command's
 * amplitude argument selects which envelope to apply, so for the tool's
 * purposes they should always match. Updates both DOM inputs as well.
 */
function setEnvelopeNumber(n: number): void {
  const c = Math.max(1, Math.min(4, Math.round(n)));
  env.n = c;
  sound.amplitude = c;
  envNInput.value = String(c);
  const ampInput = soundInputs.get("amplitude");
  if (ampInput) ampInput.value = String(c);
}

function refresh(skipLine?: "envelope" | "sound"): void {
  currentSamples = expand(env, sound.amplitude, sound.duration);
  render(canvas, currentSamples, sound.pitch, playheadFraction());
  if (skipLine !== "envelope") envelopeLine.value = formatBasic(env);
  if (skipLine !== "sound") soundLine.value = formatSound(sound.channel, sound.amplitude, sound.pitch, sound.duration);
  updateUrlParams();
  // Any state change clears the active preset; loadPreset re-sets it after
  // its own refresh() call.
  setActivePreset(null);
}

/**
 * Reflect the current envelope + sound state into the URL query string so
 * the page can be shared. Uses history.replaceState (no new history entry
 * per keystroke). Format mirrors the BASIC syntax: `?env=N,T,...&sound=C,A,P,D`.
 */
function updateUrlParams(): void {
  const envValues = [env.n, env.t, env.pi1, env.pi2, env.pi3, env.pn1, env.pn2, env.pn3,
                     env.aa, env.ad, env.as, env.ar, env.ala, env.ald].join(",");
  const soundValues = [sound.channel, sound.amplitude, sound.pitch, sound.duration].join(",");
  const params = new URLSearchParams({ env: envValues, sound: soundValues });
  history.replaceState(null, "", `?${params.toString()}`);
}

/**
 * Parse env/sound from the URL query string on page load. Anything missing
 * or malformed is silently ignored — defaults stay in place.
 */
function loadFromUrlParams(): void {
  const params = new URLSearchParams(location.search);
  const envStr = params.get("env");
  if (envStr) {
    const parsed = parseEnvelope(envStr);
    if (parsed) Object.assign(env, parsed);
  }
  const soundStr = params.get("sound");
  if (soundStr) {
    const parsed = parseSound(soundStr);
    if (parsed) Object.assign(sound, parsed);
  }
}

function animatePlayhead(): void {
  if (playheadRaf !== null) return;
  const tick = () => {
    const f = playheadFraction();
    render(canvas, currentSamples, sound.pitch, f);
    if (f === null) {
      playheadRaf = null;
      return;
    }
    playheadRaf = requestAnimationFrame(tick);
  };
  playheadRaf = requestAnimationFrame(tick);
}

function makeNumberField(
  parent: HTMLElement,
  label: string,
  code: string,
  hint: string | undefined,
  min: number,
  max: number,
  initial: number,
  onChange: (n: number) => void,
): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  if (hint) wrap.title = hint;
  const lbl = document.createElement("span");
  lbl.className = "field-label";
  const name = document.createElement("span");
  name.className = "field-name";
  name.textContent = label;
  const codeEl = document.createElement("code");
  codeEl.className = "field-code";
  codeEl.textContent = code;
  lbl.append(name, codeEl);
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = String(initial);
  input.addEventListener("input", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(n);
  });
  wrap.appendChild(lbl);
  wrap.appendChild(input);
  parent.appendChild(wrap);
  return input;
}

const populateEnvFields = (parent: HTMLElement, fields: FieldSpec[]) => {
  for (const f of fields) {
    const input = makeNumberField(parent, f.label, f.code, f.hint, f.min, f.max, env[f.key] as number, (n) => {
      (env as unknown as Record<string, number>)[f.key] = n;
      refresh();
    });
    envInputs.set(f.key, input);
  }
};
populateEnvFields(pitchGrid, PITCH_FIELDS);
populateEnvFields(ampGrid, AMP_FIELDS);

for (const f of SOUND_FIELDS) {
  const input = makeNumberField(soundGrid, f.label, f.code, f.hint, f.min, f.max, sound[f.key], (n) => {
    if (f.key === "amplitude") {
      setEnvelopeNumber(n);
    } else {
      sound[f.key] = n;
    }
    refresh();
  });
  soundInputs.set(f.key, input);
}

// Enforce env.n === sound.amplitude after the inputs are constructed (URL
// load may have populated mismatched values; treat sound.amplitude as the
// authoritative side since it's what selects the envelope at playback).
setEnvelopeNumber(sound.amplitude);
envNInput.addEventListener("input", () => {
  const n = Number(envNInput.value);
  if (!Number.isFinite(n)) return;
  setEnvelopeNumber(n);
  refresh();
});

envelopeLine.addEventListener("input", () => {
  const parsed = parseEnvelope(envelopeLine.value);
  if (!parsed) {
    envelopeLine.classList.add("invalid");
    return;
  }
  envelopeLine.classList.remove("invalid");
  Object.assign(env, parsed);
  setEnvelopeNumber(env.n);
  for (const f of ENV_FIELDS) {
    const input = envInputs.get(f.key);
    if (input) input.value = String(env[f.key]);
  }
  refresh("envelope");
});

soundLine.addEventListener("input", () => {
  const parsed = parseSound(soundLine.value);
  if (!parsed) {
    soundLine.classList.add("invalid");
    return;
  }
  soundLine.classList.remove("invalid");
  Object.assign(sound, parsed);
  setEnvelopeNumber(sound.amplitude);
  for (const f of SOUND_FIELDS) {
    const input = soundInputs.get(f.key);
    if (input) input.value = String(sound[f.key]);
  }
  refresh("sound");
});

const presetButtons: HTMLButtonElement[] = [];

function setActivePreset(idx: number | null): void {
  for (let i = 0; i < presetButtons.length; i++) {
    presetButtons[i]!.classList.toggle("active", i === idx);
  }
}

function loadPreset(p: Preset, idx: number): void {
  Object.assign(env, p.env);
  Object.assign(sound, p.sound);
  setEnvelopeNumber(sound.amplitude);
  for (const f of ENV_FIELDS) {
    const input = envInputs.get(f.key);
    if (input) input.value = String(env[f.key]);
  }
  for (const f of SOUND_FIELDS) {
    const input = soundInputs.get(f.key);
    if (input) input.value = String(sound[f.key]);
  }
  envelopeLine.classList.remove("invalid");
  soundLine.classList.remove("invalid");
  refresh();
  setActivePreset(idx);
}

const presetsContainer = document.getElementById("presets") as HTMLElement;
PRESETS.forEach((p, idx) => {
  const btn = document.createElement("button");
  btn.className = "preset-btn";
  btn.type = "button";
  btn.textContent = p.name;
  btn.title = p.description;
  btn.addEventListener("click", () => loadPreset(p, idx));
  presetsContainer.appendChild(btn);
  presetButtons.push(btn);
});

document.getElementById("play")!.addEventListener("click", () => {
  play(currentSamples, sound.pitch);
  animatePlayhead();
});

document.getElementById("stop")!.addEventListener("click", () => {
  stop();
  if (playheadRaf !== null) {
    cancelAnimationFrame(playheadRaf);
    playheadRaf = null;
  }
  render(canvas, currentSamples, sound.pitch, null);
});

document.getElementById("share-link")!.addEventListener("click", async (e) => {
  // Build a URL that reproduces current state and triggers autoplay on land.
  // location.search already has the live env/sound params (refresh keeps it
  // in sync); we just append the presence-only `play`.
  const search = location.search ? `${location.search}&play` : "?play";
  const shareUrl = `${location.origin}${location.pathname}${search}`;
  const btn = e.currentTarget as HTMLButtonElement;
  const originalText = btn.textContent;
  try {
    await navigator.clipboard.writeText(shareUrl);
    btn.textContent = "Copied!";
  } catch {
    // Fallback: prompt so the user can copy manually.
    window.prompt("Share URL:", shareUrl);
    return;
  }
  setTimeout(() => { btn.textContent = originalText; }, 1500);
});

document.getElementById("run-emulator")!.addEventListener("click", () => {
  // jsbeeb (bbc.xania.org) takes URL-encoded BASIC via embedBasic, with
  // &autorun to type RUN after tokenising. Two numbered lines are enough:
  // ENVELOPE registers the envelope, SOUND queues the note.
  const program = `10 ${formatBasic(env)}\n20 ${formatSound(sound.channel, sound.amplitude, sound.pitch, sound.duration)}\n`;
  const url = `https://bbc.xania.org/?embedBasic=${encodeURIComponent(program)}&autorun`;
  window.open(url, "_blank", "noopener,noreferrer");
});

for (const btn of document.querySelectorAll<HTMLButtonElement>(".copy-btn")) {
  btn.addEventListener("click", async () => {
    const targetId = btn.dataset["copy"];
    if (!targetId) return;
    const target = document.getElementById(targetId) as HTMLInputElement | null;
    if (!target) return;
    const text = target.value ?? target.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1200);
    } catch {
      target.select();
    }
  });
}

refresh();

// `?play` (presence-only) starts playback automatically. Modern browsers
// block AudioContext.resume() outside of a user gesture, so we both try
// immediately AND attach a one-time fallback that fires on the first user
// interaction. The fallback no-ops if the immediate attempt already kicked
// audio into the running state.
if (autoplayRequested) {
  play(currentSamples, sound.pitch);
  animatePlayhead();
  const playOnGesture = (): void => {
    if (!audioContextIsRunning()) {
      play(currentSamples, sound.pitch);
      animatePlayhead();
    }
    document.removeEventListener("click", playOnGesture);
    document.removeEventListener("keydown", playOnGesture);
  };
  document.addEventListener("click", playOnGesture);
  document.addEventListener("keydown", playOnGesture);
}
