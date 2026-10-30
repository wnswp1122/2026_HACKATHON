import logging
from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from db import get_connection
from settings import Settings

logger = logging.getLogger("uvicorn.error")
MODULES = ("ingest", "events", "snapshots", "analysis")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = Settings.from_env()
    for name in app.state.missing_modules:
        logger.warning("미조립 모듈: src.%s.router (이 앱은 부분 구현 상태입니다)", name)
    yield


def error_response(status: int, code: str, message: str, headers=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}}, headers=headers)


def create_app() -> FastAPI:
    app = FastAPI(title="AI 기반 서버 보안 모니터링·분석 플랫폼", version="1", lifespan=lifespan)
    app.state.loaded_modules = []
    app.state.missing_modules = []
    for name in MODULES:
        path = Path(__file__).parent / "src" / name / "router.py"
        if not path.is_file():
            app.state.missing_modules.append(name)
            continue
        # 파일이 있는 모듈의 내부 ImportError/의존성 오류는 숨기지 않고 기동을 실패시킨다.
        module = import_module(f"src.{name}.router")
        app.include_router(module.router)
        app.state.loaded_modules.append(name)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        if isinstance(exc.detail, dict) and isinstance(exc.detail.get("code"), str) and isinstance(exc.detail.get("message"), str):
            return error_response(exc.status_code, exc.detail["code"], exc.detail["message"], exc.headers)
        codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 413: "PAYLOAD_TOO_LARGE"}
        return error_response(exc.status_code, codes.get(exc.status_code, "HTTP_ERROR"), "요청을 확인하세요.", exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        if any(item["type"] == "json_invalid" for item in exc.errors()):
            return error_response(400, "INVALID_JSON", "JSON 형식을 확인하세요.")
        return error_response(422, "VALIDATION_ERROR", "요청 형식을 확인하세요.")

    @app.exception_handler(psycopg.Error)
    async def storage_error(request: Request, exc: psycopg.Error):
        logger.error("DB 작업 실패 (%s)", type(exc).__name__)
        return error_response(503, "STORAGE_UNAVAILABLE", "저장소를 사용할 수 없습니다.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.error("요청 처리 실패 (%s)", type(exc).__name__)
        return error_response(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.")

    @app.get("/health")
    def health():
        with get_connection() as connection:
            connection.execute("SELECT 1")
        return {"status": "ok", "database": "ok", "loadedModules": app.state.loaded_modules,
                "missingModules": app.state.missing_modules}

    return app


app = create_app()
