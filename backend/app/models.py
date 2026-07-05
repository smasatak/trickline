import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Self-reported level: beginner / intermediate / advanced
    level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    videos: Mapped[list["UserVideo"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserVideo(Base):
    __tablename__ = "user_videos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # R2 / S3 object keys. The API never touches the binary; the client
    # uploads directly via a presigned URL (see requirements F-06).
    object_key: Mapped[str] = mapped_column(String(512))
    thumbnail_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    trick_tag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(nullable=True)

    # "pending" until the client confirms the direct upload finished.
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="videos")


class ComparisonSession(Base):
    __tablename__ = "comparison_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    video_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_videos.id", ondelete="CASCADE"))
    video_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_videos.id", ondelete="CASCADE"))

    # Per-video timing offset in milliseconds, so the two clips line up at
    # the moment the user marked (e.g. take-off). See F-22.
    offset_a_ms: Mapped[int] = mapped_column(Integer, default=0)
    offset_b_ms: Mapped[int] = mapped_column(Integer, default=0)

    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
