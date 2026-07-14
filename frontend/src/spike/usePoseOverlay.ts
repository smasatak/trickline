import { useCallback, useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// vision.d.ts declares WasmFileset but does not export it.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/**
 * Pose skeleton overlay for the compare spike (requirements F-40..F-42, D-12).
 *
 * Inference runs fully in the browser (MediaPipe Tasks WASM, F-41): the WASM
 * runtime and the pose_landmarker_lite model are fetched from CDNs on first
 * use, so nothing model-related lives in this repo (D-09 POC: no backend).
 *
 * One PoseLandmarker instance per video — detectForVideo() requires
 * monotonically increasing timestamps per instance, so sharing one across two
 * independently seeking videos would fail.
 */

const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

// F-42: skip drawing when the detection is unconvincing. detectForVideo
// already gates on minPoseDetectionConfidence; on top of that we require a
// minimum average landmark visibility so a barely-tracked pose stays hidden.
const MIN_AVG_VISIBILITY = 0.5;

const CONNECTION_STYLE = { color: "#22c55e", lineWidth: 3 };
const LANDMARK_STYLE = { color: "#3b82f6", lineWidth: 1, radius: 3 };

// The WASM fileset is shared; each enable() call creates fresh landmarkers.
let filesetPromise: Promise<WasmFileset> | null = null;

function getFileset(): Promise<WasmFileset> {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).catch((e) => {
      filesetPromise = null; // allow retry after e.g. an offline failure
      throw e;
    });
  }
  return filesetPromise;
}

async function createLandmarker(fileset: WasmFileset): Promise<PoseLandmarker> {
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    numPoses: 1,
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    // GPU delegate can fail on devices without WebGL2 support; retry on CPU.
    return await PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

function avgVisibility(landmarks: NormalizedLandmark[]): number {
  if (landmarks.length === 0) return 0;
  let sum = 0;
  for (const lm of landmarks) sum += lm.visibility ?? 0;
  return sum / landmarks.length;
}

/**
 * Detect-and-draw loop for one video/canvas pair. Uses rVFC when available
 * (fires on every newly presented frame, including seeks while paused) and
 * falls back to rAF gated on currentTime changes — same split as
 * useSyncedPlayers. Returns a stop function.
 */
function startLoop(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  landmarker: PoseLandmarker,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const drawer = new DrawingUtils(ctx);
  let stopped = false;
  let rafHandle = 0;
  let lastDetectedTime = -1;

  const detect = () => {
    if (stopped) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    // Canvas backing store matches the video's pixel size; CSS object-fit:
    // contain then letterboxes it exactly like the <video> underneath.
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    lastDetectedTime = video.currentTime;
    // performance.now() is monotonic, which detectForVideo requires.
    const result = landmarker.detectForVideo(video, performance.now());
    if (stopped) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pose = result.landmarks[0];
    if (!pose || avgVisibility(pose) < MIN_AVG_VISIBILITY) return; // F-42
    drawer.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, CONNECTION_STYLE);
    drawer.drawLandmarks(pose, LANDMARK_STYLE);
  };

  const supportsRVFC =
    "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  const schedule = () => {
    if (stopped) return;
    if (supportsRVFC) {
      video.requestVideoFrameCallback(() => {
        detect();
        schedule();
      });
    } else {
      rafHandle = requestAnimationFrame(() => {
        // Avoid re-running inference on the same still frame while paused.
        if (video.currentTime !== lastDetectedTime) detect();
        schedule();
      });
    }
  };

  // Draw the frame that is already showing (paused video, F-40/step case);
  // rVFC only fires once a *new* frame is presented.
  detect();
  schedule();

  return () => {
    stopped = true;
    if (!supportsRVFC) cancelAnimationFrame(rafHandle);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawer.close();
  };
}

export interface PoseOverlay {
  enabled: boolean;
  loading: boolean;
  error: string;
  toggle: () => void;
  canvasARef: React.RefObject<HTMLCanvasElement>;
  canvasBRef: React.RefObject<HTMLCanvasElement>;
}

export function usePoseOverlay(
  videoARef: React.RefObject<HTMLVideoElement>,
  videoBRef: React.RefObject<HTMLVideoElement>,
): PoseOverlay {
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false); // default OFF (F-40)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const landmarkersRef = useRef<[PoseLandmarker, PoseLandmarker] | null>(null);
  const loadSeqRef = useRef(0);

  const toggle = useCallback(() => {
    if (loading) return;
    if (enabled) {
      setEnabled(false);
      return;
    }
    setError("");
    if (landmarkersRef.current) {
      setEnabled(true);
      return;
    }
    // First ON: load WASM runtime + model from CDN, one landmarker per video.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    getFileset()
      .then((fileset) =>
        Promise.all([createLandmarker(fileset), createLandmarker(fileset)]),
      )
      .then((landmarkers) => {
        if (seq !== loadSeqRef.current) {
          landmarkers.forEach((lm) => lm.close());
          return;
        }
        landmarkersRef.current = landmarkers;
        setLoading(false);
        setEnabled(true);
      })
      .catch(() => {
        if (seq !== loadSeqRef.current) return;
        setLoading(false);
        setEnabled(false);
        setError("骨格モデルの読み込みに失敗しました（オフライン?）");
      });
  }, [enabled, loading]);

  // Run one detect/draw loop per video while enabled.
  useEffect(() => {
    if (!enabled) return;
    const landmarkers = landmarkersRef.current;
    if (!landmarkers) return;
    const stops: Array<() => void> = [];
    const pairs: Array<[HTMLVideoElement | null, HTMLCanvasElement | null, PoseLandmarker]> = [
      [videoARef.current, canvasARef.current, landmarkers[0]],
      [videoBRef.current, canvasBRef.current, landmarkers[1]],
    ];
    for (const [video, canvas, landmarker] of pairs) {
      if (video && canvas) stops.push(startLoop(video, canvas, landmarker));
    }
    return () => stops.forEach((stop) => stop());
  }, [enabled, videoARef, videoBRef]);

  // Free WASM resources on unmount.
  useEffect(() => {
    return () => {
      loadSeqRef.current++;
      landmarkersRef.current?.forEach((lm) => lm.close());
      landmarkersRef.current = null;
    };
  }, []);

  return { enabled, loading, error, toggle, canvasARef, canvasBRef };
}
