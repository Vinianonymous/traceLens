"""Strict, bounded persistence and interchange formats."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Method = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
MAX_BODY_BYTES = 1024 * 1024


def bounded_body(value: str | None) -> str | None:
    if value is not None and len(value.encode("utf-8")) > MAX_BODY_BYTES:
        raise ValueError("Body exceeds size limit")
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CollectionInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class TemplateInput(CollectionInput):
    method: Method
    url: str = Field(min_length=1, max_length=4096)
    query: dict[str, str] = Field(default_factory=dict, max_length=64)
    headers: dict[str, str] = Field(default_factory=dict, max_length=64)
    body: str | None = Field(default=None, max_length=1048576)
    persist_body: bool = False

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: str | None) -> str | None:
        return bounded_body(value)


class TemplateUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    method: Method | None = None
    url: str | None = Field(default=None, min_length=1, max_length=4096)
    query: dict[str, str] | None = Field(default=None, max_length=64)
    headers: dict[str, str] | None = Field(default=None, max_length=64)
    body: str | None = Field(default=None, max_length=1048576)
    persist_body: bool = False

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: str | None) -> str | None:
        return bounded_body(value)


class TemplateView(StrictModel):
    id: str
    name: str
    method: Method
    url: str
    query: dict[str, str]
    headers: dict[str, str]
    body: str | None
    created_at: datetime
    updated_at: datetime


class CollectionView(StrictModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    requests: list[TemplateView]


class HistoryView(StrictModel):
    id: str
    method: Method
    sanitized_url: str
    status: int | None
    duration_ms: int | None
    error_code: str | None
    requested_at: datetime
    response_size_bytes: int | None
    truncated: bool


class HistoryPage(StrictModel):
    items: list[HistoryView]
    total: int
    page: int
    page_size: int


class ExportTemplate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    method: Method
    url: str = Field(min_length=1, max_length=4096)
    query: dict[str, str] = Field(default_factory=dict, max_length=64)
    headers: dict[str, str] = Field(default_factory=dict, max_length=64)


class ExportCollection(CollectionInput):
    requests: list[ExportTemplate] = Field(default_factory=list, max_length=200)


class ExchangeFile(StrictModel):
    version: Literal[1]
    collections: list[ExportCollection] = Field(max_length=100)
