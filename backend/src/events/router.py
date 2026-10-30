from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from db import get_connection

from .filters import EventPage, QueryFilters
from .queries import count_events, public_event, read_dashboard, read_events, utc_text
from .screens import router as screens_router


router = APIRouter(prefix="/api", tags=["events"])


def single_query_values(request: Request):
    if any(len(request.query_params.getlist(key)) > 1 for key in request.query_params):
        raise HTTPException(422, detail={"code": "VALIDATION_ERROR", "message": "각 필터와 페이지 값은 하나만 지정하세요."})


@router.get("/instances")
def instances():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT instance_id, last_received_at FROM instances ORDER BY instance_id"
        ).fetchall()
    return {"items": [
        {"instanceId": row["instance_id"], "lastReceivedAt": utc_text(row["last_received_at"])}
        for row in rows
    ]}


@router.get("/events", dependencies=[Depends(single_query_values)])
def events(filters: Annotated[EventPage, Query()]):
    with get_connection() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        total = count_events(conn, filters)
        offset = (filters.page - 1) * filters.pageSize
        items = read_events(conn, filters, limit=filters.pageSize, offset=offset) if offset < total else []
    return {"items": items, "total": total, "page": filters.page, "pageSize": filters.pageSize}


@router.get("/events/{eventId}")
def event_detail(eventId: UUID):
    with get_connection() as conn:
        row = conn.execute(
            """SELECT event_id, instance_id, source, received_at, normalized, raw_event
               FROM events WHERE event_id = %s""", (eventId,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "이벤트를 찾을 수 없습니다."})
    return {"event": public_event(row), "rawEvent": row["raw_event"]}


@router.get("/dashboard", dependencies=[Depends(single_query_values)])
def dashboard(filters: Annotated[QueryFilters, Query()]):
    with get_connection() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return read_dashboard(conn, filters)


router.include_router(screens_router, dependencies=[Depends(single_query_values)])
