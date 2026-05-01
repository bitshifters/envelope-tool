import type { Sample } from "./envelope";

const PHASE_COLOURS: Record<Sample["phase"], string> = {
  attack: "#4ea8de",
  decay: "#56cfe1",
  sustain: "#80ffdb",
  release: "#ff8fa3",
};

export function render(canvas: HTMLCanvasElement, samples: Sample[]): void {
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
  ctx.fillText(`Pitch offset (steps)  —  ${samples.length} centiseconds`, padding, pitchTop - 6);

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

  // Pitch plot. Auto-scale to symmetric range around 0 with at least ±4 visible.
  let minP = 0, maxP = 0;
  for (const s of samples) {
    if (s.pitchOffset < minP) minP = s.pitchOffset;
    if (s.pitchOffset > maxP) maxP = s.pitchOffset;
  }
  const range = Math.max(4, Math.abs(minP), Math.abs(maxP));
  const pitchY = (p: number) => pitchTop + halfH / 2 - (p / range) * (halfH / 2);

  // Zero line.
  ctx.strokeStyle = "#30363d";
  ctx.beginPath();
  ctx.moveTo(padding, pitchY(0));
  ctx.lineTo(padding + plotW, pitchY(0));
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  for (let i = 0; i < samples.length; i++) {
    const x = xFor(i);
    const y = pitchY(samples[i]!.pitchOffset);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
