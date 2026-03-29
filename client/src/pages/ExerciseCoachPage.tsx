import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  barPathCue,
  clearBarPathTrail,
  drawBarPathOnCanvas,
  lateralSpreadNorm,
  pushBarPathSample,
  barProxyNormalized,
  type BarPathNormPoint,
} from "../lib/barPathTracking.js";
import {
  type ExerciseKind,
  type RepModel,
  type RepPhase,
  DEFAULT_REP_MODEL,
  flexionModelFromCalibration,
  formCue,
  measureExercise,
  mirrorLandmarks,
  primaryMetricLabel,
  squatThighVerticality,
  torsoFoldModelFromCalibration,
  updateRepState,
} from "../lib/exercisePoseAnalysis.js";
import { playRepCompleteDing } from "../lib/repCompleteSound.js";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const initialRepState = (): { reps: number; phase: RepPhase; lastPrimary: number | null } => ({
  reps: 0,
  phase: "idle",
  lastPrimary: null,
});

function exerciseUsesBarProxy(k: ExerciseKind): boolean {
  return k === "barbell_squat" || k === "deadlift" || k === "ohp";
}

function exerciseLabel(k: ExerciseKind): string {
  switch (k) {
    case "squat":
      return "Squat";
    case "pushup":
      return "Push-up";
    case "barbell_squat":
      return "Barbell squat";
    case "deadlift":
      return "Deadlift";
    case "ohp":
      return "Overhead press";
    default: {
      const _n: never = k;
      return _n;
    }
  }
}

export function ExerciseCoachPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const repRef = useRef(initialRepState());
  const exerciseRef = useRef<ExerciseKind>("squat");
  const lastPrimaryRef = useRef<number | null>(null);
  const lastSecondaryRef = useRef<number | null>(null);
  const customRepModelsRef = useRef<Partial<Record<ExerciseKind, RepModel>>>({});
  const pendingCalibrationTopRef = useRef<number | null>(null);
  const barPathTrailRef = useRef<BarPathNormPoint[]>([]);
  const trackBarPathRef = useRef(false);
  const barPathFrameCountRef = useRef(0);

  const [exercise, setExercise] = useState<ExerciseKind>("squat");
  const [cameraOn, setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<RepPhase>("idle");
  const [angleText, setAngleText] = useState("—");
  const [secondaryAngleText, setSecondaryAngleText] = useState<string | null>(null);
  const [cue, setCue] = useState<string | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const [usingCustomRom, setUsingCustomRom] = useState(false);
  const [awaitingBottomCapture, setAwaitingBottomCapture] = useState(false);
  const [trackBarPath, setTrackBarPath] = useState(false);
  const [barPathSpreadText, setBarPathSpreadText] = useState<string | null>(null);
  const [barPathHint, setBarPathHint] = useState<string | null>(null);

  useEffect(() => {
    trackBarPathRef.current = trackBarPath;
    if (!trackBarPath) {
      clearBarPathTrail(barPathTrailRef.current);
      barPathFrameCountRef.current = 0;
      setBarPathSpreadText(null);
      setBarPathHint(null);
    }
  }, [trackBarPath]);

  useEffect(() => {
    exerciseRef.current = exercise;
    repRef.current = initialRepState();
    setReps(0);
    setPhase("idle");
    setAngleText("—");
    setSecondaryAngleText(null);
    setCue(null);
    setUsingCustomRom(!!customRepModelsRef.current[exercise]);
  }, [exercise]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      if (cancelled) return;

      const opts = {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU" as const,
        },
        runningMode: "VIDEO" as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      let landmarker: PoseLandmarker | null = null;
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, opts);
      } catch {
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: "CPU" },
          });
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Could not load pose model.");
          }
          return;
        }
      }

      if (cancelled) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      setModelReady(true);
      setError(null);
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setModelReady(false);
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
    }
    setCameraOn(false);
    pendingCalibrationTopRef.current = null;
    setAwaitingBottomCapture(false);
    setCalibrationMessage(null);
    clearBarPathTrail(barPathTrailRef.current);
    barPathFrameCountRef.current = 0;
    setBarPathSpreadText(null);
    setBarPathHint(null);
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    const ts = performance.now();
    const result = landmarker.detectForVideo(video, ts);
    const raw = result.landmarks[0];

    if (raw) {
      const mirrored = mirrorLandmarks(raw);
      const draw = new DrawingUtils(ctx);
      draw.drawConnectors(mirrored, PoseLandmarker.POSE_CONNECTIONS, {
        color: "#5eead4cc",
        lineWidth: 3,
      });
      draw.drawLandmarks(mirrored, { color: "#e8ecf2", lineWidth: 1, radius: 3 });

      if (trackBarPathRef.current) {
        const proxy = barProxyNormalized(raw);
        pushBarPathSample(barPathTrailRef.current, proxy);
        drawBarPathOnCanvas(ctx, barPathTrailRef.current, w, h);
        barPathFrameCountRef.current += 1;
        if (barPathFrameCountRef.current % 5 === 0) {
          const spread = lateralSpreadNorm(barPathTrailRef.current, 48);
          if (spread != null) {
            setBarPathSpreadText(`${(spread * 100).toFixed(1)}%`);
            setBarPathHint(barPathCue(spread, exerciseUsesBarProxy(exerciseRef.current)));
          } else {
            setBarPathSpreadText(null);
            setBarPathHint(
              proxy == null
                ? "Show both hands on the bar to trace the wrist midpoint path."
                : null,
            );
          }
        }
      }

      const kind = exerciseRef.current;
      const { primary, secondary } = measureExercise(kind, raw);
      lastPrimaryRef.current = primary;
      lastSecondaryRef.current = secondary;

      const model = customRepModelsRef.current[kind] ?? DEFAULT_REP_MODEL[kind];
      const prevReps = repRef.current.reps;
      const squatGate =
        kind === "squat" || kind === "barbell_squat"
          ? { squatThighVerticality: squatThighVerticality(raw) }
          : null;
      repRef.current = updateRepState(primary, repRef.current, model, squatGate);
      if (repRef.current.reps > prevReps) {
        playRepCompleteDing();
      }
      setReps(repRef.current.reps);
      setPhase(repRef.current.phase);
      setAngleText(Number.isFinite(primary) ? `${Math.round(primary)}°` : "—");
      setSecondaryAngleText(
        secondary != null && Number.isFinite(secondary) ? `${Math.round(secondary)}°` : null,
      );
      setCue(formCue(kind, primary, secondary, repRef.current.phase));
    } else {
      lastPrimaryRef.current = null;
      lastSecondaryRef.current = null;
      setAngleText("—");
      setSecondaryAngleText(null);
      setCue("No pose detected — stay in frame.");
      if (trackBarPathRef.current) {
        setBarPathSpreadText(null);
        setBarPathHint(null);
      }
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!landmarkerRef.current) {
      setError("Pose model is still loading.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      v.srcObject = stream;
      await v.play();
      setCameraOn(true);
      repRef.current = initialRepState();
      setReps(0);
      setPhase("idle");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(processFrame);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Camera permission denied or unavailable. Use HTTPS or localhost.",
      );
    }
  }, [processFrame]);

  const captureCalibrationTop = useCallback(() => {
    setCalibrationMessage(null);
    const kind = exerciseRef.current;
    const v = lastPrimaryRef.current;
    if (!Number.isFinite(v ?? NaN)) {
      setCalibrationMessage("Wait until the pose is detected, then try again.");
      return;
    }
    pendingCalibrationTopRef.current = v as number;
    setAwaitingBottomCapture(true);
    if (kind === "deadlift") {
      setCalibrationMessage(
        `Upright hinge saved (${Math.round(v as number)}°). Hinge down, then tap “Capture bottom”.`,
      );
    } else {
      setCalibrationMessage(
        `Lockout saved (${Math.round(v as number)}°). Move to your deepest position, then tap “Capture bottom”.`,
      );
    }
  }, []);

  const captureCalibrationBottom = useCallback(() => {
    const kind = exerciseRef.current;
    const top = pendingCalibrationTopRef.current;
    const bottom = lastPrimaryRef.current;
    if (top == null) {
      setCalibrationMessage("Tap “Capture top” first (lockout or upright stance).");
      return;
    }
    if (!Number.isFinite(bottom ?? NaN)) {
      setCalibrationMessage("Pose not visible — hold the bottom position and try again.");
      return;
    }
    const b = bottom as number;

    if (DEFAULT_REP_MODEL[kind].kind === "torso_fold") {
      if (b <= top + 8) {
        setCalibrationMessage("Bottom should be more folded than top. Hinge deeper and capture again.");
        return;
      }
      customRepModelsRef.current[kind] = torsoFoldModelFromCalibration(top, b);
    } else {
      if (top <= b + 8) {
        setCalibrationMessage("Top angle should be more open than bottom. Recapture in order.");
        return;
      }
      customRepModelsRef.current[kind] = flexionModelFromCalibration(top, b);
    }

    pendingCalibrationTopRef.current = null;
    setAwaitingBottomCapture(false);
    repRef.current = initialRepState();
    setReps(0);
    setPhase("idle");
    setUsingCustomRom(true);
    setCalibrationMessage(`Custom ROM saved for ${exerciseLabel(kind)}. Rep counter reset.`);
  }, []);

  const clearCalibration = useCallback(() => {
    const kind = exerciseRef.current;
    delete customRepModelsRef.current[kind];
    setUsingCustomRom(false);
    setAwaitingBottomCapture(false);
    pendingCalibrationTopRef.current = null;
    repRef.current = initialRepState();
    setReps(0);
    setPhase("idle");
    setCalibrationMessage("Using default thresholds for this exercise.");
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const secondaryLabel =
    exercise === "barbell_squat" ? "Torso vs vertical" : exercise === "deadlift" ? "Knee angle" : null;

  return (
    <div className="exercise-coach-page">
      <h1 className="page-title">Exercise coach</h1>
      <p className="page-lede">
        Uses your camera and on-device pose estimation to count reps and suggest simple form cues. Video
        stays in your browser; nothing is uploaded. Angles are computed from your joints in the frame, so
        they scale to any height — optional calibration tunes reps to your range of motion for this
        session only.
      </p>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="exercise-coach-toolbar card">
        <div className="field exercise-coach-field">
          <label htmlFor="exercise-coach-select">Exercise</label>
          <select
            id="exercise-coach-select"
            value={exercise}
            onChange={(e) => setExercise(e.target.value as ExerciseKind)}
            disabled={cameraOn}
          >
            <option value="squat">Squat</option>
            <option value="barbell_squat">Barbell squat</option>
            <option value="deadlift">Deadlift</option>
            <option value="ohp">Overhead press</option>
            <option value="pushup">Push-up</option>
          </select>
        </div>
        <div className="exercise-coach-actions">
          {!cameraOn ? (
            <button type="button" className="btn btn-primary" onClick={startCamera} disabled={!modelReady}>
              {modelReady ? "Start camera" : "Loading model…"}
            </button>
          ) : (
            <button type="button" className="btn" onClick={stopCamera}>
              Stop camera
            </button>
          )}
        </div>
        <div className="exercise-coach-option-row">
          <label className="exercise-coach-check">
            <input
              type="checkbox"
              checked={trackBarPath}
              onChange={(e) => setTrackBarPath(e.target.checked)}
            />
            <span>
              Track bar path <span className="exercise-coach-check-sub">(wrist midpoint proxy)</span>
            </span>
          </label>
        </div>
      </div>

      {cameraOn ? (
        <div className="card exercise-coach-calibration">
          <h2 className="exercise-coach-calibration-title">ROM calibration (this session)</h2>
          <p className="exercise-coach-calibration-lede">
            Default thresholds work for many people. Capture <strong>top</strong> then <strong>bottom</strong>{" "}
            to align rep counting with <em>your</em> lockout and depth. Not saved to the server.
          </p>
          <div className="exercise-coach-calibration-row">
            <button type="button" className="btn" onClick={captureCalibrationTop}>
              {exercise === "deadlift" ? "1. Capture upright" : "1. Capture lockout"}
            </button>
            <button type="button" className="btn" onClick={captureCalibrationBottom}>
              {exercise === "deadlift" ? "2. Capture hinge bottom" : "2. Capture bottom depth"}
            </button>
            {usingCustomRom ? (
              <button type="button" className="btn btn-ghost" onClick={clearCalibration}>
                Clear custom ROM
              </button>
            ) : null}
          </div>
          {awaitingBottomCapture ? (
            <p className="exercise-coach-calibration-waiting" role="status">
              Waiting for bottom capture…
            </p>
          ) : null}
          {calibrationMessage ? (
            <p className="exercise-coach-calibration-msg" role="status">
              {calibrationMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="exercise-coach-layout">
        <div className="exercise-coach-video-wrap card">
          <video ref={videoRef} className="exercise-coach-video" playsInline muted />
          <canvas ref={canvasRef} className="exercise-coach-canvas" />
          {!cameraOn ? <div className="exercise-coach-placeholder">Camera preview</div> : null}
        </div>

        <aside className="exercise-coach-stats card">
          <h2 className="exercise-coach-stats-title">Session</h2>
          <p className="exercise-coach-rom-badge">
            {usingCustomRom ? "Custom ROM" : "Default thresholds"}
          </p>
          <dl className="exercise-coach-dl">
            <div>
              <dt>Reps</dt>
              <dd className="exercise-coach-reps">{reps}</dd>
            </div>
            <div>
              <dt>Phase</dt>
              <dd className="exercise-coach-phase">{phase}</dd>
            </div>
            <div>
              <dt>{primaryMetricLabel(exercise)}</dt>
              <dd>{angleText}</dd>
            </div>
            {secondaryLabel ? (
              <div>
                <dt>{secondaryLabel}</dt>
                <dd>{secondaryAngleText ?? "—"}</dd>
              </div>
            ) : null}
            {trackBarPath ? (
              <div>
                <dt>Path lateral drift</dt>
                <dd>{barPathSpreadText ?? "—"}</dd>
              </div>
            ) : null}
          </dl>
          {cue ? (
            <p className="exercise-coach-cue" role="status">
              {cue}
            </p>
          ) : (
            <p className="exercise-coach-cue-muted">Form tips appear as you move.</p>
          )}
          {trackBarPath && barPathHint ? (
            <p className="exercise-coach-cue exercise-coach-barpath-hint" role="status">
              {barPathHint}
            </p>
          ) : null}
          <p className="exercise-coach-disclaimer">
            {trackBarPath
              ? "Bar path is a wrist-midpoint estimate (not the bar shaft). Side camera + both hands visible works best. Not medical or coaching advice."
              : "Optional bar path uses wrist midpoints as a proxy when both hands are visible. True bar tracking needs dedicated CV. This does not replace a qualified coach."}
          </p>
        </aside>
      </div>

      <section className="card exercise-coach-help">
        <h2>How it works</h2>
        <p className="exercise-coach-help-intro">
          Heights from 5′2″ to 6′1″ (and beyond) are fine: the model outputs <strong>normalized</strong> joint
          positions; we turn those into <strong>angles</strong>, which do not depend on how many pixels tall you
          are. Camera distance and lens still change perspective, so side or 45° views work best for squats
          and deadlifts.
        </p>
        <ul>
          <li>
            <strong>Squat / barbell squat:</strong> knee flexion (hip–knee–ankle). Barbell mode adds a rough
            forward-lean cue from torso vs vertical. Optional <strong>Track bar path</strong> draws the wrist
            midpoint trail (best with side camera and both hands on the bar).
          </li>
          <li>
            <strong>Deadlift:</strong> hip hinge angle (torso vs vertical). Same optional path overlay applies
            when both wrists are visible on the bar.
          </li>
          <li>
            <strong>Overhead press:</strong> elbow flexion; lockout finishes the rep. Enable{" "}
            <strong>Track bar path</strong> to overlay the wrist-midpoint trail (rough vertical-line check).
          </li>
          <li>
            <strong>Push-up:</strong> elbow angle; same idea as OHP but horizontal.
          </li>
        </ul>
        <p className="exercise-coach-help-foot">
          <strong>Calibration:</strong> optional, once per exercise per browser session. It does not “learn”
          you over time — it just snapshots your top and bottom once so thresholds match your ROM. Clear it to
          return to defaults.
        </p>
      </section>
    </div>
  );
}
