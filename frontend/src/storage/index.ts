import { IndexedDbStorage } from "./indexedDbStorage";
import type { VideoStorage } from "./types";

export type {
  SessionInput,
  SessionRecord,
  VideoMetaInput,
  VideoMetaPatch,
  VideoRecord,
  VideoStorage,
} from "./types";

let instance: VideoStorage | null = null;

/**
 * The app-wide storage implementation (D-15 platform boundary).
 * Today: IndexedDB. Future: return a Capacitor-backed implementation here
 * when running inside the native shell — callers never change.
 */
export function getStorage(): VideoStorage {
  if (!instance) instance = new IndexedDbStorage();
  return instance;
}
