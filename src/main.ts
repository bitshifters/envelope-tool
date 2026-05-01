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
import { play, stop } from "./audio";

interface FieldSpec {
  key: keyof Envelope;
  label: string;
  min: number;
  max: number;
  hint?: string;
}

const ENV_FIELDS: FieldSpec[] = [
  { key: "t",   label: "T",   min: 0,    max: 255, hint: "step length (1/100s); +128 to repeat" },
  { key: "pi1", label: "PI1", min: -128, max: 127, hint: "pitch Δ/step, section 1" },
  { key: "pi2", label: "PI2", min: -128, max: 127, hint: "pitch Δ/step, section 2" },
  { key: "pi3", label: "PI3", min: -128, max: 127, hint: "pitch Δ/step, section 3" },
  { key: "pn1", label: "PN1", min: 0,    max: 255, hint: "steps in section 1" },
  { key: "pn2", label: "PN2", min: 0,    max: 255, hint: "steps in section 2" },
  { key: "pn3", label: "PN3", min: 0,    max: 255, hint: "steps in section 3" },
  { key: "aa",  label: "AA",  min: -127, max: 127, hint: "attack rate (level Δ/cs)" },
  { key: "ad",  label: "AD",  min: -127, max: 127, hint: "decay rate" },
  { key: "as",  label: "AS",  min: -127, max: 127, hint: "sustain rate" },
  { key: "ar",  label: "AR",  min: -127, max: 127, hint: "release rate (usually negative)" },
  { key: "ala", label: "ALA", min: 0,    max: 126, hint: "attack target level" },
  { key: "ald", label: "ALD", min: 0,    max: 126, hint: "level at end of decay" },
];

interface SoundParams {
  channel: number;
  amplitude: number;
  pitch: number;
  duration: number;
}

const DEFAULT_SOUND: SoundParams = { channel: 1, amplitude: 1, pitch: 100, duration: 20 };

const SOUND_FIELDS: { key: keyof SoundParams; label: string; min: number; max: number; hint: string }[] = [
  { key: "channel",   label: "Channel",   min: 0,   max: 3,   hint: "0=noise, 1..3=tone" },
  { key: "amplitude", label: "Amplitude", min: -15, max: 4,   hint: "-15..-1 static, 1..4 envelope #" },
  { key: "pitch",     label: "Pitch",     min: 0,   max: 255, hint: "4 units = 1 semitone" },
  { key: "duration",  label: "Duration",  min: 1,   max: 255, hint: "in 1/20 s" },
];

const env: Envelope = { ...DEFAULT_ENVELOPE };
const sound: SoundParams = { ...DEFAULT_SOUND };

const canvas = document.getElementById("viz") as HTMLCanvasElement;
const envelopeLine = document.getElementById("envelope-line") as HTMLInputElement;
const soundLine = document.getElementById("sound-line") as HTMLInputElement;
const envGrid = document.getElementById("envelope-grid") as HTMLElement;
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
function refresh(skipLine?: "envelope" | "sound"): void {
  const samples = expand(env, sound.amplitude, sound.duration);
  render(canvas, samples);
  if (skipLine !== "envelope") envelopeLine.value = formatBasic(env);
  if (skipLine !== "sound") soundLine.value = formatSound(sound.channel, sound.amplitude, sound.pitch, sound.duration);
}

function makeNumberField(
  parent: HTMLElement,
  label: string,
  hint: string | undefined,
  min: number,
  max: number,
  initial: number,
  onChange: (n: number) => void,
): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const lbl = document.createElement("span");
  lbl.className = "field-label";
  lbl.textContent = label;
  if (hint) lbl.title = hint;
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

for (const f of ENV_FIELDS) {
  const input = makeNumberField(envGrid, f.label, f.hint, f.min, f.max, env[f.key] as number, (n) => {
    (env as unknown as Record<string, number>)[f.key] = n;
    refresh();
  });
  envInputs.set(f.key, input);
}

for (const f of SOUND_FIELDS) {
  const input = makeNumberField(soundGrid, f.label, f.hint, f.min, f.max, sound[f.key], (n) => {
    sound[f.key] = n;
    refresh();
  });
  soundInputs.set(f.key, input);
}

envelopeLine.addEventListener("input", () => {
  const parsed = parseEnvelope(envelopeLine.value);
  if (!parsed) {
    envelopeLine.classList.add("invalid");
    return;
  }
  envelopeLine.classList.remove("invalid");
  Object.assign(env, parsed);
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
  for (const f of SOUND_FIELDS) {
    const input = soundInputs.get(f.key);
    if (input) input.value = String(sound[f.key]);
  }
  refresh("sound");
});

document.getElementById("play")!.addEventListener("click", () => {
  const samples = expand(env, sound.amplitude, sound.duration);
  play(samples, sound.pitch);
});

document.getElementById("stop")!.addEventListener("click", stop);

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
