"""Local API with an explicitly demo-only request endpoint."""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import Settings, load_settings
from app.schemas.requests import ApiError, SendRequest, SendResult
from app.services.requests import RequestFailure, RequestService

MAX_REQUEST_BYTES = 1024 * 1024 + 65536


def create_app(settings: Settings | None = None, service: RequestService | None = None) -> FastAPI:
    config = settings or load_settings()
    api = FastAPI(title="TraceLens API", version="0.1.0")
    web_port = os.environ.get("TRACELENS_WEB_PORT", "5173")
    if not web_port.isdecimal() or not 1 <= int(web_port) <= 65535:
        raise ValueError("Invalid local frontend port")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[f"http://127.0.0.1:{web_port}"],
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )
    runner = service or RequestService(config)

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
        return await runner.send(payload)

    return api


app = create_app()
