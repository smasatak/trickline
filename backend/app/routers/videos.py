import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import User, UserVideo
from ..schemas import (
    UploadCompleteRequest,
    UploadInitRequest,
    UploadInitResponse,
    VideoOut,
    VideoUpdate,
)
from ..security import get_current_user
from ..storage import presign_put, public_url

router = APIRouter(prefix="/api/videos", tags=["videos"])
settings = get_settings()


def _to_out(v: UserVideo) -> VideoOut:
    out = VideoOut.model_validate(v)
    out.playback_url = public_url(v.object_key) if v.status == "ready" else None
    out.thumbnail_url = public_url(v.thumbnail_key)
    return out


@router.post("/upload-init", response_model=UploadInitResponse)
async def upload_init(
    payload: UploadInitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.content_type not in settings.allowed_content_types_set:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {payload.content_type}")
    if payload.duration_seconds > settings.max_video_seconds:
        raise HTTPException(
            status_code=400,
            detail=f"Video exceeds {settings.max_video_seconds}s limit. Please trim before upload.",
        )

    video_id = uuid.uuid4()
    ext = "mov" if payload.content_type == "video/quicktime" else "mp4"
    object_key = f"users/{user.id}/videos/{video_id}.{ext}"
    thumbnail_key = f"users/{user.id}/videos/{video_id}.jpg"

    video = UserVideo(
        id=video_id,
        user_id=user.id,
        object_key=object_key,
        thumbnail_key=thumbnail_key,
        trick_tag=payload.trick_tag,
        category=payload.category,
        duration_seconds=payload.duration_seconds,
        status="pending",
    )
    db.add(video)
    await db.commit()

    return UploadInitResponse(
        video_id=video_id,
        upload_url=presign_put(object_key, payload.content_type),
        thumbnail_upload_url=presign_put(thumbnail_key, "image/jpeg"),
        object_key=object_key,
        thumbnail_key=thumbnail_key,
    )


@router.post("/{video_id}/complete", response_model=VideoOut)
async def upload_complete(
    video_id: uuid.UUID,
    payload: UploadCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_owned(db, user, video_id)
    video.status = "ready"
    if payload.note is not None:
        video.note = payload.note
    await db.commit()
    await db.refresh(video)
    return _to_out(video)


@router.get("", response_model=list[VideoOut])
async def list_videos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.scalars(
        select(UserVideo).where(UserVideo.user_id == user.id).order_by(UserVideo.created_at.desc())
    )
    return [_to_out(v) for v in rows]


@router.patch("/{video_id}", response_model=VideoOut)
async def update_video(
    video_id: uuid.UUID,
    payload: VideoUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_owned(db, user, video_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(video, field, value)
    await db.commit()
    await db.refresh(video)
    return _to_out(video)


@router.delete("/{video_id}", status_code=204)
async def delete_video(
    video_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    video = await _get_owned(db, user, video_id)
    await db.delete(video)
    await db.commit()


async def _get_owned(db: AsyncSession, user: User, video_id: uuid.UUID) -> UserVideo:
    video = await db.get(UserVideo, video_id)
    if not video or video.user_id != user.id:
        raise HTTPException(status_code=404, detail="Video not found")
    return video
