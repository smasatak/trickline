import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---- Auth ----
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    level: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    level: str | None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- Uploads ----
class UploadInitRequest(BaseModel):
    content_type: str
    duration_seconds: float
    trick_tag: str | None = None
    category: str | None = None


class UploadInitResponse(BaseModel):
    video_id: uuid.UUID
    upload_url: str
    thumbnail_upload_url: str
    object_key: str
    thumbnail_key: str


class UploadCompleteRequest(BaseModel):
    note: str | None = None


# ---- Videos ----
class VideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    trick_tag: str | None
    category: str | None
    note: str | None
    duration_seconds: float | None
    status: str
    created_at: datetime
    playback_url: str | None = None
    thumbnail_url: str | None = None


class VideoUpdate(BaseModel):
    trick_tag: str | None = None
    category: str | None = None
    note: str | None = None


# ---- Comparison sessions ----
class ComparisonCreate(BaseModel):
    video_a_id: uuid.UUID
    video_b_id: uuid.UUID
    offset_a_ms: int = 0
    offset_b_ms: int = 0
    title: str | None = None


class ComparisonUpdate(BaseModel):
    offset_a_ms: int | None = None
    offset_b_ms: int | None = None
    title: str | None = None


class ComparisonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    video_a_id: uuid.UUID
    video_b_id: uuid.UUID
    offset_a_ms: int
    offset_b_ms: int
    title: str | None
    created_at: datetime
