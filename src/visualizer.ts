import type { Sample } from "./envelope";

const PHASE_COLOURS: Record<Sample["phase"], string> = {
  attack: "#4ea8de",
  decay: "#56cfe1",
  sustain: "#80ffdb",
  release: "#ff8fa3",
};

export function render(
  canvas: HTMLCanvasElement,
  samples: Sample[],
  basePitch: number,
  playhead: number | null = null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, width, height);

  if (samples.length === 0) return;

  const padding = 24;
  const plotW = width - padding * 2;
  const halfH = (height - padding * 3) / 2;

  const ampTop = padding;
  const pitchTop = padding * 2 + halfH;

  // Axes.
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, ampTop, plotW, halfH);
  ctx.strokeRect(padding, pitchTop, plotW, halfH);

  ctx.fillStyle = "#8b949e";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Amplitude (0..126)", padding, ampTop - 6);
  ctx.fillText(`Pitch (BBC units, 4 = 1 semitone)  —  ${samples.length} centiseconds`, padding, pitchTop - 6);

  const xFor = (i: number) =>
    padding + (samples.length === 1 ? 0 : (i / (samples.length - 1)) * plotW);

  // Amplitude plot, coloured per phase.
  let prevPhase: Sample["phase"] | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.phase !== prevPhase) {
      if (prevPhase !== null) ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = PHASE_COLOURS[s.phase];
      ctx.lineWidth = 2;
      const x = xFor(i);
      const y = ampTop + halfH - (s.amplitude / 126) * halfH;
      ctx.moveTo(x, y);
      prevPhase = s.phase;
    } else {
      const x = xFor(i);
      const y = ampTop + halfH - (s.amplitude / 126) * halfH;
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Pitch plot: absolute BBC pitch (basePitch + envelope offset). Auto-scale
  // around the base pitch with at least one semitone of headroom each side
  // and snap to semitone boundaries so gridlines land cleanly.
  let minP = basePitch, maxP = basePitch;
  for (const s of samples) {
    const p = basePitch + s.pitchOffset;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  const headroom = Math.max(4, Math.round((maxP - minP) * 0.15));
  minP = Math.floor((minP - headroom) / 4) * 4;
  maxP = Math.ceil((maxP + headroom) / 4) * 4;
  if (maxP === minP) maxP = minP + 4;

  const pitchY = (p: number) => pitchTop + halfH - ((p - minP) / (maxP - minP)) * halfH;

  // Semitone gridlines (light) and octave gridlines (stronger, labelled).
  for (let p = Math.ceil(minP / 4) * 4; p <= maxP; p += 4) {
    ctx.strokeStyle = p % 48 === 0 ? "#30363d" : "#1c2128";
    ctx.beginPath();
    ctx.moveTo(padding, pitchY(p));
    ctx.lineTo(padding + plotW, pitchY(p));
    ctx.stroke();
    if (p % 48 === 0) {
      ctx.fillStyle = "#6e7681";
      ctx.fillText(String(p), padding + 4, pitchY(p) - 2);
    }
  }

  // Base pitch reference line (dashed).
  ctx.strokeStyle = "#56cfe1";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(padding, pitchY(basePitch));
  ctx.lineTo(padding + plotW, pitchY(basePitch));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#56cfe1";
  ctx.fillText(`base ${basePitch}`, padding + plotW - 60, pitchY(basePitch) - 2);

  // Pitch trajectory.
  ctx.beginPath();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  for (let i = 0; i < samples.length; i++) {
    const x = xFor(i);
    const y = pitchY(basePitch + samples[i]!.pitchOffset);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (playhead !== null && playhead >= 0 && playhead <= 1) {
    const x = padding + playhead * plotW;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, ampTop);
    ctx.lineTo(x, ampTop + halfH);
    ctx.moveTo(x, pitchTop);
    ctx.lineTo(x, pitchTop + halfH);
    ctx.stroke();
  }
}
