"""Security boundaries across sends, history and legacy collection exports."""

import asyncio
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config
from app.core.config import Settings, load_settings
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.models import Collection, SavedRequest
from app.services.requests import RequestService
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import Session


def test_configured_and_common_secret_headers_are_never_exposed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRACELENS_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TRACELENS_SENSITIVE_HEADERS", "X-Private-Nonce")
    settings = load_settings()
    assert settings.sensitive_headers == ("X-Private-Nonce",)
    command.upgrade(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")

    # Simulate an older database or manual edit with a header that became sensitive
    # after the template was saved. Listing and exporting must both omit its value.
    engine = create_sqlite_engine(str(tmp_path))
    with Session(engine) as db:
        db.add(
            Collection(
                name="Older examples",
                saved_requests=[
                    SavedRequest(
                        name="Old request",
                        method="GET",
                        url="http://127.0.0.1:8001/items",
                        query_json={},
                        headers_json_redacted={
                            "X-Private-Nonce": "stored-private-value",
                            "X-Auth-Token": "stored-token",
                            "Accept": "application/json",
                        },
                    )
                ],
            )
        )
        db.commit()
    engine.dispose()

    hits: list[httpx.Request] = []

    async def resolver(host: str, port: int) -> list[str]:
        return ["127.0.0.1"]

    def handler(request: httpx.Request) -> httpx.Response:
        hits.append(request)
        return httpx.Response(
            200,
            headers={
                "content-type": "text/plain",
                "X-Private-Nonce": "response-private-value",
                "X-Auth-Token": "response-token",
            },
            text="safe response",
        )

    async def run() -> None:
        service = RequestService(
            settings, resolver=resolver, transport=httpx.MockTransport(handler)
        )
        async with AsyncClient(
            transport=ASGITransport(app=create_app(settings, service)), base_url="http://test"
        ) as client:
            for name in ("X-Private-Nonce", "X-Auth-Token", "Authorization"):
                response = await client.post(
                    "/api/v1/requests/send",
                    json={
                        "method": "GET",
                        "url": "http://127.0.0.1:8001/items?token=hidden-query",
                        "headers": {name: "request-private-value"},
                    },
                )
                assert response.status_code == 400
                assert "request-private-value" not in response.text
            assert hits == []

            response = await client.post(
                "/api/v1/requests/send",
                json={"method": "GET", "url": "http://127.0.0.1:8001/items?token=hidden-query"},
            )
            assert response.status_code == 200
            assert "response-private-value" not in response.text
            assert "response-token" not in response.text
            assert len(hits) == 1
            saved = (await client.get("/api/v1/collections")).text
            exported = (await client.get("/api/v1/export")).text
            for text in (saved, exported):
                assert "stored-private-value" not in text
                assert "stored-token" not in text
                assert "application/json" in text
            for path in ("/api/v1/history", "/api/v1/stats/summary"):
                text = (await client.get(path)).text
                assert "hidden-query" not in text
                assert "response-private-value" not in text

    asyncio.run(run())


def test_sensitive_header_configuration_rejects_invalid_names() -> None:
    with pytest.raises(ValueError, match="Invalid sensitive header"):
        Settings(sensitive_headers=("Invalid\r\nHeader",))
