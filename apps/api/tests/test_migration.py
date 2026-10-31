"""A clean SQLite database upgrades and enforces collection cascade rules."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from app.db.session import create_sqlite_engine
from app.models import Collection, SavedRequest
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def test_initial_migration_and_foreign_keys(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TRACELENS_DATA_DIR", str(tmp_path))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    engine = create_sqlite_engine(str(tmp_path))
    with Session(engine) as session:
        collection = Collection(name="Local examples")
        collection.saved_requests.append(
            SavedRequest(name="Demo", method="GET", url="http://127.0.0.1:8001/items")
        )
        session.add(collection)
        session.commit()
        session.delete(collection)
        session.commit()
        assert session.scalar(select(func.count()).select_from(SavedRequest)) == 0
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert (
            connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == "0001"
        )
    engine.dispose()
