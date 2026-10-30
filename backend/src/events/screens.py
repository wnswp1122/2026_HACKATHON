from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from db import get_connection

from .filters import EventType, QueryFilters, ReadinessFilters
from .graph import read_graph
from .locations import load_locations
from .queries import NETWORK_FIELDS, utc_text, where_clause
from .readiness import read_readiness


router = APIRouter(tags=["screens"])


@router.get("/servers")
def servers(filters: Annotated[QueryFilters, Query()]):
    where, params = where_clause(filters)
    with get_connection() as conn:
        rows = conn.execute(
            f"""SELECT instance_id, normalized->>'eventType' AS event_type,
                       count(*) AS total,
                       count(*) FILTER (WHERE normalized->>'status' = 'attention') AS attention,
                       max(received_at) AS last_received_at
                FROM events WHERE {where} GROUP BY 1, 2 ORDER BY 1, 2""", params,
        ).fetchall()
    items = {}
    for row in rows:
        item = items.setdefault(row["instance_id"], {
            "instanceId": row["instance_id"], "total": 0, "attention": 0,
            "byType": [{"eventType": kind.value, "count": 0} for kind in EventType],
            "lastReceivedAt": row["last_received_at"],
        })
        item["total"] += row["total"]
        item["attention"] += row["attention"]
        item["lastReceivedAt"] = max(item["lastReceivedAt"], row["last_received_at"])
        for kind in item["byType"]:
            if kind["eventType"] == row["event_type"]:
                kind["count"] = row["total"]
    for item in items.values():
        item["lastReceivedAt"] = utc_text(item["lastReceivedAt"])
    return {"generatedAt": utc_text(datetime.now(UTC)), "items": list(items.values())}


@router.get("/network")
def network(filters: Annotated[QueryFilters, Query()]):
    config = load_locations()
    where, params = where_clause(filters)
    params["mapped_ips"] = list(config.ips)
    with get_connection() as conn:
        data = conn.execute(
            f"""WITH grouped AS (
                  SELECT instance_id, normalized#>>'{{process,execId}}' AS exec_id,
                         normalized->'network' AS network, count(*) AS count,
                         host(coalesce(normalized#>>'{{network,destinationIp}}',
                                       normalized#>>'{{network,sourceIp}}')::inet) AS target_ip
                  FROM events WHERE {where} AND normalized->>'eventType' = 'NETWORK'
                  GROUP BY 1, 2, 3, 5
                ), limited AS (
                  SELECT * FROM grouped ORDER BY count DESC, instance_id COLLATE "C",
                    exec_id COLLATE "C" NULLS FIRST, network::text COLLATE "C" NULLS FIRST LIMIT 200
                )
                SELECT coalesce((SELECT sum(count) FROM grouped), 0)::bigint AS total,
                  coalesce((SELECT sum(count) FROM grouped
                            WHERE target_ip IS NULL OR NOT (target_ip = ANY(%(mapped_ips)s::text[]))), 0)::bigint AS unmapped,
                  (SELECT count(*) > 200 FROM grouped) AS truncated,
                  coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'instanceId', instance_id, 'execId', exec_id, 'network', network,
                    'count', count, 'targetIp', target_ip)
                    ORDER BY count DESC, instance_id COLLATE "C", exec_id COLLATE "C" NULLS FIRST,
                      network::text COLLATE "C" NULLS FIRST) FROM limited), '[]'::jsonb) AS items""",
            params,
        ).fetchone()
    for item in data["items"]:
        value = item["network"]
        item["network"] = {key: value.get(key) for key in NETWORK_FIELDS} if isinstance(value, dict) else None
        location = config.ips.get(item.pop("targetIp"))
        server_location = config.instances.get(item["instanceId"])
        item["location"] = location.model_dump() if location else None
        item["serverLocation"] = server_location.model_dump() if server_location else None
    return {
        "generatedAt": utc_text(datetime.now(UTC)), "totalNetworkEvents": data["total"],
        "items": data["items"], "unmappedCount": data["unmapped"],
        "truncated": data["truncated"], "limit": 200,
    }


@router.get("/graph")
def graph(filters: Annotated[QueryFilters, Query()]):
    with get_connection() as conn:
        result = read_graph(conn, filters)
    return {"generatedAt": utc_text(datetime.now(UTC)), **result}


@router.get("/readiness")
def readiness(filters: Annotated[ReadinessFilters, Query()]):
    with get_connection() as conn:
        return read_readiness(conn, filters, datetime.now(UTC))
