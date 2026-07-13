from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import auth, comparisons, videos

settings = get_settings()

# Schema management moved to Alembic (see backend/alembic/). The previous
# lifespan hook that called Base.metadata.create_all on every startup was
# removed rather than kept as a "dev fallback": with async_sessionmaker code
# on top of models.py, a silent create_all makes it easy to change a model,
# forget to write a migration, and still have the app "work" locally while
# being out of sync with what `alembic upgrade head` would produce elsewhere
# (and in prod). Run `alembic upgrade head` after `docker compose up -d`
# (see backend/README.md) before starting the API.
app = FastAPI(title="trickline API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(videos.router)
app.include_router(comparisons.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
