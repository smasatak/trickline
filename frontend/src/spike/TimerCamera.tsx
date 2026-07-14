import { useEffect, useMemo, useState } from "react";
import { useTimerCamera } from "./useTimerCamera";

/**
 * Timer capture modal (F-14): pick a start delay and a recording length,
 * prop the phone up, tap start, and read the big countdown from a distance.
 * The finished clip goes straight into compare slot A or B — no upload.
 */

const DELAY_OPTIONS = [3, 5, 10, 20]; // seconds until recording starts
const DURATION_OPTIONS = [5, 10, 15, 30, 60]; // recording length, max 60s (F-05)

interface TimerCameraProps {
  hasA: boolean;
  hasB: boolean;
  onUse: (which: "A" | "B", blob: Blob) => void;
  onClose: () => void;
}

export function TimerCamera({ hasA, hasB, onUse, onClose }: TimerCameraProps) {
  const cam = useTimerCamera();
  const [delaySec, setDelaySec] = useState(5);
  const [recordSec, setRecordSec] = useState(15);

  // Playback URL for the recorded clip; revoked when replaced or on close.
  const resultUrl = useMemo(
    () => (cam.result ? URL.createObjectURL(cam.result.blob) : null),
    [cam.result],
  );
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const busy = cam.phase === "countdown" || cam.phase === "recording";

  return (
    <div className="camera-overlay" role="dialog" aria-label="タイマー撮影">
      <div className="camera-modal">
        <div className="camera-head">
          <strong>タイマー撮影</strong>
          {!busy ? <button onClick={onClose}>閉じる</button> : null}
        </div>

        {cam.phase === "error" ? (
          <p className="camera-error">{cam.error}</p>
        ) : (
          <>
            <div className="camera-frame">
              <video
                ref={cam.previewRef}
                playsInline
                muted
                autoPlay
                style={{ display: cam.phase === "done" ? "none" : undefined }}
              />
              {cam.phase === "done" && resultUrl ? (
                <video src={resultUrl} playsInline muted controls loop autoPlay />
              ) : null}
              {cam.phase === "starting" ? (
                <div className="camera-status">カメラ起動中…</div>
              ) : null}
              {cam.phase === "countdown" ? (
                <div className="camera-count">{cam.remaining}</div>
              ) : null}
              {cam.phase === "recording" ? (
                <>
                  <div className="camera-rec-badge">● REC</div>
                  <div className="camera-count recording">{cam.remaining}</div>
                </>
              ) : null}
            </div>

            {cam.phase === "ready" || cam.phase === "starting" ? (
              <>
                <div className="camera-settings">
                  <label>
                    開始まで
                    <select
                      value={delaySec}
                      onChange={(e) => setDelaySec(parseInt(e.target.value, 10))}
                    >
                      {DELAY_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}秒
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    録画時間
                    <select
                      value={recordSec}
                      onChange={(e) => setRecordSec(parseInt(e.target.value, 10))}
                    >
                      {DURATION_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}秒
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="primary camera-main-btn"
                  disabled={cam.phase !== "ready"}
                  onClick={() => cam.start(delaySec, recordSec)}
                >
                  ▶ 撮影開始（{delaySec}秒後に{recordSec}秒間）
                </button>
              </>
            ) : null}

            {busy ? (
              <button className="camera-main-btn" onClick={cam.abort}>
                ✕ 中断
              </button>
            ) : null}

            {cam.phase === "done" && cam.result ? (
              <div className="camera-actions">
                <button
                  className="primary"
                  onClick={() => onUse("A", cam.result!.blob)}
                >
                  Aにセット{hasA ? "（上書き）" : ""}
                </button>
                <button
                  className="primary"
                  onClick={() => onUse("B", cam.result!.blob)}
                >
                  Bにセット{hasB ? "（上書き）" : ""}
                </button>
                <button onClick={cam.retake}>撮り直す</button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
