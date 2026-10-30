from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1"]
    messageId: str
    instanceId: str = Field(min_length=1, max_length=100)
    source: Literal["live", "sample"]
    rawEvent: dict[str, Any] = Field(min_length=1)

    @field_validator("messageId")
    @classmethod
    def uuid_string(cls, value: str) -> str:
        UUID(value)
        return value
