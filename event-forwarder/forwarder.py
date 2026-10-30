"""원본 한 줄을 인증된 v1 봉투로 보내고 ACK를 확인한다."""

import json
import sys
import time
from dataclasses import asdict, dataclass
from uuid import UUID, uuid4

import httpx

from settings import Settings


@dataclass
class Counts:
    accepted: int = 0
    duplicates: int = 0
    invalid_input: int = 0
    failed: int = 0
    requests: int = 0
    retries: int = 0

    def as_dict(self):
        return asdict(self)


class AuthenticationError(Exception):
    pass


def diagnose(reason, **fields):
    # 예외 문자열·HTTP 응답 본문·원본·설정값에는 비밀값이 섞일 수 있다.
    print(json.dumps({"reason": reason, **fields}), file=sys.stderr, flush=True)


def reject_constant(value):
    raise ValueError("Non-JSON number")


def validate_event(line: bytes):
    # 숫자는 구문만 검사한다. 값의 해석·변환 없이 아래 원문을 그대로 보낸다.
    event = json.loads(line.decode("utf-8"), parse_constant=reject_constant,
                       parse_float=str, parse_int=str)
    if not isinstance(event, dict) or not event:
        raise ValueError("Expected a nonempty JSON object")
    # 검사는 객체 여부만 확인한다. 큰 수·소수를 재직렬화해 값이 달라지지 않게 한다.
    return line.strip()


def valid_ack(response: httpx.Response, message_id: str):
    try:
        ack = response.json()
        if not isinstance(ack, dict):
            return False
        if not isinstance(ack.get("eventId"), str):
            return False
        UUID(ack["eventId"])
        return (
            ack.get("messageId") == message_id
            and type(ack.get("duplicate")) is bool
            and ack["duplicate"] == (response.status_code == 200)
        )
    except (ValueError, UnicodeError, RecursionError):
        return False


def retry_delay(response: httpx.Response | None, retry_index: int):
    delay = 2 ** retry_index
    if response is not None:
        seconds = response.headers.get("Retry-After", "").strip()
        if seconds.isascii() and seconds.isdecimal():
            seconds = seconds.lstrip("0") or "0"
            capped = 30 if len(seconds) > 2 else min(int(seconds), 30)
            delay = max(delay, capped)
    return delay


def send_event(client: httpx.Client, settings: Settings, event: bytes,
               source: str, counts: Counts):
    envelope = {
        "schemaVersion": "1",
        "messageId": str(uuid4()),
        "instanceId": settings.instance_id,
        "source": source,
    }
    # 한 번만 직렬화해 모든 시도에서 같은 내용과 ID를 유지한다.
    body = json.dumps(envelope).encode("utf-8")[:-1] + b', "rawEvent": ' + event + b'}'
    headers = {"Authorization": f"Bearer {settings.ingest_token}",
               "Content-Type": "application/json"}
    for attempt in range(4):
        response = None
        counts.requests += 1
        if attempt:
            counts.retries += 1
        try:
            response = client.post(settings.events_url, content=body, headers=headers)
        except httpx.RequestError:
            reason = "network_error"
        else:
            status = response.status_code
            if status in (401, 403):
                counts.failed += 1
                diagnose("authentication_error", http_status=status)
                raise AuthenticationError
            if status in (200, 201):
                if valid_ack(response, envelope["messageId"]):
                    if status == 200:
                        counts.duplicates += 1
                    else:
                        counts.accepted += 1
                    return
                reason = "ambiguous_ack"
            elif status == 429 or 500 <= status <= 599:
                reason = "temporary_http_error"
            else:
                counts.failed += 1
                diagnose("http_failure", http_status=status)
                return
        if attempt == 3:
            counts.failed += 1
            diagnose("retry_exhausted", failure=reason,
                     http_status=response.status_code if response is not None else None)
            return
        delay = retry_delay(response, attempt)
        diagnose("retry", failure=reason, next_attempt=attempt + 2, delay_seconds=delay)
        time.sleep(delay)
