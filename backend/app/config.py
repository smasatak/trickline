from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://trickline:trickline@localhost:5432/trickline"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "auto"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket: str = "trickline-videos"
    s3_public_base_url: str = "http://localhost:9000/trickline-videos"
    # Path-style addressing (http://endpoint/bucket/key) instead of
    # virtual-hosted-style (http://bucket.endpoint/key). MinIO and Cloudflare
    # R2 both work with path-style, so it's kept as the default for both and
    # is only exposed here in case a future backend needs virtual-hosted.
    s3_use_path_style: bool = True

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080

    max_video_seconds: int = 60
    allowed_content_types: str = "video/mp4,video/quicktime"

    cors_origins: str = "http://localhost:5173"

    @property
    def allowed_content_types_set(self) -> set[str]:
        return {c.strip() for c in self.allowed_content_types.split(",") if c.strip()}

    @property
    def cors_origins_list(self) -> list[str]:
        return [c.strip() for c in self.cors_origins.split(",") if c.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
