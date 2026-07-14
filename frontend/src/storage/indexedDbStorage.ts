import { DEFAULT_VIEW_TRANSFORM } from "./types";
import type {
  SessionInput,
  SessionRecord,
  VideoMetaInput,
  VideoMetaPatch,
  VideoRecord,
  VideoStorage,
} from "./types";

/**
 * IndexedDB implementation of the VideoStorage boundary (D-15).
 *
 * Plain IndexedDB (no library, POC constraint): Blobs are structured-cloneable
 * and iOS Safari stores them fine. Everything is promise-wrapped and every
 * transaction rejects on error/abort so callers can show a warning instead of
 * silently losing data.
 *
 * Schema v1:
 *   videos   (keyPath: id) — { id, blob, name, createdAt, tag, memo,
 *                              durationSec, mimeType, sizeBytes, thumbnailBlob }
 *   sessions (keyPath: id) — { id, videoIdA, videoIdB, markA, markB, updatedAt }
 */

const DB_NAME = "trickline";
const DB_VERSION = 1;
const VIDEOS = "videos";
const SESSIONS = "sessions";

type StoredVideo = VideoRecord & { blob: Blob };

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** Resolves when the transaction commits; rejects on error or abort. */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same ordered pair ⇒ same id ⇒ put() overwrites (F-52). */
function sessionId(videoIdA: string, videoIdB: string): string {
  return `${videoIdA}::${videoIdB}`;
}

export class IndexedDbStorage implements VideoStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private persistRequested = false;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this browser"));
        return;
      }
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(VIDEOS)) {
          db.createObjectStore(VIDEOS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(SESSIONS)) {
          db.createObjectStore(SESSIONS, { keyPath: "id" });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        // If another tab upgrades the schema, close so it can proceed.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      open.onerror = () => reject(open.error ?? new Error("Could not open IndexedDB"));
      open.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
    });
    // Allow a retry after a failed open (e.g. Safari private mode quirks).
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });
    return this.dbPromise;
  }

  /** Best-effort eviction protection; failure is fine, we continue (D-15). */
  private requestPersistence(): void {
    if (this.persistRequested) return;
    this.persistRequested = true;
    try {
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch {
      // navigator.storage missing (older WebKit) — nothing to do.
    }
  }

  async saveVideo(blob: Blob, meta: VideoMetaInput): Promise<VideoRecord> {
    this.requestPersistence();
    const db = await this.openDb();
    const record: VideoRecord = {
      id: newId(),
      name: meta.name,
      createdAt: Date.now(),
      tag: meta.tag ?? "",
      memo: meta.memo ?? "",
      durationSec: meta.durationSec ?? 0,
      mimeType: meta.mimeType ?? blob.type,
      sizeBytes: blob.size,
      thumbnailBlob: meta.thumbnailBlob ?? null,
    };
    const tx = db.transaction(VIDEOS, "readwrite");
    tx.objectStore(VIDEOS).put({ ...record, blob } satisfies StoredVideo);
    await txDone(tx);
    return record;
  }

  async listVideos(): Promise<VideoRecord[]> {
    const db = await this.openDb();
    const tx = db.transaction(VIDEOS, "readonly");
    const all = await reqAsPromise(
      tx.objectStore(VIDEOS).getAll() as IDBRequest<StoredVideo[]>,
    );
    await txDone(tx);
    return all
      .map(({ blob: _blob, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getVideoBlob(id: string): Promise<Blob | null> {
    const db = await this.openDb();
    const tx = db.transaction(VIDEOS, "readonly");
    const stored = await reqAsPromise(
      tx.objectStore(VIDEOS).get(id) as IDBRequest<StoredVideo | undefined>,
    );
    await txDone(tx);
    return stored?.blob ?? null;
  }

  async updateVideoMeta(id: string, patch: VideoMetaPatch): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(VIDEOS, "readwrite");
    const store = tx.objectStore(VIDEOS);
    const stored = await reqAsPromise(
      store.get(id) as IDBRequest<StoredVideo | undefined>,
    );
    if (!stored) {
      tx.abort();
      throw new Error(`video not found: ${id}`);
    }
    store.put({ ...stored, ...patch });
    await txDone(tx);
  }

  async deleteVideo(id: string): Promise<void> {
    const db = await this.openDb();
    // One transaction: the video and every session referencing it go together,
    // so a failure can't leave dangling session rows.
    const tx = db.transaction([VIDEOS, SESSIONS], "readwrite");
    tx.objectStore(VIDEOS).delete(id);
    const sessions = await reqAsPromise(
      tx.objectStore(SESSIONS).getAll() as IDBRequest<SessionRecord[]>,
    );
    for (const s of sessions) {
      if (s.videoIdA === id || s.videoIdB === id) {
        tx.objectStore(SESSIONS).delete(s.id);
      }
    }
    await txDone(tx);
  }

  async saveSession(input: SessionInput): Promise<void> {
    const db = await this.openDb();
    const record: SessionRecord = {
      id: sessionId(input.videoIdA, input.videoIdB),
      videoIdA: input.videoIdA,
      videoIdB: input.videoIdB,
      markA: input.markA,
      markB: input.markB,
      viewA: input.viewA,
      viewB: input.viewB,
      updatedAt: Date.now(),
    };
    const tx = db.transaction(SESSIONS, "readwrite");
    tx.objectStore(SESSIONS).put(record);
    await txDone(tx);
  }

  async getSession(videoIdA: string, videoIdB: string): Promise<SessionRecord | null> {
    const db = await this.openDb();
    const tx = db.transaction(SESSIONS, "readonly");
    const found = await reqAsPromise(
      tx.objectStore(SESSIONS).get(sessionId(videoIdA, videoIdB)) as IDBRequest<
        SessionRecord | undefined
      >,
    );
    await txDone(tx);
    if (!found) return null;
    // Sessions saved before zoom/pan existed have no viewA/viewB; default them.
    return {
      ...found,
      viewA: found.viewA ?? DEFAULT_VIEW_TRANSFORM,
      viewB: found.viewB ?? DEFAULT_VIEW_TRANSFORM,
    };
  }
}
