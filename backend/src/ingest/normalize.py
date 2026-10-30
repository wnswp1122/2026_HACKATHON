from datetime import datetime, timezone
import re
from typing import Any

from .models import Envelope


def text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def unsigned_integer(value: Any) -> int | None:
    return value if type(value) is int and 0 <= value <= 4294967295 else None


def object_value(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def occurred_at(value: Any) -> str | None:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", value
    ):
        return None
    try:
        return utc_iso(datetime.fromisoformat(value))
    except (ValueError, OverflowError):
        return None


def normalize(envelope: Envelope, event_id: str, received_at: datetime,
              attention_policy_names: frozenset[str]) -> dict:
    raw = envelope.rawEvent
    # exec/exit 이외 구조의 의미는 실제 정책별 매핑이 확보되기 전까지 추정하지 않는다.
    event_type = "OTHER"
    event = {}
    variants = [key for key, value in raw.items() if key.startswith("process_") and isinstance(value, dict)]
    if len(variants) == 1:
        key = variants[0]
        event_type = {"process_exec": "PROCESS_EXEC", "process_exit": "PROCESS_EXIT"}.get(key, "OTHER")
        if key in ("process_exec", "process_exit", "process_kprobe"):
            event = raw[key]
    process = object_value(event.get("process"))
    parent = object_value(event.get("parent"))
    # 공식 ProcessKprobe 필드의 문자열만 보존한다. 숫자 enum은 해석하지 않는다.
    policy_name = text(event.get("policy_name")) if variants == ["process_kprobe"] else None
    reported_action = text(event.get("action")) if variants == ["process_kprobe"] else None
    attention = policy_name is not None and policy_name in attention_policy_names
    return {
        "eventId": event_id,
        "instanceId": envelope.instanceId,
        "source": envelope.source,
        "receivedAt": utc_iso(received_at),
        "occurredAt": occurred_at(raw.get("time")),
        "nodeName": text(raw.get("node_name")),
        "process": {
            "execId": text(process.get("exec_id")),
            "pid": unsigned_integer(process.get("pid")),
            "uid": unsigned_integer(process.get("uid")),
            "binary": text(process.get("binary")),
            "parentBinary": text(parent.get("binary")),
        },
        "eventType": event_type,
        "target": None,
        "policyName": policy_name,
        "reportedAction": reported_action,
        "status": "attention" if attention else "observed",
        "reason": f"등록된 경고 정책명과 일치: {policy_name}" if attention else None,
        "outcome": "unknown",
    }
