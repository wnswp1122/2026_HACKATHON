"""조회와 스냅샷이 함께 사용하는 HTTP 필터 계약."""

from datetime import UTC, timedelta
from enum import StrEnum

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class EventType(StrEnum):
    PROCESS_EXEC = "PROCESS_EXEC"
    PROCESS_EXIT = "PROCESS_EXIT"
    FILE_ACCESS = "FILE_ACCESS"
    NETWORK = "NETWORK"
    OTHER = "OTHER"


class Status(StrEnum):
    OBSERVED = "observed"
    ATTENTION = "attention"


class Source(StrEnum):
    LIVE = "live"
    SAMPLE = "sample"


class EventFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_: AwareDatetime = Field(alias="from")
    to: AwareDatetime
    instanceId: str | None = Field(default=None, min_length=1, max_length=100)
    eventType: EventType | None = None
    status: Status | None = None
    source: Source | None = None

    @field_validator("from_", "to", mode="before")
    @classmethod
    def require_iso_string(cls, value):
        # Pydantic이 허용하는 epoch 숫자는 HTTP 시간 계약에 포함하지 않는다.
        if not isinstance(value, str) or "t" not in value.lower():
            raise ValueError("시간대가 있는 ISO 8601 문자열이 필요합니다.")
        return value

    @field_validator("from_", "to")
    @classmethod
    def normalize_utc(cls, value):
        try:
            return value.astimezone(UTC)
        except OverflowError as exc:
            raise ValueError("UTC로 표현할 수 있는 시간이 필요합니다.") from exc

    @model_validator(mode="after")
    def validate_range(self):
        if not self.from_ < self.to:
            raise ValueError("from은 to보다 빨라야 합니다.")
        if self.to - self.from_ > timedelta(days=31):
            raise ValueError("조회 기간은 최대 31일입니다.")
        return self


class QueryFilters(EventFilters):
    processExecId: str | None = Field(default=None, min_length=1, max_length=1024)
    policyName: str | None = Field(default=None, min_length=1, max_length=100)


class EventPage(QueryFilters):
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=50, ge=1, le=100)


class ReadinessFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instanceId: str | None = Field(default=None, min_length=1, max_length=100)
    source: Source
