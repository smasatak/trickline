import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Core of the "trickline" MVP bet (requirements F-20..F-24): keep two <video>
 * elements playing in sync with independent timing offsets, support slow
 * playback, and step ~1 frame at a time.
 *
 * Video A is the master clock. Video B follows at:
 *   B.currentTime = A.currentTime - markA + markB
 * where markA/markB are the moments the user aligned (e.g. take-off, F-22).
 *
 * Frame-exact stepping is impossible with the HTML5 media API, so we step by
 * 1/fps and — where available — read the true presentation time via
 * requestVideoFrameCallback to report drift honestly (F-23).
 */

// requestVideoFrameCallback is not in the default DOM lib types yet.
interface VideoFrameMetadata {
  mediaTime: number;
}
type RVFC = (
  cb: (now: number, metadata: VideoFrameMetadata) => void,
) => number;

const SOFT_SYNC_THRESHOLD = 0.025; // seconds; ignore tiny drift while playing
const HARD_SYNC_THRESHOLD = 0.18; // seconds; seek only when drift is clearly visible
const MAX_RATE_NUDGE = 0.06; // keep playback-rate correction subtle
const UI_UPDATE_INTERVAL_MS = 100;

export interface SyncedPlayers {
  videoARef: React.RefObject<HTMLVideoElement>;
  videoBRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  playing: boolean;
  playbackRate: number;
  fps: number;
  masterTime: number; // video A currentTime, seconds
  durationA: number;
  markA: number;
  markB: number;
  supportsRVFC: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepFrames: (frames: number) => void;
  seekMaster: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setFps: (fps: number) => void;
  markHere: (which: "A" | "B") => void;
  resetMarks: () => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function useSyncedPlayers(): SyncedPlayers {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [fps, setFpsState] = useState(30);
  const [masterTime, setMasterTime] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [markA, setMarkA] = useState(0);
  const [markB, setMarkB] = useState(0);

  const markARef = useRef(0);
  const markBRef = useRef(0);
  const playbackRateRef = useRef(1);
  const lastUiUpdateRef = useRef(0);
  markARef.current = markA;
  markBRef.current = markB;
  playbackRateRef.current = playbackRate;

  const supportsRVFC =
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  // Position B relative to A using the current marks, clamped to B's range.
  // During playback, avoid frequent currentTime writes because they force seeks
  // and make mobile videos stutter. Small drift is corrected by nudging B's rate.
  const syncB = useCallback((mode: "soft" | "hard" = "soft") => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;
    const target = clamp(
      a.currentTime - markARef.current + markBRef.current,
      0,
      isFinite(b.duration) ? b.duration : a.currentTime,
    );
    const drift = b.currentTime - target;
    const driftAbs = Math.abs(drift);
    const baseRate = playbackRateRef.current;

    if (mode === "hard" || driftAbs > HARD_SYNC_THRESHOLD) {
      b.currentTime = target;
      b.playbackRate = baseRate;
      return;
    }

    if (driftAbs <= SOFT_SYNC_THRESHOLD) {
      b.playbackRate = baseRate;
      return;
    }

    const nudge = clamp(drift * 0.6, -MAX_RATE_NUDGE, MAX_RATE_NUDGE);
    b.playbackRate = clamp(baseRate - nudge, 0.0625, 16);
  }, []);

  // Mark both videos ready once metadata (duration) is loaded for each.
  useEffect(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;

    const check = () => {
      if (isFinite(a.duration) && isFinite(b.duration) && a.duration > 0 && b.duration > 0) {
        setReady(true);
        setDurationA(a.duration);
      }
    };
    a.addEventListener("loadedmetadata", check);
    b.addEventListener("loadedmetadata", check);
    check();
    return () => {
      a.removeEventListener("loadedmetadata", check);
      b.removeEventListener("loadedmetadata", check);
    };
  }, []);

  // While playing, follow A's clock (via rVFC when available, else rAF),
  // publish masterTime, and correct B's drift.
  useEffect(() => {
    if (!playing) return;
    const a = videoARef.current;
    if (!a) return;

    let handle = 0;
    let stopped = false;

    const onTick = (now: number, mediaTime?: number) => {
      if (stopped) return;

      if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS || a.ended) {
        lastUiUpdateRef.current = now;
        setMasterTime(mediaTime ?? a.currentTime);
      }
      syncB();
      if (a.ended) {
        videoBRef.current?.pause();
        setPlaying(false);
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (supportsRVFC) {
        const rvfc = (a as unknown as { requestVideoFrameCallback: RVFC })
          .requestVideoFrameCallback;
        handle = rvfc.call(a, (now, meta) => onTick(now, meta.mediaTime));
      } else {
        handle = requestAnimationFrame((now) => onTick(now));
      }
    };
    schedule();

    return () => {
      stopped = true;
      if (!supportsRVFC) cancelAnimationFrame(handle);
      // rVFC has no public cancel across all browsers; the stopped flag guards it.
    };
  }, [playing, supportsRVFC, syncB]);

  const play = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;
    a.playbackRate = playbackRate;
    b.playbackRate = playbackRate;
    syncB("hard");
    void Promise.all([a.play(), b.play()]).then(() => setPlaying(true)).catch(() => {});
  }, [playbackRate, syncB]);

  const pause = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    a?.pause();
    b?.pause();
    if (a) a.playbackRate = playbackRateRef.current;
    if (b) b.playbackRate = playbackRateRef.current;
    setPlaying(false);
    if (a) setMasterTime(a.currentTime);
  }, []);

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  const stepFrames = useCallback(
    (frames: number) => {
      const a = videoARef.current;
      if (!a) return;
      pause();
      const dt = frames / fps;
      a.currentTime = clamp(a.currentTime + dt, 0, isFinite(a.duration) ? a.duration : a.currentTime);
      setMasterTime(a.currentTime);
      // give the seek a tick before aligning B
      requestAnimationFrame(() => syncB("hard"));
    },
    [fps, pause, syncB],
  );

  const seekMaster = useCallback(
    (seconds: number) => {
      const a = videoARef.current;
      if (!a) return;
      a.currentTime = clamp(seconds, 0, isFinite(a.duration) ? a.duration : seconds);
      setMasterTime(a.currentTime);
      requestAnimationFrame(() => syncB("hard"));
    },
    [syncB],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (videoARef.current) videoARef.current.playbackRate = rate;
    if (videoBRef.current) videoBRef.current.playbackRate = rate;
  }, []);

  const setFps = useCallback((v: number) => setFpsState(v), []);

  const markHere = useCallback((which: "A" | "B") => {
    const v = which === "A" ? videoARef.current : videoBRef.current;
    if (!v) return;
    if (which === "A") setMarkA(v.currentTime);
    else setMarkB(v.currentTime);
  }, []);

  const resetMarks = useCallback(() => {
    setMarkA(0);
    setMarkB(0);
  }, []);

  return {
    videoARef,
    videoBRef,
    ready,
    playing,
    playbackRate,
    fps,
    masterTime,
    durationA,
    markA,
    markB,
    supportsRVFC,
    play,
    pause,
    toggle,
    stepFrames,
    seekMaster,
    setPlaybackRate,
    setFps,
    markHere,
    resetMarks,
  };
}
