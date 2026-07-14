import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Self-timer camera capture (requirements F-14, D-14): open the rear camera,
 * count down a user-chosen delay, record for a user-chosen duration (max 60s,
 * F-05), and hand the result back as a Blob — no upload, POC stays local.
 *
 * Lifecycle: the hook acquires the camera on mount and releases it (tracks
 * stopped, timers cleared, recorder discarded) on unmount, so the camera is
 * only live while the capture UI is shown.
 *
 * iOS Safari supports MediaRecorder from 14.3+; unsupported browsers and
 * permission denials land in the "error" phase without breaking the app.
 */

// iOS Safari records mp4; Chrome/Firefox record webm. Both play back fine in
// the compare <video> slots on their own platform.
const MIME_CANDIDATES = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];

function pickMimeType(): string {
  for (const t of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return ""; // let the browser pick its default
}

export type TimerCameraPhase =
  | "starting" // getUserMedia in flight
  | "ready" // live preview, waiting for the user to start
  | "countdown" // delay before recording begins
  | "recording" // MediaRecorder running, auto-stops
  | "done" // result blob available
  | "error"; // unsupported browser / permission denied

export interface TimerCameraResult {
  blob: Blob;
  mimeType: string;
}

export interface TimerCamera {
  phase: TimerCameraPhase;
  error: string;
  /** Remaining whole seconds of the current countdown or recording. */
  remaining: number;
  result: TimerCameraResult | null;
  previewRef: React.RefObject<HTMLVideoElement>;
  start: (delaySec: number, recordSec: number) => void;
  /** Cancel countdown or recording (recording so far is discarded). */
  abort: () => void;
  /** Discard the result and go back to the live preview. */
  retake: () => void;
}

export function useTimerCamera(): TimerCamera {
  const previewRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<TimerCameraPhase>("starting");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<TimerCameraResult | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef(0);

  const clearTick = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = 0;
    }
  }, []);

  /** Stop the active recorder so its onstop becomes a no-op (data discarded). */
  const discardRecorder = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null; // onstop checks this ref and bails
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // already stopping — nothing to release beyond the ref above
      }
    }
  }, []);

  // Acquire the camera on mount, release everything on unmount.
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setPhase("error");
      setError(
        "この端末/ブラウザはカメラ録画に対応していません（iOSはSafari 14.3以降が必要です）",
      );
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = previewRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => undefined); // muted+playsInline: autoplay is allowed
        }
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setPhase("error");
        setError("カメラを起動できませんでした。カメラの使用を許可してください");
      });
    return () => {
      cancelled = true;
      clearTick();
      discardRecorder();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (previewRef.current) previewRef.current.srcObject = null;
    };
  }, [clearTick, discardRecorder]);

  const beginRecording = useCallback(
    (recordSec: number) => {
      const stream = streamRef.current;
      if (!stream) return;
      const mimeType = pickMimeType();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        setPhase("error");
        setError("録画を開始できませんでした（この形式の録画に非対応の可能性）");
        return;
      }
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (recorderRef.current !== rec) return; // aborted or unmounted
        recorderRef.current = null;
        const type = rec.mimeType || mimeType || "video/webm";
        setResult({ blob: new Blob(chunks, { type }), mimeType: type });
        setPhase("done");
      };
      recorderRef.current = rec;
      rec.start();
      setPhase("recording");
      setRemaining(recordSec);
      const endAt = Date.now() + recordSec * 1000;
      timerRef.current = window.setInterval(() => {
        const left = Math.ceil((endAt - Date.now()) / 1000);
        if (left > 0) {
          setRemaining(left);
          return;
        }
        clearTick();
        if (rec.state !== "inactive") rec.stop(); // -> onstop builds the blob
      }, 200);
    },
    [clearTick],
  );

  const start = useCallback(
    (delaySec: number, recordSec: number) => {
      if (phaseRef.current !== "ready" || !streamRef.current) return;
      setResult(null);
      setPhase("countdown");
      setRemaining(delaySec);
      const endAt = Date.now() + delaySec * 1000;
      clearTick();
      timerRef.current = window.setInterval(() => {
        const left = Math.ceil((endAt - Date.now()) / 1000);
        if (left > 0) {
          setRemaining(left);
          return;
        }
        clearTick();
        beginRecording(recordSec);
      }, 200);
    },
    [beginRecording, clearTick],
  );

  const abort = useCallback(() => {
    if (phaseRef.current !== "countdown" && phaseRef.current !== "recording") return;
    clearTick();
    discardRecorder();
    setResult(null);
    setPhase("ready");
  }, [clearTick, discardRecorder]);

  const retake = useCallback(() => {
    if (phaseRef.current !== "done") return;
    setResult(null);
    setPhase("ready");
  }, []);

  return { phase, error, remaining, result, previewRef, start, abort, retake };
}
