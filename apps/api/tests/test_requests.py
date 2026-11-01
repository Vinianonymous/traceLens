"""Destination, pinning, redirects, failures, size limits and redaction."""

import asyncio
from tempfile import TemporaryDirectory

import httpx
import pytest
from app.core.config import Settings
from app.db.base import Base
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.schemas.requests import MAX_BODY
from app.services.requests import RequestService, Resolver
from httpx import ASGITransport, AsyncClient

DEMO = "http://127.0.0.1:8001"


async def local_resolver(host: str, port: int) -> list[str]:
    assert (host, port) == ("127.0.0.1", 8001)
    return ["127.0.0.1"]


def call(
    payload: dict[str, object],
    handler: httpx.MockTransport,
    resolver: Resolver = local_resolver,
) -> httpx.Response:
    async def run() -> httpx.Response:
        with TemporaryDirectory() as directory:
            settings = Settings(data_dir=directory)
            engine = create_sqlite_engine(directory)
            Base.metadata.create_all(engine)
            service = RequestService(settings, resolver=resolver, transport=handler)
            async with AsyncClient(
                transport=ASGITransport(app=create_app(settings, service, engine)),
                base_url="http://test",
            ) as client:
                result = await client.post("/api/v1/requests/send", json=payload)
            engine.dispose()
            return result

    return asyncio.run(run())


def request(**kwargs: object) -> dict[str, object]:
    return {"method": "GET", "url": f"{DEMO}/items", **kwargs}


def test_demo_request_is_pinned_and_post_supports_body_and_query() -> None:
    seen: list[httpx.Request] = []

    def handler(outgoing: httpx.Request) -> httpx.Response:
        seen.append(outgoing)
        return httpx.Response(201, json={"id": 3, "name": "Eraser"})

    response = call(
        request(
            method="POST",
            url=f"{DEMO}/items?from=url",
            body='{"name":"Eraser"}',
            query={"page": "1"},
        ),
        httpx.MockTransport(handler),
    )
    assert response.status_code == 200
    assert response.json()["status"] == 201
    assert response.json()["body"] == '{"id":3,"name":"Eraser"}'
    assert str(seen[0].url) == f"{DEMO}/items?from=url&page=1"
    assert seen[0].headers["host"] == "127.0.0.1:8001"
    assert seen[0].content == b'{"name":"Eraser"}'


def test_blocked_destinations_never_resolve_or_connect() -> None:
    hits: list[httpx.Request] = []
    transport = httpx.MockTransport(lambda req: (hits.append(req), httpx.Response(200))[1])
    for url in (
        "http://example.com/items",
        "http://127.0.0.1:9000/items",
        "http://127.0.0.1:8001@evil.test/items",
        "http://0177.0.0.1:8001/items",
        "https://127.0.0.1:8001/items",
        "http://127.0.0.1:8001/items#fragment",
    ):
        result = call(request(url=url), transport)
        assert result.status_code in (400, 403)
        assert result.json()["code"] in ("DESTINATION_BLOCKED", "INVALID_URL")
    assert not hits


def test_dns_rebinding_or_address_family_change_is_blocked() -> None:
    hits: list[httpx.Request] = []
    transport = httpx.MockTransport(lambda req: (hits.append(req), httpx.Response(200))[1])

    async def rebound(host: str, port: int) -> list[str]:
        return ["127.0.0.1", "8.8.8.8"]

    result = call(request(), transport, resolver=rebound)
    assert result.status_code == 502
    assert result.json()["code"] == "DESTINATION_UNAVAILABLE"
    assert not hits


def test_docker_demo_uses_resolved_private_ip_and_preserves_host() -> None:
    async def docker_resolver(host: str, port: int) -> list[str]:
        assert (host, port) == ("demo-api", 8001)
        return ["172.18.0.7"]

    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, headers={"content-type": "application/json"}, content=b"[]")

    async def run() -> httpx.Response:
        with TemporaryDirectory() as directory:
            settings = Settings(demo_origin="http://demo-api:8001", data_dir=directory)
            engine = create_sqlite_engine(directory)
            Base.metadata.create_all(engine)
            service = RequestService(
                settings, resolver=docker_resolver, transport=httpx.MockTransport(handler)
            )
            async with AsyncClient(
                transport=ASGITransport(app=create_app(settings, service, engine)),
                base_url="http://test",
            ) as client:
                result = await client.post(
                    "/api/v1/requests/send",
                    json={"method": "GET", "url": "http://demo-api:8001/items"},
                )
            engine.dispose()
            return result

    assert asyncio.run(run()).status_code == 200
    assert str(seen[0].url) == "http://172.18.0.7:8001/items"
    assert seen[0].headers["host"] == "demo-api:8001"


def test_config_rejects_other_destinations() -> None:
    with pytest.raises(ValueError, match="Only the bundled demo"):
        Settings(demo_origin="http://example.com:8001")


def test_redirect_is_not_followed() -> None:
    hits: list[httpx.Request] = []

    def redirect(req: httpx.Request) -> httpx.Response:
        hits.append(req)
        return httpx.Response(302, headers={"location": "http://example.com/private"})

    result = call(request(), httpx.MockTransport(redirect))
    assert result.status_code == 502
    assert result.json() == {
        "code": "REDIRECT_BLOCKED",
        "message": "Demo API redirect blocked",
        "details": {},
    }
    assert len(hits) == 1


def test_timeout_returns_sanitized_error() -> None:
    def timeout(req: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret in network error", request=req)

    result = call(request(), httpx.MockTransport(timeout))
    assert result.status_code == 504
    assert result.json()["code"] == "REQUEST_TIMEOUT"
    assert "secret" not in result.text


def test_response_cap_binary_and_secret_headers() -> None:
    large = call(
        request(),
        httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                headers={"content-type": "text/plain", "set-cookie": "secret=1"},
                content=b"a" * (MAX_BODY + 10),
            )
        ),
    )
    assert large.json()["truncated"] is True
    assert len(large.json()["body"]) == MAX_BODY
    assert "set-cookie" not in large.json()["headers"]
    binary = call(
        request(),
        httpx.MockTransport(
            lambda _: httpx.Response(200, headers={"content-type": "image/png"}, content=b"\x89PNG")
        ),
    )
    assert binary.json()["body"] is None


def test_input_size_validation_and_sensitive_headers() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(200))
    bad_header = call(request(headers={"Authorization": "secret"}), transport)
    assert bad_header.status_code == 400
    assert "secret" not in bad_header.text
    too_large = call(request(body="a" * (MAX_BODY + 1)), transport)
    assert too_large.status_code == 413
    invalid = call({"method": "TRACE", "url": f"{DEMO}/items"}, transport)
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_REQUEST"
    huge_query = call(request(query={"name": "a" * 5000}), transport)
    assert huge_query.status_code == 413
    huge_headers = call(request(headers={"x-long": "a" * 17000}), transport)
    assert huge_headers.status_code == 413


def test_cors_only_allows_local_web_origin() -> None:
    async def run(origin: str) -> httpx.Response:
        async with AsyncClient(
            transport=ASGITransport(app=create_app()), base_url="http://test"
        ) as client:
            return await client.options(
                "/api/v1/requests/send",
                headers={
                    "origin": origin,
                    "access-control-request-method": "POST",
                    "access-control-request-headers": "content-type",
                },
            )

    allowed = asyncio.run(run("http://127.0.0.1:5173"))
    denied = asyncio.run(run("http://evil.test"))
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_unknown_api_route_has_structured_error() -> None:
    async def run() -> httpx.Response:
        async with AsyncClient(
            transport=ASGITransport(app=create_app()), base_url="http://test"
        ) as client:
            return await client.get("/api/v1/not-a-route")

    response = asyncio.run(run())
    assert response.status_code == 404
    assert response.json() == {"code": "HTTP_ERROR", "message": "Route not found", "details": {}}
