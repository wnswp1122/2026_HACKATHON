"""HTTPX 기반 Responses API. 자동 재시도·도구·외부 자료 재조회는 사용하지 않는다."""

import base64
import json
import os
from pathlib import Path

import httpx
from pydantic import ValidationError

from .validation import AnalysisResult, fail

INSTRUCTION_VERSION = "snapshot-analysis-v2"
INSTRUCTIONS_PATH = Path(__file__).with_name("instructions-v2.md")
MAX_RESPONSE_BYTES = 1024 * 1024


def get_http_client():
    with httpx.Client(
        base_url="https://api.openai.com/v1/",
        timeout=httpx.Timeout(60.0, connect=5.0),
        follow_redirects=False,
        trust_env=False,
    ) as client:
        yield client


def configuration() -> tuple[str, str, str]:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    model = os.environ.get("OPENAI_MODEL", "").strip()
    if not key or not model:
        raise fail(503, "AI_NOT_CONFIGURED", "서버의 OpenAI 키와 모델 설정이 필요합니다.")
    try:
        instructions = INSTRUCTIONS_PATH.read_text(encoding="utf-8").strip()
        if not instructions:
            raise ValueError
    except (OSError, UnicodeError, ValueError):
        raise fail(503, "AI_NOT_CONFIGURED", "서버의 AI 지침 파일을 확인하세요.") from None
    return key, model, instructions


def request_analysis(
    client: httpx.Client, payload: dict, image: bytes, config: tuple[str, str, str]
) -> tuple[str, dict]:
    key, model, instructions = config
    body = {
        "model": model,
        "instructions": instructions,
        "store": False,
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": json.dumps(payload, ensure_ascii=False, allow_nan=False)},
                {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(image).decode("ascii")},
            ],
        }],
        "text": {"format": {
            "type": "json_schema",
            "name": "snapshot_analysis",
            "strict": True,
            "schema": AnalysisResult.model_json_schema(),
        }},
    }
    try:
        with client.stream("POST", "responses", headers={"Authorization": f"Bearer {key}"}, json=body) as response:
            data = bytearray()
            for chunk in response.iter_bytes(chunk_size=65536):
                data.extend(chunk)
                if len(data) > MAX_RESPONSE_BYTES:
                    raise ValueError
            if response.status_code == 429:
                error = json.loads(data).get("error", {})
                if isinstance(error, dict) and (error.get("type") == "insufficient_quota" or error.get("code") in ("insufficient_quota", "credit_balance_exhausted")):
                    raise fail(503, "AI_QUOTA_EXHAUSTED", "OpenAI 프로젝트의 사용 가능한 크레딧이 없습니다. 결제·사용 한도를 확인하세요.")
            response.raise_for_status()
        result = json.loads(data)
        return parse_response(result)
    except httpx.TimeoutException:
        raise fail(504, "AI_TIMEOUT", "AI 응답 시간이 초과되었습니다. 다시 요청할 수 있습니다.") from None
    except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError, RecursionError):
        # upstream 본문·예외에는 입력이나 비밀값이 포함될 수 있어 응답/로그로 복사하지 않는다.
        raise fail(502, "AI_FAILED", "AI 요청 또는 응답 검증에 실패했습니다. 다시 요청할 수 있습니다.") from None


def parse_response(response: dict) -> tuple[str, dict]:
    if not isinstance(response, dict) or response.get("status") != "completed":
        raise ValueError
    if response.get("error") is not None or response.get("incomplete_details") is not None:
        raise ValueError
    model = response.get("model")
    if not isinstance(model, str) or not model.strip():
        raise ValueError
    output = response.get("output")
    if not isinstance(output, list):
        raise ValueError
    messages = []
    for item in output:
        if not isinstance(item, dict):
            raise ValueError
        if item.get("type") == "reasoning":
            continue
        if item.get("type") != "message" or item.get("role") != "assistant" or item.get("status") != "completed":
            raise ValueError
        messages.append(item)
    if len(messages) != 1:
        raise ValueError
    content = messages[0].get("content")
    if not isinstance(content, list) or len(content) != 1:
        raise ValueError
    part = content[0]
    if not isinstance(part, dict) or part.get("type") != "output_text" or not isinstance(part.get("text"), str):
        raise ValueError
    result = AnalysisResult.model_validate_json(part["text"], strict=True)
    if any(not text.strip() for entries in result.model_dump().values() for text in entries):
        raise ValueError
    return model, result.model_dump()
