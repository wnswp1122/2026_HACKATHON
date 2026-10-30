from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .timestamps import parse_timestamp


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class MessageIdentity(StrictModel):
    schemaVersion: Literal["1"]
    messageId: str
    instanceId: str = Field(min_length=1, max_length=100)
    source: Literal["live", "sample"]

    @field_validator("messageId")
    @classmethod
    def uuid_string(cls, value: str) -> str:
        UUID(value)
        return value


class Envelope(MessageIdentity):
    rawEvent: dict[str, Any] = Field(min_length=1)


Name = Annotated[str, Field(min_length=1, max_length=100)]
ErrorSummary = Annotated[str, Field(max_length=300)]


class CollectorStatus(StrictModel):
    state: Literal["ok", "error", "unknown"]
    errorCode: ErrorSummary | None


class SensorOrPolicy(StrictModel):
    name: Name
    state: Literal["enabled", "disabled", "error", "unknown"]
    error: ErrorSummary | None


class TetragonStatus(StrictModel):
    reachable: bool | None
    version: str | None
    sensors: list[SensorOrPolicy] = Field(max_length=100)
    policies: list[SensorOrPolicy] = Field(max_length=200)


class SensorReport(MessageIdentity):
    observedAt: str
    collector: CollectorStatus
    tetragon: TetragonStatus

    @field_validator("observedAt")
    @classmethod
    def aware_timestamp(cls, value: str) -> str:
        if parse_timestamp(value) is None:
            raise ValueError("timezone을 포함한 ISO 8601 시각이 필요합니다.")
        return value
