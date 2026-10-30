"""HTTPX 기반 Gemini API. 자동 재시도·도구·외부 자료 재조회는 사용하지 않는다."""

import base64
import json
import os
import re
from pathlib import Path

import httpx
from pydantic import ValidationError

from .validation import AnalysisResult, fail

INSTRUCTION_VERSION = "snapshot-analysis-v2"
INSTRUCTIONS_PATH = Path(__file__).with_name("instructions-v2.md")
MAX_RESPONSE_BYTES = 1024 * 1024


def get_http_client():
    with httpx.Client(
        base_url="https://generativelanguage.googleapis.com/v1beta/",
        timeout=httpx.Timeout(60.0, connect=5.0),
        follow_redirects=False,
        trust_env=False,
    ) as client:
        yield client


def configuration() -> tuple[str, str, str]:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_MODEL", "").strip()
    if not key or not re.fullmatch(r"gemini-[A-Za-z0-9][A-Za-z0-9._-]*", model):
        raise fail(503, "AI_NOT_CONFIGURED", "서버의 Gemini 키와 모델 ID 설정을 확인하세요.")
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
        "systemInstruction": {"parts": [{"text": instructions}]},
        "contents": [{
            "role": "user",
            "parts": [
                {"text": json.dumps(payload, ensure_ascii=False, allow_nan=False)},
                {"inlineData": {
                    "mimeType": "image/png",
                    "data": base64.b64encode(image).decode("ascii"),
                }},
            ],
        }],
        "generationConfig": {
            "candidateCount": 1,
            "responseMimeType": "application/json",
            "responseJsonSchema": AnalysisResult.model_json_schema(),
        },
    }
    try:
        with client.stream(
            "POST", f"models/{model}:generateContent", headers={"x-goog-api-key": key}, json=body
        ) as response:
            data = bytearray()
            for chunk in response.iter_bytes(chunk_size=65536):
                data.extend(chunk)
                if len(data) > MAX_RESPONSE_BYTES:
                    raise ValueError
            if response.status_code == 429:
                raise fail(503, "AI_QUOTA_EXHAUSTED", "Gemini API의 요청·토큰 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도하세요.")
            response.raise_for_status()
        return parse_response(json.loads(data))
    except httpx.TimeoutException:
        raise fail(504, "AI_TIMEOUT", "AI 응답 시간이 초과되었습니다. 다시 요청할 수 있습니다.") from None
    except (httpx.HTTPError, ValueError, TypeError, KeyError, ValidationError, RecursionError):
        # upstream 본문·예외에는 입력이나 비밀값이 포함될 수 있어 응답/로그로 복사하지 않는다.
        raise fail(502, "AI_FAILED", "AI 요청 또는 응답 검증에 실패했습니다. 다시 요청할 수 있습니다.") from None


def parse_response(response: dict) -> tuple[str, dict]:
    if not isinstance(response, dict) or response.get("error") is not None:
        raise ValueError
    feedback = response.get("promptFeedback", {})
    if not isinstance(feedback, dict) or feedback.get("blockReason"):
        raise ValueError
    model = response.get("modelVersion")
    if not isinstance(model, str) or not model.strip():
        raise ValueError
    candidates = response.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != 1:
        raise ValueError
    candidate = candidates[0]
    if not isinstance(candidate, dict) or candidate.get("finishReason") != "STOP":
        raise ValueError
    content = candidate.get("content")
    if not isinstance(content, dict) or content.get("role") != "model":
        raise ValueError
    parts = content.get("parts")
    if not isinstance(parts, list) or not parts:
        raise ValueError
    texts = []
    for part in parts:
        if not isinstance(part, dict):
            raise ValueError
        if part.get("thought") is True:
            continue
        if not isinstance(part.get("text"), str):
            raise ValueError
        texts.append(part["text"])
    result = AnalysisResult.model_validate_json("".join(texts), strict=True)
    if any(not text.strip() for entries in result.model_dump().values() for text in entries):
        raise ValueError
    return model, result.model_dump()
