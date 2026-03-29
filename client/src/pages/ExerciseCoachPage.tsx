import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ExerciseKind,
  type RepPhase,
  formCue,
  mirrorLandmarks,
  pickPushupAngle,
  pickSquatAngle,
  updateRepState,
} from "../lib/exercisePoseAnalysis.js";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const initialRepState = (): { reps: number; phase: RepPhase; lastAngle: number | null } => ({
  reps: 0,
  phase: "idle",
  lastAngle: null,
});

export function ExerciseCoachPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const repRef = useRef(initialRepState());
  const exerciseRef = useRef<ExerciseKind>("squat");

  const [exercise, setExercise] = useState<ExerciseKind>("squat");
  const [cameraOn, setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<RepPhase>("idle");
  const [angleText, setAngleText] = useState("—");
  const [cue, setCue] = useState<string | null>(null);

  useEffect(() => {
    exerciseRef.current = exercise;
    repRef.current = initialRepState();
    setReps(0);
    setPhase("idle");
    setAngleText("—");
    setCue(null);
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

      const kind = exerciseRef.current;
      const angleDeg = kind === "squat" ? pickSquatAngle(raw) : pickPushupAngle(raw);
      repRef.current = updateRepState(kind, angleDeg, repRef.current);
      setReps(repRef.current.reps);
      setPhase(repRef.current.phase);
      setAngleText(Number.isFinite(angleDeg) ? `${Math.round(angleDeg)}°` : "—");
      setCue(formCue(kind, angleDeg, repRef.current.phase));
    } else {
      setAngleText("—");
      setCue("No pose detected — stay in frame.");
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

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="exercise-coach-page">
      <h1 className="page-title">Exercise coach</h1>
      <p className="page-lede">
        Uses your camera and on-device pose estimation to count reps and suggest simple form cues. Video
        stays in your browser; nothing is uploaded.
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
      </div>

      <div className="exercise-coach-layout">
        <div className="exercise-coach-video-wrap card">
          <video ref={videoRef} className="exercise-coach-video" playsInline muted />
          <canvas ref={canvasRef} className="exercise-coach-canvas" />
          {!cameraOn ? <div className="exercise-coach-placeholder">Camera preview</div> : null}
        </div>

        <aside className="exercise-coach-stats card">
          <h2 className="exercise-coach-stats-title">Session</h2>
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
              <dt>Joint angle</dt>
              <dd>{angleText}</dd>
            </div>
          </dl>
          {cue ? (
            <p className="exercise-coach-cue" role="status">
              {cue}
            </p>
          ) : (
            <p className="exercise-coach-cue-muted">Form tips appear as you move.</p>
          )}
          <p className="exercise-coach-disclaimer">
            This is a lightweight demo: lighting, camera angle, and clothing affect accuracy. It does not
            replace a qualified coach.
          </p>
        </aside>
      </div>

      <section className="card exercise-coach-help">
        <h2>How to use</h2>
        <ul>
          <li>
            <strong>Squat:</strong> stand side-on or at a slight angle so your hip, knee, and ankle are visible.
            We track knee flexion and count a rep when you stand tall again.
          </li>
          <li>
            <strong>Push-up:</strong> frame your upper body; we track elbow angle. Full extension at the top
            completes a rep.
          </li>
        </ul>
      </section>
    </div>
  );
}
