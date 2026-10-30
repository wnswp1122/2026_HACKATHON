"""저장된 상태 보고만 판정한다. 이벤트/health로 준비 상태를 추측하지 않는다."""

from datetime import datetime, timedelta

from psycopg import Connection
from settings import allowed_instance_ids

from .filters import ReadinessFilters
from .queries import utc_text


STALE_SECONDS = 90


def report_state(row: dict | None, now: datetime) -> tuple[str, str | None]:
    if row is None:
        return "unknown", "NO_REPORT"
    if row["observed_at"] - now > timedelta(seconds=30):
        return "unknown", "CLOCK_SKEW"
    if any(now - row[key] > timedelta(seconds=STALE_SECONDS) for key in ("observed_at", "received_at")):
        return "stale", "STALE_REPORT"
    report = row["payload"]
    collector = report["collector"]
    tetragon = report["tetragon"]
    sensors, policies = tetragon["sensors"], tetragon["policies"]
    if collector["state"] == "error":
        return "error", collector.get("errorCode") or "COLLECTOR_ERROR"
    if tetragon["reachable"] is False:
        return "error", "TETRAGON_UNREACHABLE"
    if any(sensor["state"] == "error" for sensor in sensors):
        return "error", "SENSOR_ERROR"
    if any(policy["state"] == "error" for policy in policies):
        return "error", "POLICY_ERROR"
    if (collector["state"] != "ok" or tetragon["reachable"] is not True
            or any(item["state"] == "unknown" for item in (*sensors, *policies))):
        return "unknown", "STATUS_UNKNOWN"
    if not sensors:
        return "unknown", "SENSOR_NOT_OBSERVED"
    if not policies:
        return "warning", "POLICY_NOT_CONFIGURED"
    if any(sensor["state"] == "disabled" for sensor in sensors):
        return "warning", "SENSOR_DISABLED"
    if any(policy["state"] == "disabled" for policy in policies):
        return "warning", "POLICY_DISABLED"
    return "ready", None


def read_readiness(conn: Connection, filters: ReadinessFilters, now: datetime) -> dict:
    allowed = allowed_instance_ids()
    ids = sorted(allowed if filters.instanceId is None else allowed & {filters.instanceId})
    rows = conn.execute(
        """SELECT DISTINCT ON (instance_id) instance_id, observed_at, received_at, payload
           FROM sensor_reports
           WHERE source = %s AND instance_id = ANY(%s::text[])
           ORDER BY instance_id, observed_at DESC, received_at DESC, report_id DESC""",
        (filters.source.value, ids),
    ).fetchall()
    reports = {row["instance_id"]: row for row in rows}
    items = []
    for instance_id in ids:
        row = reports.get(instance_id)
        state, reason = report_state(row, now)
        items.append({
            "instanceId": instance_id, "state": state, "reason": reason,
            "observedAt": utc_text(row["observed_at"]) if row else None,
            "receivedAt": utc_text(row["received_at"]) if row else None,
            "report": row["payload"] if row else None,
        })
    return {"generatedAt": utc_text(now), "staleAfterSeconds": STALE_SECONDS, "items": items}
