"""SQLite factory with foreign-key enforcement for every connection."""

from pathlib import Path

from sqlalchemy import Engine, create_engine, event


def create_sqlite_engine(data_dir: str) -> Engine:
    path = Path(data_dir)
    path.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path.resolve() / 'tracelens.sqlite3'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection: object, connection_record: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine
