"""공유 DB 계약 위에서 스냅샷별 불변 이미지와 성공 결과를 저장한다."""

import hashlib
from datetime import datetime, timezone
from uuid import UUID, uuid4

import httpx
from db import get_connection
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from .upstream import INSTRUCTION_VERSION, configuration, request_analysis
from .validation import SnapshotInput, fail, validate_png


def analysis_json(row: dict) -> dict:
    return {
        "analysisId": str(row["analysis_id"]),
        "snapshotId": str(row["snapshot_id"]),
        "createdAt": row["created_at"].astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "model": row["model"],
        "instructionVersion": row["instruction_version"],
        "result": row["result"],
    }


def store_image(snapshot_id: UUID, image: bytes) -> tuple[dict, int]:
    validate_png(image)
    digest = hashlib.sha256(image).hexdigest()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT image_png FROM snapshots WHERE snapshot_id = %s FOR UPDATE", (snapshot_id,)
        ).fetchone()
        if row is None:
            raise fail(404, "SNAPSHOT_NOT_FOUND", "스냅샷을 찾을 수 없습니다.")
        status = 201
        if row["image_png"] is not None:
            if bytes(row["image_png"]) != image:
                raise fail(409, "IMAGE_CONFLICT", "저장된 PNG를 다른 이미지로 교체할 수 없습니다.")
            status = 200
        else:
            conn.execute(
                "UPDATE snapshots SET image_png = %s, image_sha256 = %s WHERE snapshot_id = %s",
                (image, digest, snapshot_id),
            )
    return {"snapshotId": str(snapshot_id), "imageSha256": digest}, status


def analyze(snapshot_id: UUID, client: httpx.Client) -> tuple[dict, int]:
    with get_connection() as conn:
        # 여러 프로세스에서도 호출→검증→성공 저장 전체를 같은 행 잠금으로 보호한다.
        # 실패/프로세스 종료 시 rollback으로 잠금이 풀리고 성공 행이 없어 재시도할 수 있다.
        row = conn.execute(
            "SELECT payload, image_png, image_sha256 FROM snapshots WHERE snapshot_id = %s FOR UPDATE",
            (snapshot_id,),
        ).fetchone()
        if row is None:
            raise fail(404, "SNAPSHOT_NOT_FOUND", "스냅샷을 찾을 수 없습니다.")
        existing = conn.execute("SELECT * FROM analyses WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
        if existing is not None:
            return analysis_json(existing), 200
        if row["image_png"] is None:
            raise fail(409, "IMAGE_REQUIRED", "분석 전에 같은 스냅샷의 PNG를 업로드하세요.")
        config = configuration()
        image = bytes(row["image_png"])
        if hashlib.sha256(image).hexdigest() != row["image_sha256"]:
            raise fail(502, "AI_FAILED", "저장된 PNG의 무결성을 확인할 수 없습니다.")
        try:
            snapshot = SnapshotInput.model_validate(row["payload"])
            if snapshot.snapshotId != snapshot_id:
                raise ValueError
        except (ValidationError, ValueError, TypeError):
            raise fail(502, "AI_FAILED", "저장된 스냅샷이 안전한 AI 입력 계약과 일치하지 않습니다.") from None
        # 검증만 하고 값은 다시 만들지 않는다. 저장한 payload/PNG가 유일한 분석 입력이다.
        model, result = request_analysis(client, row["payload"], image, config)
        saved = conn.execute(
            """INSERT INTO analyses
               (analysis_id, snapshot_id, created_at, model, instruction_version, result)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
            (uuid4(), snapshot_id, datetime.now(timezone.utc), model, INSTRUCTION_VERSION, Jsonb(result)),
        ).fetchone()
        response = analysis_json(saved)
    return response, 201


def get_analysis(snapshot_id: UUID) -> dict:
    with get_connection() as conn:
        snapshot = conn.execute("SELECT 1 FROM snapshots WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
        if snapshot is None:
            raise fail(404, "SNAPSHOT_NOT_FOUND", "스냅샷을 찾을 수 없습니다.")
        row = conn.execute("SELECT * FROM analyses WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
        if row is None:
            raise fail(404, "ANALYSIS_NOT_FOUND", "성공한 분석 결과가 없습니다.")
        return analysis_json(row)
