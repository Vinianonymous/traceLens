"""Summary response contract for the local dashboard."""

from datetime import datetime

from pydantic import BaseModel


class DailyCount(BaseModel):
    date: str  # UTC YYYY-MM-DD
    count: int


class RecentAttempt(BaseModel):
    id: str
    method: str
    sanitized_url: str
    status: int | None
    duration_ms: int | None
    error_code: str | None
    requested_at: datetime


class StatsSummary(BaseModel):
    total_requests: int
    successful_requests: int
    client_errors: int
    server_errors: int
    network_failures: int
    other_responses: int
    median_duration_ms: float | None
    p95_duration_ms: int | None
    counts_by_day: list[DailyCount]
    recent_requests: list[RecentAttempt]
