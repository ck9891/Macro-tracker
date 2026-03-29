import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/** BlazePose body landmark indices used here */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type ExerciseKind = "squat" | "pushup";

/** Angle at vertex B between A–B–C, degrees (0–180). */
export function angleAt(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const d1 = Math.hypot(v1x, v1y);
  const d2 = Math.hypot(v2x, v2y);
  if (d1 < 1e-6 || d2 < 1e-6) return NaN;
  let cos = (v1x * v2x + v1y * v2y) / (d1 * d2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

function limbScore(hip: NormalizedLandmark, knee: NormalizedLandmark, ankle: NormalizedLandmark): number {
  return hip.visibility + knee.visibility + ankle.visibility;
}

function armScore(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
): number {
  return shoulder.visibility + elbow.visibility + wrist.visibility;
}

export function pickSquatAngle(landmarks: NormalizedLandmark[]): number {
  const L = landmarks;
  const left = limbScore(L[LM.leftHip], L[LM.leftKnee], L[LM.leftAnkle]);
  const right = limbScore(L[LM.rightHip], L[LM.rightKnee], L[LM.rightAnkle]);
  if (left >= right) {
    return angleAt(L[LM.leftHip], L[LM.leftKnee], L[LM.leftAnkle]);
  }
  return angleAt(L[LM.rightHip], L[LM.rightKnee], L[LM.rightAnkle]);
}

export function pickPushupAngle(landmarks: NormalizedLandmark[]): number {
  const L = landmarks;
  const left = armScore(L[LM.leftShoulder], L[LM.leftElbow], L[LM.leftWrist]);
  const right = armScore(L[LM.rightShoulder], L[LM.rightElbow], L[LM.rightWrist]);
  if (left >= right) {
    return angleAt(L[LM.leftShoulder], L[LM.leftElbow], L[LM.leftWrist]);
  }
  return angleAt(L[LM.rightShoulder], L[LM.rightElbow], L[LM.rightWrist]);
}

export type RepPhase = "idle" | "eccentric" | "bottom" | "concentric";

export type RepState = {
  reps: number;
  phase: RepPhase;
  lastAngle: number | null;
};

const SQUAT = { extended: 150, bottomEnter: 115, bottomExit: 125 } as const;
const PUSHUP = { extended: 145, bottomEnter: 105, bottomExit: 115 } as const;

export function updateRepState(
  kind: ExerciseKind,
  angleDeg: number,
  prev: RepState,
): RepState {
  const cfg = kind === "squat" ? SQUAT : PUSHUP;
  const next = { ...prev, lastAngle: angleDeg };

  if (!Number.isFinite(angleDeg)) {
    return next;
  }

  switch (prev.phase) {
    case "idle":
      if (angleDeg < cfg.extended - 5) {
        next.phase = "eccentric";
      }
      break;
    case "eccentric":
      if (angleDeg <= cfg.bottomEnter) {
        next.phase = "bottom";
      }
      break;
    case "bottom":
      if (angleDeg >= cfg.bottomExit) {
        next.phase = "concentric";
      }
      break;
    case "concentric":
      if (angleDeg >= cfg.extended) {
        next.reps += 1;
        next.phase = "idle";
      } else if (angleDeg <= cfg.bottomEnter) {
        next.phase = "bottom";
      }
      break;
    default:
      break;
  }

  return next;
}

export function formCue(kind: ExerciseKind, angleDeg: number, phase: RepPhase): string | null {
  if (!Number.isFinite(angleDeg)) {
    return "Step back until your full body is visible.";
  }
  if (kind === "squat") {
    if (phase === "bottom" && angleDeg > 120) {
      return "Try to sink a bit deeper — aim for hips near knee level.";
    }
    if (phase === "eccentric" && angleDeg < 90) {
      return "Strong — control the descent.";
    }
    return null;
  }
  if (kind === "pushup") {
    if (phase === "bottom" && angleDeg > 110) {
      return "Lower chest closer to the floor before pressing up.";
    }
    if (phase === "concentric" && angleDeg < 160) {
      return "Press all the way up to lock the elbows.";
    }
    return null;
  }
  return null;
}

/** Mirror normalized x for selfie-style preview */
export function mirrorLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  return landmarks.map((l) => ({ ...l, x: 1 - l.x }));
}
