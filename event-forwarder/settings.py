import os
from dataclasses import dataclass, field
from pathlib import Path

import httpx


@dataclass(frozen=True)
class Settings:
    events_url: str
    instance_id: str
    ingest_token: str = field(repr=False)
    log_path: Path

    @classmethod
    def from_environment(cls):
        required = ("EVENTS_URL", "INSTANCE_ID", "INGEST_TOKEN", "TETRAGON_LOG_PATH")
        missing = [key for key in required if not os.environ.get(key, "").strip()]
        if missing:
            raise ValueError("Missing configuration: " + ", ".join(missing))
        try:
            url = httpx.URL(os.environ["EVENTS_URL"])
        except (httpx.InvalidURL, ValueError):
            raise ValueError("EVENTS_URL must be an absolute HTTP(S) URL") from None
        if url.scheme not in ("http", "https") or not url.host or url.username or url.password or url.fragment:
            raise ValueError("EVENTS_URL must be HTTP(S) without credentials or fragment")
        instance_id = os.environ["INSTANCE_ID"].strip()
        if not 1 <= len(instance_id) <= 100:
            raise ValueError("INSTANCE_ID must contain 1 to 100 characters")
        token = os.environ["INGEST_TOKEN"]
        if not token.isascii() or any(c.isspace() for c in token):
            raise ValueError("INGEST_TOKEN must be an ASCII token without whitespace")
        return cls(str(url), instance_id, token, Path(os.environ["TETRAGON_LOG_PATH"]).expanduser())
