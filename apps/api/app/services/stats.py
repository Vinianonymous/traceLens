"""Aggregate history metadata without loading bodies or sensitive request fields."""

import math
from datetime import UTC
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tables import RequestHistory
from app.schemas.stats import DailyCount, RecentAttempt, StatsSummary


def summary(session: Session) -> StatsSummary:
    status = RequestHistory.status
    counts = session.execute(
        select(
            func.count(),
            func.count().filter(status.between(200, 299)),
            func.count().filter(status.between(400, 499)),
            func.count().filter(status.between(500, 599)),
            func.count().filter(status.is_(None)),
            func.count().filter(
                status.is_not(None),
                ~status.between(200, 299),
                ~status.between(400, 499),
                ~status.between(500, 599),
            ),
        ).select_from(RequestHistory)
    ).one()
    durations = cast(
        list[int],
        session.scalars(
            select(RequestHistory.duration_ms)
            .where(RequestHistory.duration_ms.is_not(None))
            .order_by(RequestHistory.duration_ms)
        ).all(),
    )
    # Median interpolates the two central values; p95 uses nearest rank (ceil(.95 * n)).
    n = len(durations)
    median = (durations[(n - 1) // 2] + durations[n // 2]) / 2 if n else None
    p95 = durations[math.ceil(0.95 * n) - 1] if n else None

    # SQLite stores UTC timestamps as naive strings. date() groups in UTC because
    # all writes use UTC; it also keeps the day boundary independent of the browser.
    day = func.date(RequestHistory.requested_at)
    days = cast(
        list[tuple[str, int]],
        session.execute(select(day, func.count()).group_by(day).order_by(day)).all(),
    )
    recent = session.scalars(
        select(RequestHistory)
        .order_by(RequestHistory.requested_at.desc(), RequestHistory.id.desc())
        .limit(5)
    ).all()
    return StatsSummary(
        total_requests=counts[0],
        successful_requests=counts[1],
        client_errors=counts[2],
        server_errors=counts[3],
        network_failures=counts[4],
        other_responses=counts[5],
        median_duration_ms=median,
        p95_duration_ms=p95,
        counts_by_day=[DailyCount(date=date, count=count) for date, count in days],
        recent_requests=[
            RecentAttempt(
                id=row.id,
                method=row.method,
                sanitized_url=row.sanitized_url,
                status=row.status,
                duration_ms=row.duration_ms,
                error_code=row.error_code,
                requested_at=row.requested_at.replace(tzinfo=UTC),
            )
            for row in recent
        ],
    )
