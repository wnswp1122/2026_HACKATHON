"""앱은 이 router를 별도 접두사 없이 include한다."""

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import service
from .upstream import get_http_client
from .validation import MAX_IMAGE_BYTES, fail

snapshot_router = APIRouter(prefix="/api/snapshots", tags=["analysis"])


@snapshot_router.put("/{snapshot_id}/image", openapi_extra={
    "requestBody": {"required": True, "content": {
        "image/png": {"schema": {"type": "string", "format": "binary"}},
    }},
})
async def put_image(snapshot_id: UUID, request: Request):
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "image/png":
        raise fail(422, "INVALID_IMAGE", "Content-Type image/png로 PNG를 업로드하세요.")
    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > MAX_IMAGE_BYTES:
            raise fail(413, "IMAGE_TOO_LARGE", "PNG는 최대 5 MiB까지 업로드할 수 있습니다.")
        image.extend(chunk)
    body, status = await run_in_threadpool(service.store_image, snapshot_id, bytes(image))
    return JSONResponse(body, status_code=status)


@snapshot_router.post("/{snapshot_id}/analysis")
def post_analysis(snapshot_id: UUID, client: Annotated[httpx.Client, Depends(get_http_client)]):
    body, status = service.analyze(snapshot_id, client)
    return JSONResponse(body, status_code=status)


@snapshot_router.get("/{snapshot_id}/analysis")
def read_analysis(snapshot_id: UUID):
    return service.get_analysis(snapshot_id)


from .investigation import router as investigation_router

router = APIRouter()
router.include_router(snapshot_router)
router.include_router(investigation_router)
