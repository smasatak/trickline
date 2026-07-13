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
pip install -e .                 # dependencies are declared in pyproject.toml
cp .env.example .env
alembic upgrade head             # create/update tables (see "Database migrations" below)
uvicorn app.main:app --reload
```

- API docs: http://localhost:8000/docs
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

## Database migrations (Alembic)

Schema is managed with Alembic; there is no more `create_all`-on-startup
scaffold. `alembic/env.py` reuses `app.config.get_settings().database_url`
and `app.db.Base.metadata`, so the DB URL and models are only defined once
(in the app itself), not duplicated in `alembic.ini`.

```bash
# Apply all pending migrations (do this after docker compose up -d,
# before starting uvicorn):
alembic upgrade head

# After changing models.py, generate a new revision:
alembic revision --autogenerate -m "describe the change"
# then inspect the generated file under alembic/versions/ before applying:
alembic upgrade head

# Roll back one revision:
alembic downgrade -1
```

Async note: the app uses SQLAlchemy's async engine (asyncpg) everywhere, so
`alembic/env.py` was generated with Alembic's `async` template — it builds an
`AsyncEngine` and runs the sync migration machinery via `connection.run_sync`,
rather than requiring a second, sync-only driver/URL just for migrations.

## Upload flow

1. `POST /api/videos/upload-init` → returns presigned PUT URLs (video + thumbnail) and a `video_id`.
2. Client `PUT`s the video and thumbnail bytes directly to the returned URLs.
3. `POST /api/videos/{video_id}/complete` → marks the video `ready`.

## Notes

- Duration/content-type limits (F-02, F-05) are enforced at `upload-init`.
  Trimming to <= 60s and thumbnail generation happen client-side (F-04, D-04).

## Switching to Cloudflare R2

Locally, MinIO stands in for R2 (both speak the S3 API). `app/storage.py`
and `app/config.py` read all storage settings from env vars, so switching
from MinIO to R2 is meant to be a pure env var change — no code changes.
Steps to actually do it:

1. **Create an R2 bucket.** In the Cloudflare dashboard: R2 > Create bucket.
   Note the bucket name and your Account ID (shown in the R2 overview page).
2. **Create an API token.** R2 > Manage R2 API Tokens > Create API Token.
   Give it "Object Read & Write" permission scoped to the bucket above. This
   gives you an Access Key ID and Secret Access Key (shown once).
3. **Set the public URL for playback.** Either:
   - enable the bucket's public dev URL (`https://<hash>.r2.dev`) for
     testing, or
   - map a custom domain to the bucket (R2 > bucket > Settings > Custom
     Domains) for production.
4. **Update `.env`** (see `.env.example` for the full list):

   | Variable | Value for R2 |
   |---|---|
   | `S3_ENDPOINT_URL` | `https://<accountid>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_ACCESS_KEY_ID` | the Access Key ID from step 2 |
   | `S3_SECRET_ACCESS_KEY` | the Secret Access Key from step 2 |
   | `S3_BUCKET` | the bucket name from step 1 |
   | `S3_PUBLIC_BASE_URL` | the `r2.dev` URL or custom domain from step 3 |
   | `S3_USE_PATH_STYLE` | `true` (works for both MinIO and R2; leave as-is) |

5. Restart the API. No code changes are required — `app/storage.py` builds
   its boto3 client entirely from these settings.

Note: `S3_USE_PATH_STYLE` was added (default `true`) because R2 does not
support virtual-hosted-style addressing (`https://<bucket>.<endpoint>/key`)
the way AWS S3 does; it needs path-style (`https://<endpoint>/<bucket>/key`).
MinIO also defaults to path-style, so this setting is safe to leave
unchanged when switching between the two.
