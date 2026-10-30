from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from psycopg.types.json import Jsonb

from db import get_connection
from src.events.filters import EventFilters
from src.events.queries import read_dashboard, read_summaries, utc_text


router = APIRouter(prefix="/api", tags=["snapshots"])
EVENT_LIMIT = 100


@router.post("/snapshots", status_code=201)
def create_snapshot(filters: EventFilters):
    with get_connection() as conn:
        # 첫 조회 전에 격리를 고정하고 payload 저장까지 같은 연결을 사용한다.
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        dashboard = read_dashboard(conn, filters)
        events = read_summaries(conn, filters, limit=EVENT_LIMIT)
        snapshot_id = uuid4()
        created_at = datetime.now(UTC)
        payload = {
            "snapshotId": str(snapshot_id), "createdAt": utc_text(created_at),
            "filters": filters.model_dump(mode="json", by_alias=True, exclude_none=True),
            "dashboard": dashboard, "events": events, "eventLimit": EVENT_LIMIT,
            "eventsTruncated": dashboard["total"] > len(events),
        }
        conn.execute(
            "INSERT INTO snapshots (snapshot_id, created_at, payload) VALUES (%s, %s, %s)",
            (snapshot_id, created_at, Jsonb(payload)),
        )
    return payload


@router.get("/snapshots/{snapshotId}")
def get_snapshot(snapshotId: UUID):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT payload FROM snapshots WHERE snapshot_id = %s", (snapshotId,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "스냅샷을 찾을 수 없습니다."})
    return row["payload"]
