"""원자적으로 교체되는 상태 JSON을 읽는다. 준비 상태 판정은 SaaS가 한다."""

import json
import time
from datetime import datetime
from pathlib import Path

from forwarder import reject_constant


class InvalidStatus(ValueError):
    pass


def require_keys(value, keys):
    if not isinstance(value, dict) or value.keys() != set(keys):
        raise InvalidStatus


def require_text(value, limit=None, *, nullable=False):
    if nullable and value is None:
        return
    if not isinstance(value, str) or (limit is not None and len(value) > limit):
        raise InvalidStatus


def validate_status(content: bytes):
    payload = json.loads(content.decode("utf-8"), parse_constant=reject_constant)
    require_keys(payload, ("observedAt", "collector", "tetragon"))
    observed_at = payload["observedAt"]
    require_text(observed_at)
    if "T" not in observed_at:
        raise InvalidStatus
    observed = datetime.fromisoformat(observed_at)
    if observed.utcoffset() is None:
        raise InvalidStatus
    collector = payload["collector"]
    require_keys(collector, ("state", "errorCode"))
    if collector["state"] not in ("ok", "error", "unknown"):
        raise InvalidStatus
    require_text(collector["errorCode"], 300, nullable=True)
    tetragon = payload["tetragon"]
    require_keys(tetragon, ("reachable", "version", "sensors", "policies"))
    if tetragon["reachable"] is not None and type(tetragon["reachable"]) is not bool:
        raise InvalidStatus
    require_text(tetragon["version"], nullable=True)
    for key, limit in (("sensors", 100), ("policies", 200)):
        items = tetragon[key]
        if not isinstance(items, list) or len(items) > limit:
            raise InvalidStatus
        for item in items:
            require_keys(item, ("name", "state", "error"))
            require_text(item["name"], 100)
            if not item["name"]:
                raise InvalidStatus
            if item["state"] not in ("enabled", "disabled", "error", "unknown"):
                raise InvalidStatus
            require_text(item["error"], 300, nullable=True)
    # 잘못된 surrogate 등을 진단 문자열이나 전송 예외로 노출하지 않는다.
    json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    return payload, observed


def read_statuses(path: Path, *, follow: bool):
    previous = None
    read_error = object()
    last_observed = None
    while True:
        try:
            content = path.read_bytes()
        except OSError:
            if not follow:
                raise
            if previous is not read_error:
                yield None, "status_file_error"
            previous = read_error
        else:
            if content != previous:
                previous = content
                try:
                    payload, observed = validate_status(content)
                except (ValueError, UnicodeError, RecursionError):
                    yield None, "invalid_status"
                else:
                    if observed == last_observed:
                        yield None, "status_same_observation"
                    else:
                        # 최종 실패 후에도 같은 관측을 무제한 재시도하지 않는다.
                        last_observed = observed
                        yield payload, None
        if not follow:
            return
        time.sleep(0.5)
