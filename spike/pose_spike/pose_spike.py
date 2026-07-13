"""
D-08 骨格推定フィジビリティスパイク

sample_movies/ の実スノーボード映像に MediaPipe Pose をかけて、
ダボついたウェア・ゴーグル・雪面背景・モーションブラーの下でも
骨格推定が実用に足る精度で動くかを目視・簡易統計で確認する使い捨てスクリプト。

mediapipe 0.10.35 では旧 Solutions API (mp.solutions.pose) が廃止されているため、
Tasks API (PoseLandmarker) を使う。モデルファイルは同ディレクトリの
pose_landmarker_full.task（https://storage.googleapis.com/mediapipe-models/ から取得）。

使い方:
    cd spike/pose_spike
    .venv/bin/python pose_spike.py

出力 (spike/pose_spike/output/ 配下):
    <動画名>_annotated.mp4   骨格を重ね描きした動画（全フレーム）
    <動画名>_sample_frames/  一定間隔でのサンプル静止画（目視確認用）
    <動画名>_worst_frames/   検出信頼度が低かったフレームの静止画（失敗例の確認用）
    report.md                検出率・可視性スコアの集計と総合所見の下書き
"""

import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision
except ImportError as e:
    print(f"必要なライブラリが見つかりません: {e}")
    print("先に次を実行してください:")
    print("  .venv/bin/pip install -r requirements.txt")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MODEL_PATH = HERE / "pose_landmarker_full.task"
VIDEOS = [
    ROOT / "sample_movies" / "20260620-162326_e1kkKy.MOV",
    ROOT / "sample_movies" / "20260620-163628_yHJC8a.MOV",
]
OUTPUT_DIR = HERE / "output"

SAMPLE_FRAME_INTERVAL = 15  # 目視確認用サンプルを何フレームおきに保存するか
WORST_FRAME_COUNT = 8  # 可視性スコアが低かったフレームを何枚保存するか
VISIBILITY_THRESHOLD = 0.5  # このスコア未満は「信頼度が低い」扱い

# BlazePose 33ランドマークの接続定義（旧mp.solutions.pose.POSE_CONNECTIONS相当）
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),  # 顔
    (9, 10),  # 口
    (11, 12),  # 肩
    (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),  # 左腕
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),  # 右腕
    (11, 23), (12, 24), (23, 24),  # 胴体
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),  # 左脚
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),  # 右脚
]


def draw_pose(frame, landmarks):
    """検出したランドマークをフレームに重ね描きする。"""
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    for a, b in POSE_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (0, 255, 0), 2)
    for x, y in pts:
        cv2.circle(frame, (x, y), 3, (0, 0, 255), -1)


def make_landmarker():
    options = vision.PoseLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return vision.PoseLandmarker.create_from_options(options)


def process_video(video_path: Path, out_dir: Path) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"動画を開けませんでした: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    stem = video_path.stem
    sample_dir = out_dir / f"{stem}_sample_frames"
    worst_dir = out_dir / f"{stem}_worst_frames"
    sample_dir.mkdir(parents=True, exist_ok=True)
    worst_dir.mkdir(parents=True, exist_ok=True)

    writer = cv2.VideoWriter(
        str(out_dir / f"{stem}_annotated.mp4"),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    total_frames = 0
    detected_frames = 0
    visibility_scores = []  # フレームごとの平均visibility（検出できた場合のみ）
    worst_candidates = []  # (visibility, frame_idx, annotated_frame)

    with make_landmarker() as landmarker:
        frame_idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            total_frames += 1

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(frame_idx * 1000 / fps)
            result = landmarker.detect_for_video(mp_image, timestamp_ms)
            annotated = frame.copy()

            if result.pose_landmarks:
                detected_frames += 1
                landmarks = result.pose_landmarks[0]  # 1人目のみ対象
                scores = [lm.visibility for lm in landmarks]
                avg_visibility = float(np.mean(scores))
                visibility_scores.append(avg_visibility)
                draw_pose(annotated, landmarks)
                worst_candidates.append((avg_visibility, frame_idx, annotated.copy()))
            else:
                cv2.putText(
                    annotated, "NO POSE DETECTED", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2,
                )

            writer.write(annotated)

            if frame_idx % SAMPLE_FRAME_INTERVAL == 0:
                cv2.imwrite(str(sample_dir / f"frame_{frame_idx:05d}.jpg"), annotated)

            frame_idx += 1

    cap.release()
    writer.release()

    worst_candidates.sort(key=lambda t: t[0])
    for visibility, idx, img in worst_candidates[:WORST_FRAME_COUNT]:
        cv2.imwrite(str(worst_dir / f"frame_{idx:05d}_vis{visibility:.2f}.jpg"), img)

    low_conf_frames = sum(1 for v in visibility_scores if v < VISIBILITY_THRESHOLD)

    return {
        "video": video_path.name,
        "total_frames": total_frames,
        "detected_frames": detected_frames,
        "detection_rate": detected_frames / total_frames if total_frames else 0.0,
        "avg_visibility": float(np.mean(visibility_scores)) if visibility_scores else 0.0,
        "low_confidence_frames": low_conf_frames,
        "low_confidence_rate": low_conf_frames / total_frames if total_frames else 0.0,
    }


def main():
    if not MODEL_PATH.exists():
        print(f"モデルファイルがありません: {MODEL_PATH}")
        print("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
              "pose_landmarker_full/float16/latest/pose_landmarker_full.task を配置してください")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for video_path in VIDEOS:
        if not video_path.exists():
            print(f"skip: 見つかりません {video_path}")
            continue
        print(f"処理中: {video_path.name}")
        stats = process_video(video_path, OUTPUT_DIR)
        results.append(stats)
        print(f"  検出率: {stats['detection_rate']:.1%}  平均visibility: {stats['avg_visibility']:.2f}")

    report_lines = [
        "# 骨格推定フィジビリティスパイク結果 (D-08)",
        "",
        "モデル: MediaPipe PoseLandmarker (full, float16) / Tasks API, running_mode=VIDEO",
        "",
        "| 動画 | 総フレーム数 | 検出フレーム数 | 検出率 | 平均visibility | 低信頼度フレーム率 (<%.1f) |" % VISIBILITY_THRESHOLD,
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        report_lines.append(
            f"| {r['video']} | {r['total_frames']} | {r['detected_frames']} | "
            f"{r['detection_rate']:.1%} | {r['avg_visibility']:.2f} | {r['low_confidence_rate']:.1%} |"
        )
    report_lines += [
        "",
        "## 確認方法",
        "- `output/<動画名>_annotated.mp4` で全編を目視確認（着地・回転中の安定性を重点チェック）",
        "- `output/<動画名>_sample_frames/` で一定間隔のサンプルを確認",
        "- `output/<動画名>_worst_frames/` で最も信頼度が低かったフレームを確認し、"
        "ゴーグル・厚手ウェア・モーションブラーが原因かどうかを目視で判断する",
        "",
        "## 総合所見(要目視確認のうえ追記)",
        "- 検出率・平均visibilityの数値だけでなく、上記動画/フレームを実際に見て、"
        "フェーズ2(自動位置合わせ)に進めるか、別モデル・手動キャリブレーション併用が必要かを判断すること",
    ]
    (OUTPUT_DIR / "report.md").write_text("\n".join(report_lines), encoding="utf-8")
    print(f"\nレポート出力: {OUTPUT_DIR / 'report.md'}")


if __name__ == "__main__":
    main()
