"""Local SQLite metadata and sanitized collection interchange."""

from datetime import UTC, datetime
from typing import cast
from urllib.parse import urlsplit

from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Collection, RequestHistory, SavedRequest
from app.schemas.persistence import (
    CollectionView,
    ExchangeFile,
    ExportCollection,
    ExportTemplate,
    HistoryPage,
    HistoryView,
    Method,
    TemplateInput,
    TemplateUpdate,
    TemplateView,
)
from app.schemas.requests import SendRequest, SendResult
from app.services.requests import (
    FORBIDDEN_HEADERS,
    HEADER_NAME_CHARS,
    RequestFailure,
    RequestService,
    is_sensitive_header,
)

MAX_QUERY_BYTES = 16384
SENSITIVE_NAMES = ("key", "token", "secret", "password", "session", "auth")


def safe_header_name(key: str, extra: tuple[str, ...] = ()) -> bool:
    return (
        not is_sensitive_header(key, extra)
        and key.lower() not in FORBIDDEN_HEADERS
        and not any(marker in key.lower() for marker in SENSITIVE_NAMES)
    )


def as_utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes even when the column declares timezone=True.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def safe_destination(url: str, demo_origin: str) -> str:
    """Never retain URL paths, query values, userinfo or non-demo destinations in history."""
    try:
        parsed = urlsplit(url)
        if f"{parsed.scheme}://{parsed.netloc}" == demo_origin:
            return demo_origin
    except ValueError:
        pass
    return "[blocked destination]"


def validate_template(
    url: str, query: dict[str, str], headers: dict[str, str], runner: RequestService
) -> None:
    runner._validate_url(url)
    parsed = urlsplit(url)
    if parsed.query or parsed.fragment:
        raise RequestFailure(400, "INVALID_TEMPLATE", "Put query values in query rows")
    if sum(len(k.encode()) + len(v.encode()) for k, v in query.items()) > MAX_QUERY_BYTES:
        raise RequestFailure(413, "REQUEST_TOO_LARGE", "Query exceeds size limit")
    for key, value in query.items():
        if (
            not key
            or len(key) > 200
            or any(
                s in key.lower() for s in ("token", "secret", "password", "key", "auth", "session")
            )
            or any(ord(c) < 32 or ord(c) == 127 for c in key + value)
        ):
            raise RequestFailure(400, "INVALID_TEMPLATE", "Unsupported query parameter")
    if sum(len(k) + len(v) for k, v in headers.items()) > 16384:
        raise RequestFailure(413, "REQUEST_TOO_LARGE", "Headers exceed size limit")
    for key, value in headers.items():
        if (
            not key
            or not key.isascii()
            or any(c not in HEADER_NAME_CHARS for c in key)
            or key.lower() in FORBIDDEN_HEADERS
            or not safe_header_name(key, runner.settings.sensitive_headers)
            or not value.isascii()
            or any(ord(c) < 32 or ord(c) == 127 for c in value)
        ):
            raise RequestFailure(400, "INVALID_TEMPLATE", "Unsupported request header")


def template_view(row: SavedRequest, extra: tuple[str, ...] = ()) -> TemplateView:
    return TemplateView(
        id=row.id,
        name=row.name,
        method=cast(Method, row.method),
        url=row.url,
        query=row.query_json,
        headers={
            key: value
            for key, value in row.headers_json_redacted.items()
            if safe_header_name(key, extra)
        },
        body=row.body_template,
        created_at=as_utc(row.created_at),
        updated_at=as_utc(row.updated_at),
    )


def collection_view(row: Collection, extra: tuple[str, ...] = ()) -> CollectionView:
    return CollectionView(
        id=row.id,
        name=row.name,
        created_at=as_utc(row.created_at),
        updated_at=as_utc(row.updated_at),
        requests=[
            template_view(item, extra)
            for item in sorted(row.saved_requests, key=lambda r: r.created_at)
        ],
    )


class PersistenceStore:
    def __init__(self, engine: Engine, runner: RequestService) -> None:
        self.engine = engine
        self.runner = runner

    def list_collections(self) -> list[CollectionView]:
        with Session(self.engine) as db:
            rows = db.scalars(
                select(Collection)
                .options(selectinload(Collection.saved_requests))
                .order_by(Collection.created_at)
            ).all()
            return [collection_view(row, self.runner.settings.sensitive_headers) for row in rows]

    def create_collection(self, name: str) -> CollectionView:
        with Session(self.engine) as db:
            row = Collection(name=name)
            db.add(row)
            db.commit()
            db.refresh(row)
            return collection_view(row, self.runner.settings.sensitive_headers)

    def rename_collection(self, id: str, name: str) -> CollectionView:
        with Session(self.engine) as db:
            row = db.scalar(
                select(Collection)
                .options(selectinload(Collection.saved_requests))
                .where(Collection.id == id)
            )
            if row is None:
                raise RequestFailure(404, "NOT_FOUND", "Collection not found")
            row.name = name
            db.commit()
            db.refresh(row)
            return collection_view(row, self.runner.settings.sensitive_headers)

    def delete_collection(self, id: str) -> None:
        with Session(self.engine) as db:
            row = db.get(Collection, id)
            if row is None:
                raise RequestFailure(404, "NOT_FOUND", "Collection not found")
            db.delete(row)
            db.commit()

    def save_template(self, collection_id: str, data: TemplateInput) -> TemplateView:
        validate_template(data.url, data.query, data.headers, self.runner)
        with Session(self.engine) as db:
            if db.get(Collection, collection_id) is None:
                raise RequestFailure(404, "NOT_FOUND", "Collection not found")
            row = SavedRequest(
                collection_id=collection_id,
                name=data.name,
                method=data.method,
                url=data.url,
                query_json=data.query,
                headers_json_redacted=data.headers,
                body_template=data.body if data.persist_body else None,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return template_view(row, self.runner.settings.sensitive_headers)

    def update_template(self, id: str, data: TemplateUpdate) -> TemplateView:
        with Session(self.engine) as db:
            row = db.get(SavedRequest, id)
            if row is None:
                raise RequestFailure(404, "NOT_FOUND", "Saved request not found")
            values = data.model_dump(exclude_unset=True, exclude={"persist_body"})
            name = values.get("name", row.name)
            if not isinstance(name, str) or not name.strip():
                raise RequestFailure(400, "INVALID_TEMPLATE", "Name cannot be blank")
            url = values.get("url", row.url)
            query = values.get("query", row.query_json)
            headers = values.get("headers", row.headers_json_redacted)
            method = values.get("method", row.method)
            if (
                not isinstance(url, str)
                or not isinstance(query, dict)
                or not isinstance(headers, dict)
                or method is None
            ):
                raise RequestFailure(400, "INVALID_TEMPLATE", "Invalid saved request")
            validate_template(url, query, headers, self.runner)
            row.name = name.strip()
            row.method = method
            row.url = url
            row.query_json = query
            row.headers_json_redacted = headers
            # Updating a template never silently preserves an old, potentially sensitive body.
            row.body_template = data.body if data.persist_body and "body" in values else None
            db.commit()
            db.refresh(row)
            return template_view(row, self.runner.settings.sensitive_headers)

    def delete_template(self, id: str) -> None:
        with Session(self.engine) as db:
            row = db.get(SavedRequest, id)
            if row is None:
                raise RequestFailure(404, "NOT_FOUND", "Saved request not found")
            db.delete(row)
            db.commit()

    def record(
        self, payload: SendRequest, result: SendResult | None, error: str | None, duration_ms: int
    ) -> None:
        with Session(self.engine) as db:
            db.add(
                RequestHistory(
                    method=payload.method,
                    sanitized_url=safe_destination(payload.url, self.runner.settings.demo_origin),
                    status=result.status if result else None,
                    duration_ms=result.duration_ms if result else duration_ms,
                    error_code=error,
                    response_size_bytes=len(result.body.encode("utf-8"))
                    if result and result.body is not None
                    else None,
                    truncated=result.truncated if result else False,
                )
            )
            db.commit()

    def history(
        self,
        page: int,
        page_size: int,
        search: str | None,
        method: str | None,
        status: int | None,
        sort: str,
    ) -> HistoryPage:
        with Session(self.engine) as db:
            query = select(RequestHistory)
            if search:
                query = query.where(RequestHistory.sanitized_url.contains(search, autoescape=True))
            if method:
                query = query.where(RequestHistory.method == method)
            if status is not None:
                query = query.where(RequestHistory.status == status)
            total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
            column = (
                RequestHistory.duration_ms
                if sort.startswith("duration")
                else RequestHistory.requested_at
            )
            order = column.asc() if sort.endswith("asc") else column.desc()
            rows = db.scalars(
                query.order_by(order, RequestHistory.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
            return HistoryPage(
                items=[
                    HistoryView(
                        id=r.id,
                        method=cast(Method, r.method),
                        sanitized_url=r.sanitized_url,
                        status=r.status,
                        duration_ms=r.duration_ms,
                        error_code=r.error_code,
                        requested_at=as_utc(r.requested_at),
                        response_size_bytes=r.response_size_bytes,
                        truncated=r.truncated,
                    )
                    for r in rows
                ],
                total=total,
                page=page,
                page_size=page_size,
            )

    def clear_history(self) -> None:
        with Session(self.engine) as db:
            db.execute(delete(RequestHistory))
            db.commit()

    def export(self) -> ExchangeFile:
        return ExchangeFile(
            version=1,
            collections=[
                ExportCollection(
                    name=c.name,
                    requests=[
                        ExportTemplate(
                            name=r.name,
                            method=r.method,
                            url=r.url,
                            query=r.query,
                            # Defense in depth for legacy or manually edited rows.
                            headers={
                                k: v
                                for k, v in r.headers.items()
                                if safe_header_name(k, self.runner.settings.sensitive_headers)
                            },
                        )
                        for r in c.requests
                    ],
                )
                for c in self.list_collections()
            ],
        )

    def import_file(self, data: ExchangeFile) -> int:
        # Validate the entire input before any writes. IDs and body fields are not importable.
        for collection in data.collections:
            for item in collection.requests:
                validate_template(item.url, item.query, item.headers, self.runner)
        with Session(self.engine) as db:
            for collection in data.collections:
                row = Collection(name=collection.name)
                db.add(row)
                for item in collection.requests:
                    row.saved_requests.append(
                        SavedRequest(
                            name=item.name,
                            method=item.method,
                            url=item.url,
                            query_json=item.query,
                            headers_json_redacted=item.headers,
                        )
                    )
            db.commit()
        return len(data.collections)
