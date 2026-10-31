# Phase 1 backend core

```text
User-issued POST /api/v1/requests/send
    -> bounded JSON parse / Pydantic schema
    -> exact demo origin + safe header checks
    -> fresh DNS lookup + IPv4 address validation
    -> httpx connection to literal IP, original Host header, no redirects/proxies
    -> streamed response capped at 1 MiB, safe JSON result / structured error

SQLite: Alembic 0001 creates collections, saved_requests and request_history.
        Their data endpoints and writes begin in Phase 3.
```

All outbound execution happens in the API process and only for an explicit
`/requests/send` call. No outbound execution is triggered by the browser placeholder,
database migrations, startup or periodic jobs. Compose migrates before starting the
API; local development runs `alembic -c apps/api/alembic.ini upgrade head` manually.
Collection deletes cascade to saved requests via SQLite foreign keys. History has
no foreign key to collections. Timestamps are written in UTC; SQLite does not
retain timezone metadata, so later readers must interpret stored values as UTC.
