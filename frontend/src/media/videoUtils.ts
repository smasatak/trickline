/**
 * Client-side probing + thumbnail generation (requirements F-04, D-04): the
 * server has no ffmpeg/worker infra, so we read duration and snapshot a frame
 * in the browser before upload. Also used by the local video library (F-50)
 * to compute duration/thumbnail for saved clips.
 */

export interface Probe {
  durationSeconds: number;
  width: number;
  height: number;
}

/**
 * Video elements that are never attached to the document can fail to fire
 * `loadedmetadata`/`seeked` at all on Safari/iOS (our main target platform,
 * D-04), which otherwise hangs probing/thumbnailing forever with no error.
 * Keep it in the DOM but visually and interactively inert.
 */
function createOffscreenVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  v.style.position = "fixed";
  v.style.width = "1px";
  v.style.height = "1px";
  v.style.opacity = "0";
  v.style.pointerEvents = "none";
  v.style.top = "-9999px";
  document.body.appendChild(v);
  return v;
}

/**
 * MediaRecorder output (e.g. the timer camera, F-14) commonly has no duration
 * in its container until played/sought once — `video.duration` reads as
 * `Infinity` until then, a well-known Chromium/WebKit quirk. Force a fix-up
 * seek so callers get a real number.
 */
function resolveDuration(v: HTMLVideoElement): Promise<number> {
  if (isFinite(v.duration)) return Promise.resolve(v.duration);
  return new Promise((resolve) => {
    const onTimeUpdate = () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      const duration = isFinite(v.duration) ? v.duration : 0;
      v.currentTime = 0;
      resolve(duration);
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    v.currentTime = 1e9;
  });
}

/** Race a probe/thumbnail step against a timeout so a stuck video element
 * can't hang the caller forever (F-50: a failed save must still be reported). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function probeVideo(file: Blob): Promise<Probe> {
  const run = new Promise<Probe>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = createOffscreenVideo();
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      v.remove();
    };
    v.onloadedmetadata = () => {
      resolveDuration(v).then((durationSeconds) => {
        const probe = { durationSeconds, width: v.videoWidth, height: v.videoHeight };
        cleanup();
        resolve(probe);
      });
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("Could not read video metadata"));
    };
    v.src = url;
  });
  return withTimeout(run, 8000, "probeVideo");
}

/** Grab a JPEG thumbnail at `atSeconds` (default 0.5s in). */
export function generateThumbnail(file: Blob, atSeconds = 0.5): Promise<Blob> {
  const run = new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = createOffscreenVideo();
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      v.remove();
    };

    v.onloadedmetadata = () => {
      // resolveDuration may itself perform a fix-up seek; only attach the
      // capture handler for the *real* seek below, or it fires prematurely
      // on the fix-up and grabs a frame from the wrong spot (or a black one).
      resolveDuration(v).then((duration) => {
        v.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            reject(new Error("no 2d context"));
            return;
          }
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              blob ? resolve(blob) : reject(new Error("toBlob failed"));
            },
            "image/jpeg",
            0.8,
          );
        };
        v.currentTime = Math.min(atSeconds, Math.max(0, duration - 0.05));
      });
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("Could not load video for thumbnail"));
    };
    v.src = url;
  });
  return withTimeout(run, 8000, "generateThumbnail");
}
