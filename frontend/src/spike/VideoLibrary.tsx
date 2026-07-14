import { useState } from "react";
import type { LibraryEntry, VideoLibrary as VideoLibraryHook } from "./useVideoLibrary";

/**
 * Local video library UI (F-51): browse saved clips, drop one into compare
 * slot A/B, edit trick tag / memo, or delete. Reuses the .video-list /
 * .video-card look already established by the MVP console tab.
 */

interface VideoLibraryProps {
  library: VideoLibraryHook;
  onSelect: (which: "A" | "B", entry: LibraryEntry) => void;
  onClose: () => void;
}

export function VideoLibrary({ library, onSelect, onClose }: VideoLibraryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="camera-overlay" role="dialog" aria-label="動画ライブラリ">
      <div className="camera-modal">
        <div className="camera-head">
          <strong>動画ライブラリ</strong>
          <button onClick={onClose}>閉じる</button>
        </div>

        {library.error ? <p className="camera-error">{library.error}</p> : null}
        {library.loading ? <p className="hint">読み込み中…</p> : null}
        {!library.loading && library.entries.length === 0 ? (
          <p className="hint">
            保存された動画はまだありません。タイマー撮影するか動画ファイルを選択すると、自動でここに保存されます。
          </p>
        ) : null}

        <div className="video-list">
          {library.entries.map((entry) => (
            <LibraryRow
              key={entry.id}
              entry={entry}
              editing={editingId === entry.id}
              onEdit={() => setEditingId(entry.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => {
                void library.updateMeta(entry.id, patch);
                setEditingId(null);
              }}
              onDelete={() => void library.remove(entry.id)}
              onPick={(which) => onSelect(which, entry)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface LibraryRowProps {
  entry: LibraryEntry;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { name: string; tag: string; memo: string }) => void;
  onDelete: () => void;
  onPick: (which: "A" | "B") => void;
}

function LibraryRow({ entry, editing, onEdit, onCancelEdit, onSave, onDelete, onPick }: LibraryRowProps) {
  const [tag, setTag] = useState(entry.tag);
  const [memo, setMemo] = useState(entry.memo);

  if (editing) {
    return (
      <div className="video-card library-edit">
        <div className="meta">
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="技名" />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ" />
        </div>
        <div className="library-actions">
          <button className="primary" onClick={() => onSave({ name: entry.name, tag, memo })}>
            保存
          </button>
          <button onClick={onCancelEdit}>やめる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="video-card">
      {entry.thumbnailUrl ? (
        <img src={entry.thumbnailUrl} alt="" />
      ) : (
        <div className="thumb-placeholder" />
      )}
      <div className="meta">
        <div>{entry.tag || entry.name}</div>
        <div className="sub">
          {entry.durationSec.toFixed(1)}s ・ {new Date(entry.createdAt).toLocaleString()}
          {entry.memo ? ` ・ ${entry.memo}` : ""}
        </div>
      </div>
      <div className="library-actions">
        <button onClick={() => onPick("A")}>Aへ</button>
        <button onClick={() => onPick("B")}>Bへ</button>
        <button onClick={onEdit}>編集</button>
        <button onClick={onDelete}>削除</button>
      </div>
    </div>
  );
}
