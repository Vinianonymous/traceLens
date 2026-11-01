"""Metrics reflect persisted metadata, including failures without HTTP responses."""

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from app.core.config import Settings
from app.db.session import create_sqlite_engine
from app.main import create_app
from app.models import RequestHistory
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import Session


def get_summary(path: Path) -> dict[str, object]:
    async def run() -> dict[str, object]:
        async with AsyncClient(
            transport=ASGITransport(app=create_app(Settings(data_dir=str(path)))),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/stats/summary")
            assert response.status_code == 200
            return response.json()  # type: ignore[no-any-return]

    return asyncio.run(run())


def migrate(path: Path, monkeypatch: object) -> None:
    monkeypatch.setenv("TRACELENS_DATA_DIR", str(path))  # type: ignore[attr-defined]
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")


def test_empty_summary(tmp_path: Path, monkeypatch) -> None:
    migrate(tmp_path, monkeypatch)
    assert get_summary(tmp_path) == {
        "total_requests": 0,
        "successful_requests": 0,
        "client_errors": 0,
        "server_errors": 0,
        "network_failures": 0,
        "other_responses": 0,
        "median_duration_ms": None,
        "p95_duration_ms": None,
        "counts_by_day": [],
        "recent_requests": [],
    }


def test_seeded_metrics_persist_and_exclude_missing_latency(tmp_path: Path, monkeypatch) -> None:
    migrate(tmp_path, monkeypatch)
    day = datetime(2026, 10, 31, 23, 59, tzinfo=UTC)
    # Six HTTP responses and one network failure; one missing duration.
    fixtures = [
        (200, 10, None, day),
        (201, 20, None, day),
        (404, 30, None, day + timedelta(minutes=2)),
        (500, 40, None, day + timedelta(minutes=3)),
        (302, 50, None, day + timedelta(minutes=4)),
        (None, None, "CONNECTION_FAILED", day + timedelta(minutes=5)),
        (503, 100, None, day + timedelta(minutes=6)),
    ]
    engine = create_sqlite_engine(str(tmp_path))
    with Session(engine) as session:
        session.add_all(
            RequestHistory(
                method="GET",
                sanitized_url="http://127.0.0.1:8001/items",
                status=status,
                duration_ms=duration,
                error_code=error,
                requested_at=when,
                truncated=False,
            )
            for status, duration, error, when in fixtures
        )
        session.commit()
    engine.dispose()

    result = get_summary(tmp_path)
    assert {
        key: result[key]
        for key in (
            "total_requests",
            "successful_requests",
            "client_errors",
            "server_errors",
            "network_failures",
            "other_responses",
            "median_duration_ms",
            "p95_duration_ms",
        )
    } == {
        "total_requests": 7,
        "successful_requests": 2,
        "client_errors": 1,
        "server_errors": 2,
        "network_failures": 1,
        "other_responses": 1,
        "median_duration_ms": 35.0,
        "p95_duration_ms": 100,
    }
    assert result["counts_by_day"] == [
        {"date": "2026-10-31", "count": 2},
        {"date": "2026-11-01", "count": 5},
    ]
    recent = result["recent_requests"]
    assert isinstance(recent, list)
    assert len(recent) == 5
    assert recent[0]["status"] == 503
    assert recent[1]["error_code"] == "CONNECTION_FAILED"
    assert recent[1]["status"] is None
    assert recent[0]["requested_at"] == "2026-11-01T00:05:00Z"
    # A new app/connection reads the same file, with no in-memory state.
    assert get_summary(tmp_path)["total_requests"] == 7


def test_even_median_and_missing_durations(tmp_path: Path, monkeypatch) -> None:
    migrate(tmp_path, monkeypatch)
    engine = create_sqlite_engine(str(tmp_path))
    with Session(engine) as session:
        session.add_all(
            RequestHistory(
                method="POST",
                sanitized_url="http://127.0.0.1:8001/items",
                status=None,
                duration_ms=duration,
                error_code="REQUEST_TIMEOUT",
                truncated=False,
            )
            for duration in (None, 1, 2, 3, 100)
        )
        session.commit()
    engine.dispose()
    result = get_summary(tmp_path)
    assert result["median_duration_ms"] == 2.5
    assert result["p95_duration_ms"] == 100
    assert result["network_failures"] == 5


def test_p95_uses_nearest_rank_not_the_maximum(tmp_path: Path, monkeypatch) -> None:
    migrate(tmp_path, monkeypatch)
    engine = create_sqlite_engine(str(tmp_path))
    with Session(engine) as session:
        session.add_all(
            RequestHistory(
                method="GET",
                sanitized_url="http://127.0.0.1:8001/items",
                status=200,
                duration_ms=duration,
                truncated=False,
            )
            for duration in range(1, 21)
        )
        session.commit()
    engine.dispose()
    result = get_summary(tmp_path)
    assert result["median_duration_ms"] == 10.5
    assert result["p95_duration_ms"] == 19
