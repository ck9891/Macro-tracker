import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LM } from "./exercisePoseAnalysis.js";

/** Minimum landmark visibility (0–1) to accept a bar proxy sample */
const MIN_WRIST_VIS = 0.35;

/** Mirrored normalized coords: x left→right as on the selfie preview, y top→bottom */
export type BarPathNormPoint = { nx: number; ny: number };

export type BarPathPixelPoint = { x: number; y: number };

/**
 * Approximates bar position as the midpoint between wrists (works when both hands grip the bar).
 * Coordinates are in mirrored-normalized space matching the flipped canvas overlay.
 */
export function barProxyNormalized(landmarks: NormalizedLandmark[]): BarPathNormPoint | null {
  const lw = landmarks[LM.leftWrist];
  const rw = landmarks[LM.rightWrist];
  if (lw.visibility < MIN_WRIST_VIS || rw.visibility < MIN_WRIST_VIS) {
    return null;
  }
  const cx = (lw.x + rw.x) / 2;
  const cy = (lw.y + rw.y) / 2;
  return { nx: 1 - cx, ny: cy };
}

export function toCanvasPoint(p: BarPathNormPoint, w: number, h: number): BarPathPixelPoint {
  return { x: p.nx * w, y: p.ny * h };
}

const MAX_TRAIL = 120;

export function pushBarPathSample(trail: BarPathNormPoint[], sample: BarPathNormPoint | null): void {
  if (!sample) return;
  trail.push(sample);
  while (trail.length > MAX_TRAIL) trail.shift();
}

export function clearBarPathTrail(trail: BarPathNormPoint[]): void {
  trail.length = 0;
}

/**
 * Standard deviation of mirrored-x over the last `window` samples, in normalized units (0–1 scale).
 * Larger ≈ more side-to-side movement in frame.
 */
export function lateralSpreadNorm(trail: BarPathNormPoint[], windowSize: number): number | null {
  if (trail.length < 6) return null;
  const slice = trail.slice(-Math.min(windowSize, trail.length));
  const xs = slice.map((p) => p.nx);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export function drawBarPathOnCanvas(
  ctx: CanvasRenderingContext2D,
  trail: BarPathNormPoint[],
  w: number,
  h: number,
): void {
  if (trail.length < 2) return;
  const pts = trail.map((p) => toCanvasPoint(p, w, h));
  ctx.save();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.88)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(251, 191, 36, 0.35)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  const last = pts[pts.length - 1];
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function barPathCue(spreadNorm: number | null, exerciseUsesBar: boolean): string | null {
  if (spreadNorm == null) return null;
  const pct = spreadNorm * 100;
  if (pct < 5) return null;
  if (exerciseUsesBar) {
    return `Wrist midpoint drifting ~${pct.toFixed(0)}% of frame width — aim for a straighter vertical path.`;
  }
  return `Hands drifting ~${pct.toFixed(0)}% sideways — optional path overlay is most useful with a bar.`;
}
