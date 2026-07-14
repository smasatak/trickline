import { useEffect, useRef, useState } from "react";
import { usePoseOverlay } from "./usePoseOverlay";
import { useSyncedPlayers } from "./useSyncedPlayers";

const RATES = [0.25, 0.5, 0.75, 1];
const BASE_MARK = "抜け";

interface PickedVideo {
  name: string;
  sizeMb: string;
  type: string;
  width?: number;
  height?: number;
}

function fmt(t: number): string {
  if (!isFinite(t)) return "0.00";
  return t.toFixed(2);
}

function fmtVideo(v: PickedVideo | null, duration: number): string {
  if (!v) return "not selected";
  const size = `${v.sizeMb}MB`;
  const dimensions = v.width && v.height ? `${v.width}x${v.height}` : "unknown size";
  const type = v.type || "unknown type";
  return `${v.name} / ${size} / ${dimensions} / ${fmt(duration)}s / ${type}`;
}

/**
 * Item 1 (technical validation spike): loads two LOCAL video files — no
 * backend, no upload — and lets you sync-compare them frame by frame.
 * This validates the core UX bet before building the full MVP.
 */
export function CompareSpike() {
  const p = useSyncedPlayers();
  const pose = usePoseOverlay(p.videoARef, p.videoBRef);
  const [urlA, setUrlA] = useState<string | null>(null);
  const [urlB, setUrlB] = useState<string | null>(null);
  const [fileA, setFileA] = useState<PickedVideo | null>(null);
  const [fileB, setFileB] = useState<PickedVideo | null>(null);
  const [testNote, setTestNote] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const pick = (which: "A" | "B") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const picked = {
      name: file.name,
      sizeMb: (file.size / 1024 / 1024).toFixed(1),
      type: file.type,
    };
    urlsRef.current.push(url);
    if (which === "A") {
      setUrlA(url);
      setFileA(picked);
    } else {
      setUrlB(url);
      setFileB(picked);
    }
  };

  // Keyboard: space = play/pause, arrows = step frame.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        p.toggle();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        p.stepFrames(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        p.stepFrames(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);

  const onLoadedMetadata = (which: "A" | "B") => (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const update = (current: PickedVideo | null): PickedVideo | null =>
      current ? { ...current, width: v.videoWidth, height: v.videoHeight } : current;
    if (which === "A") setFileA(update);
    else setFileB(update);
  };

  const buildTestLog = () => {
    const drift = Math.abs(p.videoBTime - (p.masterTime - p.markA + p.markB));
    return [
      "trickline playback test",
      `date: ${new Date().toISOString()}`,
      `userAgent: ${navigator.userAgent}`,
      `mode: ${p.syncMode}`,
      `playbackRate: ${p.playbackRate}`,
      `fps step: ${p.fps}`,
      `supports requestVideoFrameCallback: ${p.supportsRVFC ? "yes" : "no"}`,
      `A: ${fmtVideo(fileA, p.durationA)}`,
      `B: ${fmtVideo(fileB, p.durationB)}`,
      `markA: ${fmt(p.markA)}s`,
      `markB: ${fmt(p.markB)}s`,
      `currentA: ${fmt(p.masterTime)}s`,
      `currentB: ${fmt(p.videoBTime)}s`,
      `estimated drift: ${fmt(drift)}s`,
      `note: ${testNote || "-"}`,
    ].join("\n");
  };

  const copyTestLog = async () => {
    const text = buildTestLog();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("コピー済み");
    } catch {
      setCopyStatus(text);
    }
  };

  return (
    <div className="spike">
      <div className="videos">
        <div className="video-col">
          <input type="file" accept="video/*" onChange={pick("A")} />
          <div className="video-meta">
            <strong>A 基準</strong>
            <span>{fileA ? `${fileA.name} / ${fileA.sizeMb}MB` : "動画未選択"}</span>
            <span>{p.durationA ? `${fmt(p.durationA)}s` : "duration --"}</span>
          </div>
          <div className="video-frame">
            <video
              ref={p.videoARef}
              src={urlA ?? undefined}
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={onLoadedMetadata("A")}
            />
            {pose.enabled ? <canvas ref={pose.canvasARef} className="pose-canvas" /> : null}
          </div>
          <div className="local-timeline">
            <input
              type="range"
              min={0}
              max={p.durationA || 0}
              step={1 / p.fps}
              value={p.masterTime}
              disabled={!p.durationA || p.playing}
              onChange={(e) => p.seekVideo("A", parseFloat(e.target.value))}
            />
            <span>{fmt(p.masterTime)}s</span>
          </div>
          <div className="mark">
            <button onClick={() => p.markHere("A")}>Aをこの瞬間にする</button>
            <span>{BASE_MARK}: {fmt(p.markA)}s</span>
          </div>
        </div>

        <div className="video-col">
          <input type="file" accept="video/*" onChange={pick("B")} />
          <div className="video-meta">
            <strong>B 比較</strong>
            <span>{fileB ? `${fileB.name} / ${fileB.sizeMb}MB` : "動画未選択"}</span>
            <span>{p.durationB ? `${fmt(p.durationB)}s` : "duration --"}</span>
          </div>
          <div className="video-frame">
            <video
              ref={p.videoBRef}
              src={urlB ?? undefined}
              playsInline
              muted
              preload="auto"
              onLoadedMetadata={onLoadedMetadata("B")}
            />
            {pose.enabled ? <canvas ref={pose.canvasBRef} className="pose-canvas" /> : null}
          </div>
          <div className="local-timeline">
            <input
              type="range"
              min={0}
              max={p.durationB || 0}
              step={1 / p.fps}
              value={p.videoBTime}
              disabled={!p.durationB || p.playing}
              onChange={(e) => p.seekVideo("B", parseFloat(e.target.value))}
            />
            <span>{fmt(p.videoBTime)}s</span>
          </div>
          <div className="mark">
            <button onClick={() => p.markHere("B")}>Bをこの瞬間にする</button>
            <span>{BASE_MARK}: {fmt(p.markB)}s</span>
          </div>
        </div>
      </div>

      <div className="timeline">
        <input
          type="range"
          min={0}
          max={p.durationA || 0}
          step={1 / p.fps}
          value={p.masterTime}
          disabled={!p.ready}
          onChange={(e) => p.seekMaster(parseFloat(e.target.value))}
        />
        <span className="clock">
          {fmt(p.masterTime)} / {fmt(p.durationA)}s
        </span>
      </div>

      <div className="controls">
        <button onClick={() => p.stepFrames(-1)} disabled={!p.ready}>
          ◀ コマ戻し
        </button>
        <button onClick={p.toggle} disabled={!p.ready} className="primary">
          {p.playing ? "❚❚ 停止" : "▶ 同時再生"}
        </button>
        <button onClick={() => p.stepFrames(1)} disabled={!p.ready}>
          コマ送り ▶
        </button>

        <label>
          再生
          <select value={p.syncMode} onChange={(e) => p.setSyncMode(e.target.value as typeof p.syncMode)}>
            <option value="stable">安定優先</option>
            <option value="sync">同期優先</option>
          </select>
        </label>

        <label>
          速度
          <select
            value={p.playbackRate}
            onChange={(e) => p.setPlaybackRate(parseFloat(e.target.value))}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>

        <label>
          fps
          <input
            type="number"
            min={1}
            max={120}
            value={p.fps}
            onChange={(e) => p.setFps(parseInt(e.target.value || "30", 10))}
            style={{ width: 56 }}
          />
        </label>

        <button onClick={p.resetMarks}>基準点リセット</button>

        <label className="pose-toggle">
          <input
            type="checkbox"
            checked={pose.enabled}
            disabled={pose.loading}
            onChange={pose.toggle}
          />
          骨格表示
          {pose.loading ? <span className="pose-status">読み込み中…</span> : null}
          {pose.error ? <span className="pose-status error">{pose.error}</span> : null}
        </label>
      </div>

      <div className="test-log">
        <label>
          検証メモ
          <textarea
            rows={3}
            value={testNote}
            onChange={(e) => setTestNote(e.target.value)}
            placeholder="例: iPhone 15 Safari。安定優先は許容、同期優先はBが2秒付近で詰まる。"
          />
        </label>
        <button onClick={copyTestLog} disabled={!fileA || !fileB}>
          検証ログをコピー
        </button>
        {copyStatus ? <pre>{copyStatus}</pre> : null}
      </div>

      <p className="hint">
        Space = 再生/停止、← → = コマ送り。A/Bそれぞれで「{BASE_MARK}」の瞬間を
        指定すると、その瞬間を揃えて同期再生します。将来はこの瞬間の自動候補検出を検証します。
        {" "}
        コマ送り精度:{" "}
        <strong>{p.supportsRVFC ? "requestVideoFrameCallback 対応" : "近似 (rAF)"}</strong>
        {" "}
        — フレーム厳密ではなく 1/fps 単位の近似です (F-23)。
      </p>
    </div>
  );
}
