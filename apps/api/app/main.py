"""Local API with an explicitly demo-only request endpoint."""

import os
import time
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import Engine
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import Settings, load_settings
from app.db.session import create_sqlite_engine
from app.schemas.persistence import (
    CollectionInput,
    CollectionView,
    ExchangeFile,
    HistoryPage,
    Method,
    TemplateInput,
    TemplateUpdate,
    TemplateView,
)
from app.schemas.requests import ApiError, SendRequest, SendResult
from app.schemas.stats import StatsSummary
from app.services.persistence import PersistenceStore
from app.services.requests import RequestFailure, RequestService
from app.services.stats import summary

MAX_REQUEST_BYTES = 1024 * 1024 + 65536


def create_app(
    settings: Settings | None = None,
    service: RequestService | None = None,
    engine: Engine | None = None,
) -> FastAPI:
    config = settings or load_settings()
    api = FastAPI(title="TraceLens API", version="0.1.0")
    web_port = os.environ.get("TRACELENS_WEB_PORT", "5173")
    if not web_port.isdecimal() or not 1 <= int(web_port) <= 65535:
        raise ValueError("Invalid local frontend port")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[f"http://127.0.0.1:{web_port}"],
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["content-type"],
    )
    runner = service or RequestService(config)
    store = PersistenceStore(engine or create_sqlite_engine(config.data_dir), runner)

    @api.exception_handler(RequestFailure)
    async def request_failure(request: Request, exc: RequestFailure) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content=ApiError(code=exc.code, message=exc.message).model_dump(),
        )

    @api.exception_handler(StarletteHTTPException)
    async def route_failure(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = {
            404: "Route not found",
            405: "Method not allowed",
        }.get(exc.status_code, "Request could not be completed")
        return JSONResponse(
            status_code=exc.status_code,
            content=ApiError(code="HTTP_ERROR", message=message).model_dump(),
        )

    @api.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @api.exception_handler(RequestValidationError)
    async def validation_failure(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ApiError(code="INVALID_REQUEST", message="Invalid request data").model_dump(),
        )

    @api.get("/api/v1/stats/summary", response_model=StatsSummary)
    def stats_summary() -> StatsSummary:
        with Session(store.engine) as session:
            return summary(session)

    @api.post(
        "/api/v1/requests/send",
        response_model=SendResult,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {"application/json": {"schema": SendRequest.model_json_schema()}},
            }
        },
    )
    async def send(request: Request) -> SendResult:
        if (
            request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            != "application/json"
        ):
            raise RequestFailure(415, "INVALID_CONTENT_TYPE", "JSON request required")
        content_length = request.headers.get("content-length", "0")
        if not content_length.isdecimal():
            raise RequestFailure(400, "INVALID_REQUEST", "Invalid request length")
        if len(content_length) > 10 or int(content_length) > MAX_REQUEST_BYTES:
            raise RequestFailure(413, "REQUEST_TOO_LARGE", "Request exceeds size limit")
        data = bytearray()
        async for chunk in request.stream():
            if len(data) + len(chunk) > MAX_REQUEST_BYTES:
                raise RequestFailure(413, "REQUEST_TOO_LARGE", "Request exceeds size limit")
            data.extend(chunk)
        try:
            payload = SendRequest.model_validate_json(data)
        except ValidationError as exc:
            raise RequestFailure(422, "INVALID_REQUEST", "Invalid request data") from exc
        start = time.monotonic()
        try:
            result = await runner.send(payload)
        except RequestFailure as exc:
            store.record(payload, None, exc.code, round((time.monotonic() - start) * 1000))
            raise
        store.record(payload, result, None, result.duration_ms)
        return result

    @api.get("/api/v1/collections", response_model=list[CollectionView])
    def collections() -> list[CollectionView]:
        return store.list_collections()

    @api.post("/api/v1/collections", response_model=CollectionView, status_code=201)
    def create_collection(data: CollectionInput) -> CollectionView:
        return store.create_collection(data.name)

    @api.patch("/api/v1/collections/{id}", response_model=CollectionView)
    def rename_collection(id: str, data: CollectionInput) -> CollectionView:
        return store.rename_collection(id, data.name)

    @api.delete("/api/v1/collections/{id}", status_code=204)
    def delete_collection(id: str) -> None:
        store.delete_collection(id)

    @api.post("/api/v1/collections/{id}/requests", response_model=TemplateView, status_code=201)
    def save_request(id: str, data: TemplateInput) -> TemplateView:
        return store.save_template(id, data)

    @api.patch("/api/v1/saved-requests/{id}", response_model=TemplateView)
    def update_request(id: str, data: TemplateUpdate) -> TemplateView:
        return store.update_template(id, data)

    @api.delete("/api/v1/saved-requests/{id}", status_code=204)
    def delete_request(id: str) -> None:
        store.delete_template(id)

    @api.get("/api/v1/history", response_model=HistoryPage)
    def history(
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        search: str | None = Query(default=None, max_length=200),
        method: Method | None = None,
        status: int | None = Query(default=None, ge=100, le=599),
        sort: Literal["newest", "oldest", "duration_asc", "duration_desc"] = "newest",
    ) -> HistoryPage:
        order = {"newest": "requested_desc", "oldest": "requested_asc"}.get(sort, sort)
        return store.history(page, page_size, search, method, status, order)

    @api.delete("/api/v1/history", status_code=204)
    def clear_history() -> None:
        store.clear_history()

    @api.get("/api/v1/export", response_model=ExchangeFile)
    def export() -> ExchangeFile:
        return store.export()

    @api.post("/api/v1/import")
    async def import_collections(request: Request) -> dict[str, int]:
        if (
            request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            != "application/json"
        ):
            raise RequestFailure(415, "INVALID_CONTENT_TYPE", "JSON request required")
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                raise RequestFailure(413, "REQUEST_TOO_LARGE", "Import exceeds size limit")
            body.extend(chunk)
        try:
            data = ExchangeFile.model_validate_json(body)
        except ValidationError as exc:
            raise RequestFailure(
                422, "INVALID_IMPORT", "Invalid collection file or version"
            ) from exc
        return {"imported": store.import_file(data)}

    return api


app = create_app()
