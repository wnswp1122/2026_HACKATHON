"""receivedAt 집합을 고정하고 occurredAt 순으로 저장하는 관찰 리플레이."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb

from db import get_connection
from src.events.filters import QueryFilters
from src.events.queries import public_event, utc_text, where_clause


router = APIRouter(tags=["replays"])
EVENT_LIMIT = 2000


def read_replay_events(conn, filters: QueryFilters) -> tuple[int, int, list[dict]]:
    where, params = where_clause(filters)
    counts = conn.execute(
        f"""SELECT count(*) AS total,
              count(*) FILTER (WHERE normalized->>'occurredAt' IS NULL) AS undated
            FROM events WHERE {where}""", params,
    ).fetchone()
    params["limit"] = EVENT_LIMIT
    rows = conn.execute(
        f"""SELECT event_id, instance_id, source, received_at, normalized
            FROM events WHERE {where} AND normalized->>'occurredAt' IS NOT NULL
            ORDER BY (normalized->>'occurredAt')::timestamptz, event_id LIMIT %(limit)s""",
        params,
    ).fetchall()
    return counts["total"], counts["undated"], [public_event(row) for row in rows]


@router.post("/replays", status_code=201)
def create_replay(filters: QueryFilters):
    with get_connection() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        total, undated, events = read_replay_events(conn, filters)
        replay_id, created_at = uuid4(), datetime.now(UTC)
        payload = {
            "replayId": str(replay_id), "createdAt": utc_text(created_at),
            "filters": filters.model_dump(mode="json", by_alias=True, exclude_none=True),
            "timeBasis": "occurredAt", "events": events, "total": total,
            "undatedCount": undated, "eventLimit": EVENT_LIMIT,
            "truncated": total - undated > len(events),
        }
        conn.execute("INSERT INTO replays (replay_id, created_at, payload) VALUES (%s, %s, %s)",
                     (replay_id, created_at, Jsonb(payload)))
    return payload


@router.get("/replays/{replayId}")
def get_replay(replayId: UUID):
    with get_connection() as conn:
        row = conn.execute("SELECT payload FROM replays WHERE replay_id = %s", (replayId,)).fetchone()
    if row is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "리플레이를 찾을 수 없습니다."})
    return row["payload"]
