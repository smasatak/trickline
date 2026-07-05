# trickline

スノーボード動画分析アプリ。2本の動画を同期比較してフォーム上達を支援する。
要求ドキュメントは [`docs/requirements.md`](docs/requirements.md)。

現状は **フェーズ1 の土台** を2つ用意した段階です。

## この段階で作ったもの

### ① 比較スパイク（技術検証・バックエンド不要）
`frontend` の「① 比較スパイク」タブ。ローカルの動画2本を読み込み、MVPの
核心である **2動画同期再生・スロー再生・コマ送り (F-20〜F-24)** を検証できる。
アップロードもアカウントも不要で、ブラウザだけで動く。

- 各動画に「基準点」（例：離陸の瞬間）をマークして時間軸を揃える (F-22)
- 0.25〜1倍のスロー再生 (F-21)
- `requestVideoFrameCallback` があればそれを使い、なければ 1/fps 近似でコマ送り (F-23)
- Space=再生/停止、←→=コマ送り

**まずここで「コマ単位の同期比較」が体験として成立するかを確かめる**のが狙い。

### ② MVPスキャフォールド（API連携の骨組み）
FastAPI + PostgreSQL(asyncpg) + S3互換ストレージ。動画バイナリはAPIを通さず
presigned URL で直接ストレージへ (F-06)。サムネイルはクライアント側生成 (F-04)。

`frontend` の「② MVPコンソール」タブが、登録→ログイン→直接アップロード→一覧の
パイプライン全体をローカルで通しで検証するスモークテストになっている。

## 構成

```
trickline/
├── docs/requirements.md   要求ドキュメント
├── docker-compose.yml     Postgres + MinIO(=ローカルR2代替)
├── backend/               FastAPI + SQLAlchemy(async) + boto3
└── frontend/              React + Vite + TypeScript
```

## 動かす

### 1. インフラ（Postgres + MinIO）

```bash
docker compose up -d
```

### 2. バックエンド

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # mac/Linux: .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```
→ API: http://localhost:8000/docs

### 3. フロントエンド

```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:5173

「① 比較スパイク」はバックエンド無しでも動く。「② MVPコンソール」は上記1〜2が必要。

## 次にやること（要求ドキュメント基準）

- スパイクで得た手応えをもとに、比較UIを本実装（ComparisonSession の保存/読込を
  バックエンドに接続）
- Alembic 導入（現状は起動時 `create_all` の暫定）
- 実 Cloudflare R2 への切り替え（`backend/.env` のエンドポイント差し替えのみ）
- フェーズ2の骨格推定は、着工前に実映像フィジビリティスパイクを実施 (D-08)
