# trickline backend

FastAPI + PostgreSQL (asyncpg) + S3-compatible storage (MinIO locally / R2 in prod).

The API server never handles video bytes. The client uploads directly to
object storage via presigned PUT URLs (requirements F-06).

## Run locally

From the repo root, start Postgres + MinIO:

```bash
docker compose up -d
```

Then run the API:

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash; use .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

- API docs: http://localhost:8000/docs
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

## Upload flow

1. `POST /api/videos/upload-init` → returns presigned PUT URLs (video + thumbnail) and a `video_id`.
2. Client `PUT`s the video and thumbnail bytes directly to the returned URLs.
3. `POST /api/videos/{video_id}/complete` → marks the video `ready`.

## Notes

- Tables are auto-created on startup for scaffold convenience. Swap in Alembic
  before real use.
- Duration/content-type limits (F-02, F-05) are enforced at `upload-init`.
  Trimming to <= 60s and thumbnail generation happen client-side (F-04, D-04).
