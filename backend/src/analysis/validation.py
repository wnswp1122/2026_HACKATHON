"""외부 전송 전 스냅샷 allowlist 및 PNG 디코딩 검증."""

from io import BytesIO
from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StrictInt

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_SIDE = 4096
EventType = Literal["PROCESS_EXEC", "PROCESS_EXIT", "FILE_ACCESS", "NETWORK", "OTHER"]
Source = Literal["live", "sample"]
Status = Literal["observed", "attention"]
Count = Annotated[StrictInt, Field(ge=0)]


def fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


class ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Filters(ClosedModel):
    from_: AwareDatetime = Field(alias="from")
    to: AwareDatetime
    instanceId: str | None = None
    eventType: EventType | None = None
    status: Status | None = None
    source: Source | None = None


class TypeCount(ClosedModel):
    eventType: EventType
    count: Count


class SourceCount(ClosedModel):
    source: Source
    count: Count


class Bucket(ClosedModel):
    bucketStart: AwareDatetime
    count: Count
    attention: Count


class Dashboard(ClosedModel):
    total: Count
    attention: Count
    byType: list[TypeCount]
    bySource: list[SourceCount]
    timeline: list[Bucket]
    bucketSeconds: Literal[60, 600, 3600]


class EventSummary(ClosedModel):
    eventId: UUID
    instanceId: str
    source: Source
    receivedAt: AwareDatetime
    occurredAt: AwareDatetime | None
    eventType: EventType
    status: Status
    outcome: Literal["unknown"]


class SnapshotInput(ClosedModel):
    snapshotId: UUID
    createdAt: AwareDatetime
    filters: Filters
    dashboard: Dashboard
    events: list[EventSummary] = Field(max_length=100)
    eventLimit: Literal[100]
    eventsTruncated: StrictBool


class AnalysisResult(ClosedModel):
    facts: list[str]
    hypotheses: list[str]
    checks: list[str]
    limitations: list[str]


def validate_png(data: bytes) -> None:
    if len(data) > MAX_IMAGE_BYTES:
        raise fail(413, "IMAGE_TOO_LARGE", "PNG는 최대 5 MiB까지 업로드할 수 있습니다.")
    try:
        with Image.open(BytesIO(data), formats=["PNG"]) as image:
            if image.width > MAX_IMAGE_SIDE or image.height > MAX_IMAGE_SIDE:
                raise fail(413, "IMAGE_TOO_LARGE", "PNG의 가로·세로는 각각 최대 4096픽셀입니다.")
            if getattr(image, "n_frames", 1) != 1:
                raise fail(422, "INVALID_IMAGE", "정지 화면 PNG를 업로드하세요.")
            image.verify()
        # verify()는 청크 무결성을, load()는 실제 픽셀 디코딩을 확인한다.
        with Image.open(BytesIO(data), formats=["PNG"]) as image:
            image.load()
    except Image.DecompressionBombError:
        raise fail(413, "IMAGE_TOO_LARGE", "PNG 픽셀 크기 제한을 초과했습니다.") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise fail(422, "INVALID_IMAGE", "디코딩 가능한 PNG가 필요합니다.") from None
