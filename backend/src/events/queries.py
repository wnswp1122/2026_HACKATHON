"""공통 PostgreSQL 스키마에 대한 읽기. 트랜잭션은 호출자가 소유한다."""

from datetime import UTC, datetime, timedelta

from psycopg import Connection

from .filters import EventFilters, EventType, Source


EVENT_FIELDS = (
    "eventId", "instanceId", "source", "receivedAt", "occurredAt", "nodeName",
    "process", "eventType", "target", "policyName", "reportedAction", "status",
    "reason", "outcome", "file", "network",
)
PROCESS_FIELDS = ("execId", "pid", "uid", "binary", "parentBinary", "parentExecId")
FILE_FIELDS = ("path", "operation")
NETWORK_FIELDS = ("sourceIp", "sourcePort", "destinationIp", "destinationPort", "protocol", "operation")


# 서버가 준비한 sample에만 적용한다. live 이벤트는 항상 원본 한 건으로 집계한다.
SAMPLE_WEIGHT = "CASE WHEN source = 'sample' THEN greatest(1, coalesce((normalized->>'sampleWeight')::bigint, 1)) ELSE 1 END"


def utc_text(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def where_clause(filters: EventFilters) -> tuple[str, dict]:
    clauses = ["received_at >= %(start)s", "received_at < %(end)s"]
    params = {"start": filters.from_, "end": filters.to}
    # SQL 문장은 이 고정 매핑으로만 구성하고 사용자 값은 모두 바인딩한다.
    for name, column in (
        ("instanceId", "instance_id"), ("source", "source"),
        ("eventType", "normalized->>'eventType'"), ("status", "normalized->>'status'"),
        ("processExecId", "normalized#>>'{process,execId}'"), ("policyName", "normalized->>'policyName'"),
    ):
        value = getattr(filters, name, None)
        if value is not None:
            clauses.append(f"{column} = %({name})s")
            params[name] = str(value)
    return " AND ".join(clauses), params


def public_event(row: dict) -> dict:
    event = {key: row["normalized"].get(key) for key in EVENT_FIELDS}
    event.update(
        eventId=str(row["event_id"]), instanceId=row["instance_id"],
        source=row["source"], receivedAt=utc_text(row["received_at"]),
    )
    process = event["process"] or {}
    event["process"] = {key: process.get(key) for key in PROCESS_FIELDS}
    for field, keys in (("file", FILE_FIELDS), ("network", NETWORK_FIELDS)):
        value = event[field]
        event[field] = {key: value.get(key) for key in keys} if isinstance(value, dict) else None
    return event


def count_events(conn: Connection, filters: EventFilters) -> int:
    where, params = where_clause(filters)
    return conn.execute(f"SELECT count(*) AS total FROM events WHERE {where}", params).fetchone()["total"]


def read_events(conn: Connection, filters: EventFilters, *, limit: int, offset: int = 0) -> list[dict]:
    where, params = where_clause(filters)
    params.update(limit=limit, offset=offset)
    rows = conn.execute(
        f"""SELECT event_id, instance_id, source, received_at, normalized
            FROM events WHERE {where}
            ORDER BY received_at DESC, event_id DESC LIMIT %(limit)s OFFSET %(offset)s""",
        params,
    ).fetchall()
    return [public_event(row) for row in rows]


def read_summaries(conn: Connection, filters: EventFilters, *, limit: int) -> list[dict]:
    where, params = where_clause(filters)
    params["limit"] = limit
    # 원본·process·target·reason을 DB에서 읽지 않고 안전한 필드만 선택한다.
    rows = conn.execute(
        f"""SELECT event_id, instance_id, source, received_at,
                   normalized->>'occurredAt' AS occurred_at,
                   normalized->>'eventType' AS event_type,
                   normalized->>'status' AS status,
                   normalized->>'outcome' AS outcome
            FROM events WHERE {where}
            ORDER BY received_at DESC, event_id DESC LIMIT %(limit)s""",
        params,
    ).fetchall()
    return [
        {
            "eventId": str(row["event_id"]), "instanceId": row["instance_id"],
            "source": row["source"], "receivedAt": utc_text(row["received_at"]),
            "occurredAt": row["occurred_at"], "eventType": row["event_type"],
            "status": row["status"], "outcome": row["outcome"],
        }
        for row in rows
    ]


def read_dashboard(conn: Connection, filters: EventFilters, *, simulate_sample: bool = False) -> dict:
    duration = filters.to - filters.from_
    seconds = 60 if duration <= timedelta(hours=6) else 600 if duration <= timedelta(hours=48) else 3600
    # timedelta 나눗셈은 부동소수점 반올림 없이 마지막 부분 버킷도 포함한다.
    bucket_count = (duration // timedelta(seconds=seconds)) + bool(duration % timedelta(seconds=seconds))
    timeline = [
        {"bucketStart": utc_text(filters.from_ + timedelta(seconds=i * seconds)), "count": 0, "attention": 0}
        for i in range(bucket_count)
    ]
    by_type = {kind.value: 0 for kind in EventType}
    by_source = {source.value: 0 for source in Source}
    total = attention = representative_total = 0
    weight = SAMPLE_WEIGHT if simulate_sample else "1"
    where, params = where_clause(filters)
    params["seconds"] = seconds
    rows = conn.execute(
        f"""SELECT normalized->>'eventType' AS event_type, source,
                   normalized->>'status' AS status,
                   floor(extract(epoch FROM (received_at - %(start)s::timestamptz))
                         / %(seconds)s)::integer AS bucket,
                   sum({weight})::bigint AS count, count(*) AS representatives
            FROM events WHERE {where}
            GROUP BY 1, 2, 3, 4""",
        params,
    ).fetchall()
    for row in rows:
        count = row["count"]
        representative_total += row["representatives"]
        flagged = count if row["status"] == "attention" else 0
        total += count
        attention += flagged
        by_type[row["event_type"]] += count
        by_source[row["source"]] += count
        timeline[row["bucket"]]["count"] += count
        timeline[row["bucket"]]["attention"] += flagged
    result = {
        "total": total, "attention": attention,
        "byType": [{"eventType": key, "count": value} for key, value in by_type.items()],
        "bySource": [{"source": key, "count": value} for key, value in by_source.items()],
        "timeline": timeline, "bucketSeconds": seconds,
    }
    if simulate_sample and total != representative_total:
        result["simulation"] = {"mode": "weighted-sample", "representativeEvents": representative_total}
    return result
