"""Input limits and explicit response shapes."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_BODY = 1024 * 1024


class SendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    url: str = Field(min_length=1, max_length=4096)
    headers: dict[str, str] = Field(default_factory=dict, max_length=64)
    query: dict[str, str] = Field(default_factory=dict, max_length=64)
    body: str | None = None


class SendResult(BaseModel):
    status: int
    duration_ms: int
    headers: dict[str, str]
    body: str | None
    truncated: bool
    error: None = None


class ApiError(BaseModel):
    code: str
    message: str
    details: dict[str, str] = Field(default_factory=dict)
