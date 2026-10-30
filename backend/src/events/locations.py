"""명시적으로 설정한 위치만 제공한다. 외부 GeoIP 조회는 하지 않는다."""

import json
import os
from ipaddress import ip_address
from pathlib import Path
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    countryCode: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    latitude: float = Field(ge=-90, le=90, strict=True)
    longitude: float = Field(ge=-180, le=180, strict=True)
    source: Literal["configured"] = "configured"


class Locations(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ips: dict[str, Location] = Field(default_factory=dict)
    instances: dict[str, Location] = Field(default_factory=dict)

    @field_validator("ips")
    @classmethod
    def canonical_ips(cls, value):
        normalized = {str(ip_address(key)): location for key, location in value.items()}
        if len(normalized) != len(value):
            raise ValueError("동일한 IP를 중복 설정할 수 없습니다.")
        return normalized

    @field_validator("instances")
    @classmethod
    def instance_ids(cls, value):
        if any(not 1 <= len(key) <= 100 for key in value):
            raise ValueError("인스턴스 ID는 1~100자여야 합니다.")
        return value


def load_locations() -> Locations:
    path = os.environ.get("DASHBOARD_LOCATIONS_FILE", "").strip()
    if not path:
        return Locations()
    try:
        with Path(path).open("rb") as file:
            data = file.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError("위치 설정 파일 크기 초과")
        return Locations.model_validate(json.loads(data))
    except (OSError, ValueError, ValidationError):
        raise HTTPException(503, detail={
            "code": "LOCATION_CONFIG_INVALID", "message": "위치 설정을 확인하세요.",
        }) from None
