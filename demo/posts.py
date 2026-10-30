from datetime import datetime, timezone
from typing import Annotated, Self

from fastapi import APIRouter, HTTPException, Path, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from database import connection


def nonblank_title(value: str) -> str:
    if not value.strip():
        raise ValueError("Title must not be blank")
    return value


Title = Annotated[
    str, Field(strict=True, min_length=1, max_length=200), AfterValidator(nonblank_title)
]
Content = Annotated[str, Field(strict=True, max_length=10000)]
PostId = Annotated[int, Path(ge=1, le=9223372036854775807)]


class CreatePost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    content: Content


class PatchPost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | SkipJsonSchema[None] = None
    content: Content | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def require_changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Provide at least one of title or content")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Post fields must not be null")
        return self


class Post(BaseModel):
    id: int
    title: str
    content: str
    createdAt: datetime
    updatedAt: datetime


router = APIRouter(prefix="/posts", tags=["posts"])


@router.post("", response_model=Post, status_code=201)
def create_post(post: CreatePost):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        row = db.execute(
            """INSERT INTO posts (title, content, createdAt, updatedAt)
               VALUES (?, ?, ?, ?) RETURNING *""",
            (post.title, post.content, now, now),
        ).fetchone()
    return dict(row)


@router.get("", response_model=list[Post])
def list_posts():
    with connection() as db:
        rows = db.execute("SELECT * FROM posts ORDER BY id DESC").fetchall()
    return [dict(row) for row in rows]


@router.get("/{id}", response_model=Post)
def get_post(id: PostId):
    with connection() as db:
        row = db.execute("SELECT * FROM posts WHERE id = ?", (id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return dict(row)


@router.patch("/{id}", response_model=Post)
def patch_post(id: PostId, post: PatchPost):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        row = db.execute(
            """UPDATE posts SET title = COALESCE(?, title),
               content = COALESCE(?, content), updatedAt = ?
               WHERE id = ? RETURNING *""",
            (post.title, post.content, now, id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Post not found")
    return dict(row)


@router.delete("/{id}", status_code=204)
def delete_post(id: PostId):
    with connection() as db:
        result = db.execute("DELETE FROM posts WHERE id = ?", (id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found")
    return Response(status_code=204)
