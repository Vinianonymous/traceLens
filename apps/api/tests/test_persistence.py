"""Round-trip persistence, history safety, and strict interchange validation."""

import asyncio
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config
from app.core.config import Settings
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.models import Collection, SavedRequest
from app.services.requests import RequestService
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

DEMO = "http://127.0.0.1:8001/items"


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("TRACELENS_DATA_DIR", str(tmp_path))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    return tmp_path


def run(path: Path, action: object) -> object:
    async def resolver(host: str, port: int) -> list[str]:
        return ["127.0.0.1"]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/timeout":
            raise httpx.ReadTimeout("private network text", request=request)
        return httpx.Response(201, json={"id": 3}, headers={"set-cookie": "secret"})

    async def execute() -> object:
        settings = Settings(data_dir=str(path))
        service = RequestService(
            settings, resolver=resolver, transport=httpx.MockTransport(handler)
        )
        async with AsyncClient(
            transport=ASGITransport(app=create_app(settings, service)), base_url="http://test"
        ) as client:
            return await action(client)  # type: ignore[operator]

    return asyncio.run(execute())


def test_collection_crud_templates_and_restart(db_path: Path) -> None:
    async def create(client: AsyncClient) -> tuple[str, str]:
        row = await client.post("/api/v1/collections", json={"name": "  Examples  "})
        assert row.status_code == 201
        assert row.json()["name"] == "Examples"
        assert row.json()["created_at"].endswith("Z")
        id = row.json()["id"]
        saved = await client.post(
            f"/api/v1/collections/{id}/requests",
            json={
                "name": "Create",
                "method": "POST",
                "url": DEMO,
                "query": {"page": "2"},
                "headers": {"content-type": "application/json"},
                "body": '{"name":"Private"}',
            },
        )
        assert saved.status_code == 201
        assert saved.json()["body"] is None
        return id, saved.json()["id"]

    id, item = run(db_path, create)  # type: ignore[misc]

    async def update(client: AsyncClient) -> None:
        rows = (await client.get("/api/v1/collections")).json()
        assert len(rows) == 1 and rows[0]["requests"][0]["name"] == "Create"
        assert (await client.patch(f"/api/v1/collections/{id}", json={"name": "Renamed"})).json()[
            "name"
        ] == "Renamed"
        changed = await client.patch(f"/api/v1/saved-requests/{item}", json={"name": "Copy"})
        assert changed.json()["name"] == "Copy"
        assert (await client.delete(f"/api/v1/saved-requests/{item}")).status_code == 204
        assert (await client.delete(f"/api/v1/collections/{id}")).status_code == 204
        assert (await client.get("/api/v1/collections")).json() == []
        assert (await client.delete(f"/api/v1/collections/{id}")).status_code == 404

    run(db_path, update)


def test_history_records_success_failure_and_redacts_destinations(db_path: Path) -> None:
    async def actions(client: AsyncClient) -> None:
        for url, expected in (
            (f"{DEMO}?token=secret", 200),
            ("http://example.com/secret", 403),
            ("http://127.0.0.1:8001/timeout", 504),
        ):
            result = await client.post("/api/v1/requests/send", json={"method": "GET", "url": url})
            assert result.status_code == expected
        page = (await client.get("/api/v1/history?page_size=2&sort=oldest")).json()
        assert page["total"] == 3 and len(page["items"]) == 2
        assert page["items"][0]["status"] == 201
        assert page["items"][0]["requested_at"].endswith("Z")
        assert page["items"][1]["sanitized_url"] == "[blocked destination]"
        assert "secret" not in str(page)
        errors = (await client.get("/api/v1/history?sort=newest&page_size=1")).json()
        assert errors["items"][0]["error_code"] == "REQUEST_TIMEOUT"
        assert errors["items"][0]["status"] is None
        assert (await client.get("/api/v1/history?method=GET&status=201")).json()["total"] == 1
        assert (await client.get("/api/v1/history?search=blocked")).json()["total"] == 1
        assert (await client.get("/api/v1/history?page_size=999")).json()[
            "code"
        ] == "INVALID_REQUEST"

    run(db_path, actions)

    async def restart(client: AsyncClient) -> None:
        assert (await client.get("/api/v1/history")).json()["total"] == 3
        assert (await client.delete("/api/v1/history")).status_code == 204
        assert (await client.get("/api/v1/history")).json()["total"] == 0

    run(db_path, restart)


def test_import_export_rejects_secrets_and_invalid_files_atomically(db_path: Path) -> None:
    async def actions(client: AsyncClient) -> None:
        row = (await client.post("/api/v1/collections", json={"name": "Examples"})).json()
        endpoint = f"/api/v1/collections/{row['id']}/requests"
        good = {"name": "GET items", "method": "GET", "url": DEMO}
        for changes in (
            {"headers": {"Authorization": "secret"}},
            {"headers": {"X-Api-Key": "secret"}},
            {"headers": {"X_API_KEY": "secret"}},
            {"query": {"access_token": "secret"}},
            {"url": DEMO + "?token=secret"},
        ):
            response = await client.post(endpoint, json={**good, **changes})
            assert response.status_code == 400
            assert "secret" not in response.text
        assert (await client.post(endpoint, json={**good, "body": "private"})).json()[
            "body"
        ] is None
        too_many_bytes = await client.post(
            endpoint, json={**good, "body": "é" * 600000, "persist_body": True}
        )
        assert too_many_bytes.status_code == 422
        exported = (await client.get("/api/v1/export")).json()
        assert exported["version"] == 1
        assert "private" not in str(exported)
        assert "body" not in str(exported)
        assert (await client.post("/api/v1/import", json=exported)).json() == {"imported": 1}
        assert len((await client.get("/api/v1/collections")).json()) == 2
        for bad in (
            {"version": 2, "collections": []},
            {
                "version": 1,
                "collections": [
                    {"name": "Bad", "requests": [{**good, "headers": {"cookie": "secret"}}]}
                ],
            },
            {
                "version": 1,
                "collections": [{"name": "Bad", "requests": [{**good, "body": "secret"}]}],
            },
            {"version": 1, "collections": [], "extra": "danger"},
        ):
            assert (await client.post("/api/v1/import", json=bad)).status_code in (400, 422)
        atomic = {
            "version": 1,
            "collections": [
                {"name": "Would create", "requests": [good]},
                {"name": "Bad", "requests": [{**good, "url": "http://evil.test"}]},
            ],
        }
        assert (await client.post("/api/v1/import", json=atomic)).status_code == 403
        assert (
            await client.post(
                "/api/v1/import",
                content=b"x" * 1200000,
                headers={"content-type": "application/json"},
            )
        ).status_code == 413
        assert len((await client.get("/api/v1/collections")).json()) == 2

    run(db_path, actions)
    engine = create_sqlite_engine(str(db_path))
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Collection)) == 2
    engine.dispose()


def test_export_redacts_headers_even_for_legacy_rows(db_path: Path) -> None:
    engine = create_sqlite_engine(str(db_path))
    with Session(engine) as db:
        collection = Collection(name="Legacy")
        collection.saved_requests.append(
            SavedRequest(
                name="Old",
                method="GET",
                url=DEMO,
                query_json={},
                headers_json_redacted={
                    "Authorization": "private",
                    "x-api-key": "secret",
                    "Accept": "application/json",
                },
                body_template="never export",
            )
        )
        db.add(collection)
        db.commit()
    engine.dispose()

    async def export(client: AsyncClient) -> None:
        response = await client.get("/api/v1/export")
        assert response.status_code == 200
        assert response.json()["collections"][0]["requests"][0]["headers"] == {
            "Accept": "application/json"
        }
        assert "private" not in response.text
        assert "never export" not in response.text

    run(db_path, export)
