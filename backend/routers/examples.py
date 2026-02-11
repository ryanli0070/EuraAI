"""Example CRUD endpoints using the database."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import Example

router = APIRouter(prefix="/examples", tags=["examples"])


class ExampleCreate(BaseModel):
    title: str
    content: str | None = None


class ExampleResponse(BaseModel):
    id: int
    title: str
    content: str | None
    created_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[ExampleResponse])
async def list_examples(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Example).order_by(Example.created_at.desc()))
    rows = result.scalars().all()
    return [
        ExampleResponse(
            id=r.id,
            title=r.title,
            content=r.content,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.post("", response_model=ExampleResponse)
async def create_example(body: ExampleCreate, db: AsyncSession = Depends(get_db)):
    row = Example(title=body.title, content=body.content)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return ExampleResponse(
        id=row.id,
        title=row.title,
        content=row.content,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.get("/{example_id}", response_model=ExampleResponse)
async def get_example(example_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Example).where(Example.id == example_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return ExampleResponse(
        id=row.id,
        title=row.title,
        content=row.content,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )
