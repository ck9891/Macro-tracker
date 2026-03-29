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

export type ExerciseKind = "squat" | "pushup" | "barbell_squat" | "deadlift" | "ohp";

/** Smaller angle = more flexed (knee/elbow). Used for squat, push-up, OHP, barbell squat (knee). */
export type FlexionRepModel = {
  kind: "flexion";
  extended: number;
  bottomEnter: number;
  bottomExit: number;
};

/** Larger angle = more folded forward (torso vs vertical). Used for deadlift hinge. */
export type TorsoFoldRepModel = {
  kind: "torso_fold";
  /** At or below: treat as upright / rep complete */
  uprightMax: number;
  /** At or above: bottom of pull */
  foldEnter: number;
  /** Hysteresis: leave bottom when angle <= this (still above upright) */
  foldExit: number;
};

export type RepModel = FlexionRepModel | TorsoFoldRepModel;

export const DEFAULT_REP_MODEL: Record<ExerciseKind, RepModel> = {
  squat: { kind: "flexion", extended: 150, bottomEnter: 115, bottomExit: 125 },
  pushup: { kind: "flexion", extended: 145, bottomEnter: 105, bottomExit: 115 },
  barbell_squat: { kind: "flexion", extended: 148, bottomEnter: 112, bottomExit: 122 },
  ohp: { kind: "flexion", extended: 152, bottomEnter: 98, bottomExit: 108 },
  deadlift: { kind: "torso_fold", uprightMax: 32, foldEnter: 52, foldExit: 44 },
};

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

/** Degrees between torso (hip→shoulder) and vertical (up). 0° = upright; larger = more hinged. */
export function pickTorsoHingeAngle(landmarks: NormalizedLandmark[]): number {
  const L = landmarks;
  const vis =
    L[LM.leftHip].visibility +
    L[LM.rightHip].visibility +
    L[LM.leftShoulder].visibility +
    L[LM.rightShoulder].visibility;
  if (vis < 1.5) return NaN;
  const hx = (L[LM.leftHip].x + L[LM.rightHip].x) / 2;
  const hy = (L[LM.leftHip].y + L[LM.rightHip].y) / 2;
  const sx = (L[LM.leftShoulder].x + L[LM.rightShoulder].x) / 2;
  const sy = (L[LM.leftShoulder].y + L[LM.rightShoulder].y) / 2;
  const dx = sx - hx;
  const dy = sy - hy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return NaN;
  const upy = -1;
  const dot = (-dy / len) * upy;
  const clamped = Math.max(-1, Math.min(1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

export type ExerciseMetric = {
  /** Primary value shown in the UI and used for reps */
  primary: number;
  /** Optional secondary (e.g. torso for barbell squat cues) */
  secondary: number | null;
};

export function measureExercise(kind: ExerciseKind, landmarks: NormalizedLandmark[]): ExerciseMetric {
  switch (kind) {
    case "squat":
    case "barbell_squat":
      return {
        primary: pickSquatAngle(landmarks),
        secondary: kind === "barbell_squat" ? pickTorsoHingeAngle(landmarks) : null,
      };
    case "pushup":
    case "ohp":
      return { primary: pickPushupAngle(landmarks), secondary: null };
    case "deadlift":
      return { primary: pickTorsoHingeAngle(landmarks), secondary: pickSquatAngle(landmarks) };
    default: {
      const _x: never = kind;
      return _x;
    }
  }
}

export function primaryMetricLabel(kind: ExerciseKind): string {
  switch (kind) {
    case "deadlift":
      return "Torso hinge";
    case "squat":
    case "barbell_squat":
      return "Knee angle";
    case "pushup":
    case "ohp":
      return "Elbow angle";
    default: {
      const _x: never = kind;
      return _x;
    }
  }
}

export type RepPhase = "idle" | "eccentric" | "bottom" | "concentric";

export type RepState = {
  reps: number;
  phase: RepPhase;
  lastPrimary: number | null;
};

export function updateRepState(primaryDeg: number, prev: RepState, model: RepModel): RepState {
  const next = { ...prev, lastPrimary: primaryDeg };

  if (!Number.isFinite(primaryDeg)) {
    return next;
  }

  if (model.kind === "flexion") {
    const { extended, bottomEnter, bottomExit } = model;
    switch (prev.phase) {
      case "idle":
        if (primaryDeg < extended - 5) next.phase = "eccentric";
        break;
      case "eccentric":
        if (primaryDeg <= bottomEnter) next.phase = "bottom";
        break;
      case "bottom":
        if (primaryDeg >= bottomExit) next.phase = "concentric";
        break;
      case "concentric":
        if (primaryDeg >= extended) {
          next.reps += 1;
          next.phase = "idle";
        } else if (primaryDeg <= bottomEnter) {
          next.phase = "bottom";
        }
        break;
      default:
        break;
    }
    return next;
  }

  const { uprightMax, foldEnter, foldExit } = model;
  switch (prev.phase) {
    case "idle":
      if (primaryDeg > uprightMax + 6) next.phase = "eccentric";
      break;
    case "eccentric":
      if (primaryDeg >= foldEnter) next.phase = "bottom";
      break;
    case "bottom":
      if (primaryDeg <= foldExit) next.phase = "concentric";
      break;
    case "concentric":
      if (primaryDeg <= uprightMax) {
        next.reps += 1;
        next.phase = "idle";
      } else if (primaryDeg >= foldEnter) {
        next.phase = "bottom";
      }
      break;
    default:
      break;
  }
  return next;
}

/** Build flexion thresholds from captured lockout (high) and deepest (low) knee/elbow angles. */
export function flexionModelFromCalibration(topDeg: number, bottomDeg: number): FlexionRepModel {
  const top = Math.max(90, Math.min(178, topDeg));
  const bottom = Math.max(60, Math.min(top - 15, bottomDeg));
  return {
    kind: "flexion",
    extended: Math.max(bottom + 25, top - 12),
    bottomEnter: Math.min(bottom + 12, top - 35),
    bottomExit: Math.min(bottom + 22, top - 28),
  };
}

/** Build hinge thresholds from captured upright (low °) and folded (high °) torso angles. */
export function torsoFoldModelFromCalibration(uprightDeg: number, foldedDeg: number): TorsoFoldRepModel {
  const up = Math.max(0, Math.min(45, uprightDeg));
  const fold = Math.max(up + 12, Math.min(90, foldedDeg));
  return {
    kind: "torso_fold",
    uprightMax: Math.min(38, up + 14),
    foldEnter: Math.max(fold - 8, up + 20),
    foldExit: Math.max(fold - 14, up + 12),
  };
}

export function formCue(
  kind: ExerciseKind,
  primaryDeg: number,
  secondaryDeg: number | null,
  phase: RepPhase,
): string | null {
  if (!Number.isFinite(primaryDeg)) {
    return "Step back until your full body is visible.";
  }
  if (kind === "squat") {
    if (phase === "bottom" && primaryDeg > 120) {
      return "Try to sink a bit deeper — aim for hips near knee level.";
    }
    if (phase === "eccentric" && primaryDeg < 90) {
      return "Strong — control the descent.";
    }
    return null;
  }
  if (kind === "pushup") {
    if (phase === "bottom" && primaryDeg > 110) {
      return "Lower chest closer to the floor before pressing up.";
    }
    if (phase === "concentric" && primaryDeg < 160) {
      return "Press all the way up to lock the elbows.";
    }
    return null;
  }
  if (kind === "barbell_squat") {
    if (Number.isFinite(secondaryDeg ?? NaN) && (secondaryDeg as number) > 42 && (phase === "bottom" || phase === "eccentric")) {
      return "Limit forward lean — think chest tall, hips back.";
    }
    if (phase === "bottom" && primaryDeg > 118) {
      return "Aim for depth with heels planted; knees track over toes.";
    }
    return null;
  }
  if (kind === "ohp") {
    if (phase === "bottom" && primaryDeg > 105) {
      return "Bring elbows under the bar lower — full range overhead.";
    }
    if (phase === "concentric" && primaryDeg < 148) {
      return "Finish with arms stacked over shoulders.";
    }
    return null;
  }
  if (kind === "deadlift") {
    if (phase === "bottom" && primaryDeg > 58) {
      return "Brace and drive — open the hips as the bar passes the knee.";
    }
    if (phase === "eccentric" && primaryDeg < 35) {
      return "Hinge at the hips first, then bend knees to the bar.";
    }
    return null;
  }
  return null;
}

/** Mirror normalized x for selfie-style preview */
export function mirrorLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  return landmarks.map((l) => ({ ...l, x: 1 - l.x }));
}
