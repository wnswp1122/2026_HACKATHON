"""서버 환경 설정. .env 파일을 자동으로 읽지 않는다."""

import os
from dataclasses import dataclass, field


def database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise ValueError("DATABASE_URL을 설정하세요.")
    return value


def comma_values(name: str) -> frozenset[str]:
    return frozenset(value.strip() for value in os.environ.get(name, "").split(",") if value.strip())


@dataclass(frozen=True)
class Settings:
    ingest_token: str = field(repr=False)
    instance_ids: frozenset[str]
    attention_policy_names: frozenset[str]

    @classmethod
    def from_env(cls) -> "Settings":
        database_url()
        token = os.environ.get("INGEST_TOKEN", "")
        if not token or any(char.isspace() for char in token) or not token.isascii():
            raise ValueError("INGEST_TOKEN에 공백 없는 ASCII 토큰을 설정하세요.")
        instance_ids = comma_values("INSTANCE_IDS")
        if not instance_ids or any(len(value) > 100 for value in instance_ids):
            raise ValueError("INSTANCE_IDS에 허용할 인스턴스 ID(1~100자)를 설정하세요.")
        return cls(token, instance_ids, comma_values("ATTENTION_POLICY_NAMES"))
