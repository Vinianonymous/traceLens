"""UTC metadata schema. No request or response bodies are saved in history."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    saved_requests: Mapped[list["SavedRequest"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan", passive_deletes=True
    )


class SavedRequest(Base):
    __tablename__ = "saved_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    method: Mapped[str] = mapped_column(String(6), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    query_json: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    headers_json_redacted: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    body_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    collection: Mapped[Collection] = relationship(back_populates="saved_requests")

    __table_args__ = (Index("ix_saved_requests_collection_id", "collection_id"),)


class RequestHistory(Base):
    __tablename__ = "request_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    method: Mapped[str] = mapped_column(String(6), nullable=False)
    sanitized_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    response_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("ix_request_history_requested_at", "requested_at"),
        Index("ix_request_history_status", "status"),
    )
