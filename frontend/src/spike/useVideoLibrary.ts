import { useCallback, useEffect, useRef, useState } from "react";
import { generateThumbnail, probeVideo } from "../media/videoUtils";
import { getStorage } from "../storage";
import type { VideoMetaPatch, VideoRecord } from "../storage";

/**
 * Local video library (requirements F-50, F-51): every video that reaches the
 * compare screen (timer capture or file pick) is saved here so it survives
 * closing the app, and can be reused across sessions without re-picking.
 */

export interface LibraryEntry extends VideoRecord {
  /** Object URL for thumbnailBlob, revoked automatically on refresh/unmount. */
  thumbnailUrl: string | null;
}

export interface VideoLibrary {
  entries: LibraryEntry[];
  loading: boolean;
  error: string;
  refresh: () => void;
  /** Probe + thumbnail + persist a captured/picked clip. Throws on storage failure. */
  saveVideo: (blob: Blob, name: string) => Promise<VideoRecord>;
  loadBlob: (id: string) => Promise<Blob | null>;
  updateMeta: (id: string, patch: VideoMetaPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useVideoLibrary(): VideoLibrary {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const thumbUrlsRef = useRef<string[]>([]);

  const revokeThumbs = () => {
    thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    thumbUrlsRef.current = [];
  };

  const refresh = useCallback(() => {
    setLoading(true);
    getStorage()
      .listVideos()
      .then((records) => {
        revokeThumbs();
        const withThumbs = records.map((r) => {
          const url = r.thumbnailBlob ? URL.createObjectURL(r.thumbnailBlob) : null;
          if (url) thumbUrlsRef.current.push(url);
          return { ...r, thumbnailUrl: url };
        });
        setEntries(withThumbs);
        setError("");
      })
      .catch(() => setError("ライブラリの読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    return revokeThumbs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveVideo = useCallback(async (blob: Blob, name: string): Promise<VideoRecord> => {
    // Best-effort metadata; a probe/thumbnail failure shouldn't block saving
    // the video itself (F-50 cares about not losing the clip).
    const [probe, thumbnailBlob] = await Promise.all([
      probeVideo(blob).catch(() => null),
      generateThumbnail(blob).catch(() => null),
    ]);
    const record = await getStorage().saveVideo(blob, {
      name,
      durationSec: probe?.durationSeconds ?? 0,
      mimeType: blob.type,
      thumbnailBlob,
    });
    refresh();
    return record;
  }, [refresh]);

  const loadBlob = useCallback((id: string) => getStorage().getVideoBlob(id), []);

  const updateMeta = useCallback(
    async (id: string, patch: VideoMetaPatch) => {
      await getStorage().updateVideoMeta(id, patch);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await getStorage().deleteVideo(id);
      refresh();
    },
    [refresh],
  );

  return { entries, loading, error, refresh, saveVideo, loadBlob, updateMeta, remove };
}
