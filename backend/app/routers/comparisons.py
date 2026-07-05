import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ComparisonSession, User, UserVideo
from ..schemas import ComparisonCreate, ComparisonOut, ComparisonUpdate
from ..security import get_current_user

router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])


@router.post("", response_model=ComparisonOut, status_code=201)
async def create_comparison(
    payload: ComparisonCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for vid in (payload.video_a_id, payload.video_b_id):
        v = await db.get(UserVideo, vid)
        if not v or v.user_id != user.id:
            raise HTTPException(status_code=404, detail=f"Video not found: {vid}")

    session = ComparisonSession(
        user_id=user.id,
        video_a_id=payload.video_a_id,
        video_b_id=payload.video_b_id,
        offset_a_ms=payload.offset_a_ms,
        offset_b_ms=payload.offset_b_ms,
        title=payload.title,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("", response_model=list[ComparisonOut])
async def list_comparisons(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.scalars(
        select(ComparisonSession)
        .where(ComparisonSession.user_id == user.id)
        .order_by(ComparisonSession.created_at.desc())
    )
    return list(rows)


@router.patch("/{session_id}", response_model=ComparisonOut)
async def update_comparison(
    session_id: uuid.UUID,
    payload: ComparisonUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ComparisonSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Comparison not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return session
