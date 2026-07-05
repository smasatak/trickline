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

const DRIFT_CORRECT_THRESHOLD = 0.04; // seconds; re-align B if it slips past this

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
  markARef.current = markA;
  markBRef.current = markB;

  const supportsRVFC =
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  // Position B relative to A using the current marks, clamped to B's range.
  const syncB = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;
    const target = clamp(
      a.currentTime - markARef.current + markBRef.current,
      0,
      isFinite(b.duration) ? b.duration : a.currentTime,
    );
    if (Math.abs(b.currentTime - target) > DRIFT_CORRECT_THRESHOLD) {
      b.currentTime = target;
    }
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

    const onTick = (mediaTime?: number) => {
      if (stopped) return;
      setMasterTime(mediaTime ?? a.currentTime);
      syncB();
      if (a.ended) {
        setPlaying(false);
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (supportsRVFC) {
        const rvfc = (a as unknown as { requestVideoFrameCallback: RVFC })
          .requestVideoFrameCallback;
        handle = rvfc.call(a, (_now, meta) => onTick(meta.mediaTime));
      } else {
        handle = requestAnimationFrame(() => onTick());
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
    syncB();
    void Promise.all([a.play(), b.play()]).then(() => setPlaying(true)).catch(() => {});
  }, [playbackRate, syncB]);

  const pause = useCallback(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    a?.pause();
    b?.pause();
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
      requestAnimationFrame(() => syncB());
    },
    [fps, pause, syncB],
  );

  const seekMaster = useCallback(
    (seconds: number) => {
      const a = videoARef.current;
      if (!a) return;
      a.currentTime = clamp(seconds, 0, isFinite(a.duration) ? a.duration : seconds);
      setMasterTime(a.currentTime);
      requestAnimationFrame(() => syncB());
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
