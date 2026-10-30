from datetime import datetime
from typing import Any

from .models import Envelope
from .mappings import mapped_file, mapped_network, network_target
from .timestamps import parse_timestamp, utc_iso


def text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def unsigned_integer(value: Any) -> int | None:
    return value if type(value) is int and 0 <= value <= 4294967295 else None


def object_value(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def occurred_at(value: Any) -> str | None:
    value = parse_timestamp(value)
    return utc_iso(value) if value is not None else None


def normalize(envelope: Envelope, event_id: str, received_at: datetime,
              attention_policy_names: frozenset[str]) -> dict:
    raw = envelope.rawEvent
    # 여러 이벤트 변형이 섞인 원본은 한 가지로 추정하지 않는다.
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
    file = mapped_file(event) if variants == ["process_kprobe"] else None
    network = mapped_network(event, sample=envelope.source == "sample") if variants == ["process_kprobe"] else None
    target = None
    if file is not None:
        event_type, target = "FILE_ACCESS", file["path"]
    elif network is not None:
        event_type, target = "NETWORK", network_target(network)
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
            "parentExecId": text(parent.get("exec_id")),
        },
        "eventType": event_type,
        "target": target,
        "file": file,
        "network": network,
        "policyName": policy_name,
        "reportedAction": reported_action,
        "status": "attention" if attention else "observed",
        "reason": f"등록된 경고 정책명과 일치: {policy_name}" if attention else None,
        "outcome": "unknown",
    }
