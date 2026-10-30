import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Annotated
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from psycopg.types.json import Jsonb

from db import get_connection
from .models import Envelope, SensorReport
from .normalize import normalize
from .timestamps import parse_timestamp

router = APIRouter(prefix="/api", tags=["ingest"])


def request_body_schema(model: type[Envelope] | type[SensorReport]) -> dict:
    # 현재의 비재귀 모델을 펼쳐 OpenAPI 문서 루트에 없는 $ref를 만들지 않는다.
    schema = model.model_json_schema()
    definitions = schema.pop("$defs", {})

    def inline(value):
        if isinstance(value, list):
            return [inline(item) for item in value]
        if isinstance(value, dict):
            if "$ref" in value:
                return inline({**definitions[value["$ref"].split("/")[-1]], **{k: v for k, v in value.items() if k != "$ref"}})
            return {key: inline(item) for key, item in value.items()}
        return value

    return inline(schema)


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def authenticate(request: Request) -> None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        token.encode("utf-8"), request.app.state.settings.ingest_token.encode("ascii")
    ):
        raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "인증 정보를 확인하세요."},
                            headers={"WWW-Authenticate": "Bearer"})


def invalid_constant(value: str) -> None:
    raise ValueError("JSON 상수가 아닙니다.")


def json_integer(value: str) -> int | Decimal:
    try:
        return int(value)
    except ValueError:
        # Python의 int 문자열 길이 제한을 원본 JSON 값의 손실/거부로 바꾸지 않는다.
        return Decimal(value)


@dataclass
class ParsedEvent:
    envelope: Envelope
    json_text: str


async def read_document(request: Request) -> tuple[object, str]:
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise error(422, "VALIDATION_ERROR", "Content-Type은 application/json이어야 합니다.")
    try:
        json_text = (await request.body()).decode("utf-8")
        value = json.loads(json_text, parse_float=Decimal, parse_int=json_integer, parse_constant=invalid_constant)
    except InvalidOperation:
        raise error(422, "VALIDATION_ERROR", "JSON 숫자 범위를 확인하세요.") from None
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise error(400, "INVALID_JSON", "JSON 형식을 확인하세요.") from None
    return value, json_text


def authorize_instance(request: Request, instance_id: str) -> None:
    if instance_id not in request.app.state.settings.instance_ids:
        raise error(403, "INSTANCE_FORBIDDEN", "허용되지 않은 인스턴스입니다.")


async def parse_event(request: Request, _: Annotated[None, Depends(authenticate)]) -> ParsedEvent:
    value, json_text = await read_document(request)
    try:
        envelope = Envelope.model_validate(value)
    except ValidationError:
        raise error(422, "VALIDATION_ERROR", "요청 형식을 확인하세요.") from None
    authorize_instance(request, envelope.instanceId)
    return ParsedEvent(envelope, json_text)


@router.post("/events", status_code=201, openapi_extra={
    "requestBody": {"required": True, "content": {"application/json": {"schema": request_body_schema(Envelope)}}}
})
def receive_event(parsed: Annotated[ParsedEvent, Depends(parse_event)], request: Request) -> JSONResponse:
    envelope = parsed.envelope
    event_id = uuid4()
    received_at = datetime.now(timezone.utc)
    normalized = normalize(envelope, str(event_id), received_at, request.app.state.settings.attention_policy_names)
    # 검증한 원문을 JSONB로 직접 넘겨 큰 정수/소수의 float 반올림을 피한다.
    document = Jsonb(parsed.json_text, dumps=lambda value: value)
    try:
        with get_connection() as connection:
            connection.execute("SET LOCAL statement_timeout = '4s'")
            connection.execute("SET LOCAL lock_timeout = '3s'")
            connection.execute(
                "INSERT INTO instances (instance_id, last_received_at) VALUES (%s, %s) "
                "ON CONFLICT (instance_id) DO NOTHING", (envelope.instanceId, received_at)
            )
            inserted = connection.execute(
                "INSERT INTO events (event_id, instance_id, message_id, schema_version, source, "
                "received_at, raw_event, normalized) VALUES (%s, %s, %s, %s, %s, %s, %s -> 'rawEvent', %s) "
                "ON CONFLICT (instance_id, message_id) DO NOTHING RETURNING event_id",
                (event_id, envelope.instanceId, UUID(envelope.messageId), envelope.schemaVersion,
                 envelope.source, received_at, document, Jsonb(normalized)),
            ).fetchone()
            duplicate = inserted is None
            if duplicate:
                stored = connection.execute(
                    "SELECT event_id, (schema_version = %s AND source = %s AND raw_event = %s -> 'rawEvent') "
                    "AS identical FROM events WHERE instance_id = %s AND message_id = %s",
                    (envelope.schemaVersion, envelope.source, document, envelope.instanceId, UUID(envelope.messageId)),
                ).fetchone()
                if stored is None or not stored["identical"]:
                    raise error(409, "MESSAGE_CONFLICT", "같은 메시지 ID에 다른 내용이 저장되어 있습니다.")
                event_id = stored["event_id"]
            else:
                connection.execute(
                    "UPDATE instances SET last_received_at = GREATEST(last_received_at, %s) WHERE instance_id = %s",
                    (received_at, envelope.instanceId),
                )
    except (psycopg.errors.UntranslatableCharacter, psycopg.errors.InvalidTextRepresentation,
            psycopg.errors.NumericValueOutOfRange):
        raise error(422, "VALIDATION_ERROR", "PostgreSQL JSONB에 저장할 수 없는 값입니다.") from None
    # context manager의 COMMIT 성공 이후에만 응답을 만든다.
    return JSONResponse(status_code=200 if duplicate else 201, content={
        "eventId": str(event_id), "messageId": envelope.messageId, "duplicate": duplicate,
    })


@dataclass
class ParsedReport:
    report: SensorReport
    json_text: str


async def parse_report(request: Request, _: Annotated[None, Depends(authenticate)]) -> ParsedReport:
    value, json_text = await read_document(request)
    try:
        report = SensorReport.model_validate(value)
    except ValidationError:
        raise error(422, "VALIDATION_ERROR", "상태 보고 형식을 확인하세요.") from None
    authorize_instance(request, report.instanceId)
    return ParsedReport(report, json_text)


@router.post("/sensor-status", status_code=201, openapi_extra={
    "requestBody": {"required": True, "content": {"application/json": {"schema": request_body_schema(SensorReport)}}}
})
def receive_report(parsed: Annotated[ParsedReport, Depends(parse_report)]) -> JSONResponse:
    report = parsed.report
    report_id = uuid4()
    received_at = datetime.now(timezone.utc)
    document = Jsonb(parsed.json_text, dumps=lambda value: value)
    try:
        with get_connection() as connection:
            connection.execute("SET LOCAL statement_timeout = '4s'")
            connection.execute("SET LOCAL lock_timeout = '3s'")
            # 상태는 별도 보관한다. events/instances에는 쓰지 않아 수신 지표를 바꾸지 않는다.
            inserted = connection.execute(
                "INSERT INTO sensor_reports (report_id, instance_id, message_id, source, observed_at, received_at, payload) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (instance_id, message_id) DO NOTHING RETURNING report_id",
                (report_id, report.instanceId, UUID(report.messageId), report.source,
                 parse_timestamp(report.observedAt), received_at, document),
            ).fetchone()
            duplicate = inserted is None
            if duplicate:
                stored = connection.execute(
                    "SELECT report_id, (payload - 'messageId' - 'instanceId' = %s - 'messageId' - 'instanceId') AS identical "
                    "FROM sensor_reports WHERE instance_id = %s AND message_id = %s",
                    (document, report.instanceId, UUID(report.messageId)),
                ).fetchone()
                if stored is None or not stored["identical"]:
                    raise error(409, "MESSAGE_CONFLICT", "같은 메시지 ID에 다른 상태가 저장되어 있습니다.")
                report_id = stored["report_id"]
    except (psycopg.errors.UntranslatableCharacter, psycopg.errors.InvalidTextRepresentation,
            psycopg.errors.NumericValueOutOfRange):
        raise error(422, "VALIDATION_ERROR", "PostgreSQL JSONB에 저장할 수 없는 값입니다.") from None
    return JSONResponse(status_code=200 if duplicate else 201, content={
        "reportId": str(report_id), "messageId": report.messageId, "duplicate": duplicate,
    })
