import "./style.css";
import { DEFAULT_ENVELOPE, expand, formatBasic, type Envelope } from "./envelope";
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
  channel: number;   // 0..3
  amplitude: number; // -15..-1 (static) or 1..4 (envelope)
  pitch: number;     // 0..255
  duration: number;  // 1..255 in 1/20s, -1 means hold (treated as 100 here)
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
const basicLine = document.getElementById("basic-line") as HTMLElement;
const envGrid = document.getElementById("envelope-grid") as HTMLElement;
const soundGrid = document.getElementById("sound-grid") as HTMLElement;

function refresh(): void {
  const samples = expand(env, sound.amplitude, sound.duration);
  render(canvas, samples);
  basicLine.textContent = formatBasic(env);
}

function makeNumberField<T>(
  parent: HTMLElement,
  label: string,
  hint: string | undefined,
  min: number,
  max: number,
  initial: number,
  onChange: (n: number) => void,
): void {
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
  void (null as T | null);
}

for (const f of ENV_FIELDS) {
  makeNumberField(envGrid, f.label, f.hint, f.min, f.max, env[f.key] as number, (n) => {
    (env as unknown as Record<string, number>)[f.key] = n;
    refresh();
  });
}

for (const f of SOUND_FIELDS) {
  makeNumberField(soundGrid, f.label, f.hint, f.min, f.max, sound[f.key], (n) => {
    sound[f.key] = n;
    refresh();
  });
}

document.getElementById("play")!.addEventListener("click", () => {
  const samples = expand(env, sound.amplitude, sound.duration);
  play(samples, sound.pitch);
});

document.getElementById("stop")!.addEventListener("click", stop);

refresh();
