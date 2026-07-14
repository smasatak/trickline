/**
 * Client-side probing + thumbnail generation (requirements F-04, D-04): the
 * server has no ffmpeg/worker infra, so we read duration and snapshot a frame
 * in the browser before upload.
 */

export interface Probe {
  durationSeconds: number;
  width: number;
  height: number;
}

export function probeVideo(file: Blob): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    v.onloadedmetadata = () => {
      const probe = {
        durationSeconds: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(probe);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video metadata"));
    };
  });
}

/** Grab a JPEG thumbnail at `atSeconds` (default 0.5s in). */
export function generateThumbnail(file: Blob, atSeconds = 0.5): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    v.onloadedmetadata = () => {
      v.currentTime = Math.min(atSeconds, Math.max(0, v.duration - 0.05));
    };
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
    v.onerror = () => {
      cleanup();
      reject(new Error("Could not load video for thumbnail"));
    };
  });
}
