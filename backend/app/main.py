from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, engine
from .routers import auth, comparisons, videos

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Scaffold convenience: create tables on startup. Replace with Alembic
    # migrations before this graduates past the MVP.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="trickline API", version="0.1.0", lifespan=lifespan)

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
