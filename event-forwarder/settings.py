import os
from dataclasses import dataclass, field
from pathlib import Path

import httpx


@dataclass(frozen=True)
class Settings:
    events_url: str | None
    instance_id: str
    ingest_token: str = field(repr=False)
    log_path: Path | None
    status_url: str | None = None

    @classmethod
    def from_environment(cls, *, status_mode=False):
        endpoint = "STATUS_URL" if status_mode else "EVENTS_URL"
        required = (endpoint, "INSTANCE_ID", "INGEST_TOKEN")
        if not status_mode:
            required += ("TETRAGON_LOG_PATH",)
        missing = [key for key in required if not os.environ.get(key, "").strip()]
        if missing:
            raise ValueError("Missing configuration: " + ", ".join(missing))
        try:
            url = httpx.URL(os.environ[endpoint])
        except (httpx.InvalidURL, ValueError):
            raise ValueError(f"{endpoint} must be an absolute HTTP(S) URL") from None
        if url.scheme not in ("http", "https") or not url.host or url.username or url.password or url.fragment:
            raise ValueError(f"{endpoint} must be HTTP(S) without credentials or fragment")
        instance_id = os.environ["INSTANCE_ID"].strip()
        if not 1 <= len(instance_id) <= 100:
            raise ValueError("INSTANCE_ID must contain 1 to 100 characters")
        token = os.environ["INGEST_TOKEN"]
        if any(not 33 <= ord(c) <= 126 for c in token):
            raise ValueError("INGEST_TOKEN must be printable ASCII without whitespace")
        if status_mode:
            return cls(None, instance_id, token, None, str(url))
        return cls(str(url), instance_id, token, Path(os.environ["TETRAGON_LOG_PATH"]).expanduser())
