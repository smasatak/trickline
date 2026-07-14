/**
 * Local-first persistence boundary (requirements D-15, F-50〜F-52).
 *
 * PLATFORM BOUNDARY: UI code must depend only on the types in this file and
 * obtain an implementation via `getStorage()` (see ./index.ts). The current
 * implementation is IndexedDB (works in iOS Safari, Blobs included). When the
 * app is wrapped with Capacitor for App Store distribution, a native
 * implementation (filesystem + SQLite/Preferences) can be swapped in behind
 * the same interface without touching any UI code.
 */

/** Stored video metadata. The video Blob itself is fetched separately via
 * `getVideoBlob` because lists should not drag full videos around. */
export interface VideoRecord {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  tag: string; // trick name etc. (F-51)
  memo: string;
  durationSec: number;
  mimeType: string;
  sizeBytes: number;
  thumbnailBlob: Blob | null; // small JPEG grabbed at save time
}

export interface VideoMetaInput {
  name: string;
  tag?: string;
  memo?: string;
  durationSec?: number;
  mimeType?: string;
  thumbnailBlob?: Blob | null;
}

export type VideoMetaPatch = Partial<Pick<VideoRecord, "name" | "tag" | "memo">>;

/** Per-video zoom/pan (pinch + drag), saved alongside the alignment mark so
 * re-opening a pair looks the same as when it was left (F-52). */
export interface ViewTransform {
  scale: number; // 1 = no zoom
  x: number; // screen-pixel pan offset
  y: number;
}

export const DEFAULT_VIEW_TRANSFORM: ViewTransform = { scale: 1, x: 0, y: 0 };

/** A saved compare session (F-52): which two library videos were compared and
 * where their alignment marks were. One session per ordered (A, B) pair. */
export interface SessionRecord {
  id: string; // derived from the pair; same pair overwrites (F-52)
  videoIdA: string;
  videoIdB: string;
  markA: number; // seconds
  markB: number; // seconds
  viewA: ViewTransform;
  viewB: ViewTransform;
  updatedAt: number; // epoch ms
}

export interface SessionInput {
  videoIdA: string;
  videoIdB: string;
  markA: number;
  markB: number;
  viewA: ViewTransform;
  viewB: ViewTransform;
}

export interface VideoStorage {
  /** Persist a video Blob + metadata. Returns the stored record (no Blob). */
  saveVideo(blob: Blob, meta: VideoMetaInput): Promise<VideoRecord>;
  /** All saved videos, newest first. Video Blobs are NOT included. */
  listVideos(): Promise<VideoRecord[]>;
  /** The raw video Blob, or null if the id is unknown. */
  getVideoBlob(id: string): Promise<Blob | null>;
  /** Edit name / tag / memo (F-51). */
  updateVideoMeta(id: string, patch: VideoMetaPatch): Promise<void>;
  /** Delete a video and any sessions that reference it. */
  deleteVideo(id: string): Promise<void>;
  /** Upsert the session for this (A, B) pair (F-52). */
  saveSession(input: SessionInput): Promise<void>;
  /** The saved session for this exact (A, B) pair, or null. */
  getSession(videoIdA: string, videoIdB: string): Promise<SessionRecord | null>;
}
