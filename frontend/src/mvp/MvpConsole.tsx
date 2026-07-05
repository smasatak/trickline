import { useCallback, useEffect, useState } from "react";
import {
  api,
  hasToken,
  putToStorage,
  setToken,
  type VideoOut,
} from "../api/client";
import { generateThumbnail, probeVideo } from "../media/videoUtils";

const MAX_SECONDS = 60;

/**
 * Item 2 smoke test: exercises the full MVP pipeline against the local
 * backend — register/login, presigned direct upload with client-side
 * thumbnail (F-04/F-06), and the video list. Deliberately minimal UI; this
 * proves the stack is wired end to end, not a finished product.
 */
export function MvpConsole() {
  const [authed, setAuthed] = useState(hasToken());
  const [health, setHealth] = useState<string>("...");
  const [email, setEmail] = useState("rider@example.com");
  const [password, setPassword] = useState("password123");
  const [videos, setVideos] = useState<VideoOut[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const say = useCallback(
    (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 20)),
    [],
  );

  useEffect(() => {
    api.health().then((h) => setHealth(h.status)).catch(() => setHealth("unreachable"));
  }, []);

  const refresh = useCallback(async () => {
    try {
      setVideos(await api.listVideos());
    } catch (e) {
      say(`一覧取得エラー: ${(e as Error).message}`);
    }
  }, [say]);

  useEffect(() => {
    if (authed) void refresh();
  }, [authed, refresh]);

  const doAuth = async (mode: "register" | "login") => {
    try {
      const t = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      setToken(t.access_token);
      setAuthed(true);
      say(`${mode} 成功`);
    } catch (e) {
      say(`${mode} 失敗: ${(e as Error).message}`);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      say(`probe: ${file.name}`);
      const probe = await probeVideo(file);
      if (probe.durationSeconds > MAX_SECONDS) {
        say(`${probe.durationSeconds.toFixed(1)}s > ${MAX_SECONDS}s 上限。トリミングが必要 (F-05)`);
        return;
      }
      say("サムネイル生成中 (client-side, F-04)");
      const thumb = await generateThumbnail(file);

      say("presigned URL 取得 (upload-init)");
      const init = await api.uploadInit({
        content_type: file.type || "video/mp4",
        duration_seconds: probe.durationSeconds,
      });

      say("R2/MinIO へ直接 PUT (動画 + サムネ, F-06)");
      await putToStorage(init.upload_url, file, file.type || "video/mp4");
      await putToStorage(init.thumbnail_upload_url, thumb, "image/jpeg");

      say("complete → status: ready");
      await api.uploadComplete(init.video_id);
      await refresh();
      say("アップロード完了");
    } catch (err) {
      say(`アップロード失敗: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.deleteVideo(id);
      await refresh();
    } catch (e) {
      say(`削除失敗: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mvp">
      <p>
        API health: <strong className={health === "ok" ? "ok" : "bad"}>{health}</strong>
        {health !== "ok" && "（backend + docker compose を起動してください）"}
      </p>

      {!authed ? (
        <div className="auth">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
          />
          <button onClick={() => doAuth("register")}>登録</button>
          <button onClick={() => doAuth("login")}>ログイン</button>
        </div>
      ) : (
        <>
          <div className="uploader">
            <label className="upload-btn">
              {busy ? "処理中..." : "動画をアップロード"}
              <input type="file" accept="video/*" disabled={busy} onChange={onUpload} hidden />
            </label>
            <button
              onClick={() => {
                setToken(null);
                setAuthed(false);
              }}
            >
              ログアウト
            </button>
          </div>

          <div className="video-list">
            {videos.length === 0 && <p className="hint">まだ動画がありません。</p>}
            {videos.map((v) => (
              <div className="video-card" key={v.id}>
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" />
                ) : (
                  <div className="thumb-placeholder" />
                )}
                <div className="meta">
                  <div>{v.trick_tag ?? "(無題)"}</div>
                  <div className="sub">
                    {v.duration_seconds?.toFixed(1)}s · {v.status}
                  </div>
                </div>
                <button onClick={() => onDelete(v.id)}>削除</button>
              </div>
            ))}
          </div>
        </>
      )}

      <pre className="log">{log.join("\n")}</pre>
    </div>
  );
}
