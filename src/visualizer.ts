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

  // Identify contiguous runs of each ADSR phase so we can draw boundary
  // lines and per-phase labels.
  interface PhaseRun { phase: Sample["phase"]; startI: number; endI: number }
  const runs: PhaseRun[] = [];
  let runStart = 0;
  for (let i = 1; i <= samples.length; i++) {
    const ended = i === samples.length || samples[i]!.phase !== samples[runStart]!.phase;
    if (ended) {
      runs.push({ phase: samples[runStart]!.phase, startI: runStart, endI: i });
      runStart = i;
    }
  }

  // Phase boundary lines — dashed, spanning both plots so the user can read
  // the same region across amplitude and pitch.
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = "#30363d";
  for (let r = 1; r < runs.length; r++) {
    const x = xFor(runs[r]!.startI);
    ctx.beginPath();
    ctx.moveTo(x, ampTop);
    ctx.lineTo(x, ampTop + halfH);
    ctx.moveTo(x, pitchTop);
    ctx.lineTo(x, pitchTop + halfH);
    ctx.stroke();
  }
  ctx.setLineDash([]);

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

  // Phase labels at the top of the amp plot, one per region, in the
  // matching phase colour. Skip regions too narrow to fit a letter.
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const r of runs) {
    const x0 = xFor(r.startI);
    const x1 = xFor(Math.max(r.startI, r.endI - 1));
    if (x1 - x0 < 10) continue;
    const mid = (x0 + x1) / 2;
    ctx.fillStyle = "rgba(13, 17, 23, 0.75)";
    ctx.fillRect(mid - 7, ampTop + 2, 14, 14);
    ctx.fillStyle = PHASE_COLOURS[r.phase];
    ctx.fillText(r.phase[0]!.toUpperCase(), mid, ampTop + 4);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.font = "12px system-ui, sans-serif";

  // Pitch plot: absolute BBC pitch (basePitch + envelope offset, wrapped
  // mod 256 to match the BBC's single-byte pitch register). Auto-scale
  // around the actual pitches used with at least one semitone of headroom
  // each side, snapping to semitone boundaries.
  const wrappedPitch = (offset: number): number => (basePitch + offset) & 0xff;
  let minP = basePitch, maxP = basePitch;
  for (const s of samples) {
    const p = wrappedPitch(s.pitchOffset);
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
    const y = pitchY(wrappedPitch(samples[i]!.pitchOffset));
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
