# Phase 4: dashboard metrics

`GET /api/v1/stats/summary` reads the local `request_history` table. It reports
totals for 2xx success, 4xx client errors, 5xx server errors, HTTP responses
outside those ranges, and attempts with no HTTP status (network failures).
These categories are mutually exclusive and sum to `total_requests`.

Latency uses recorded `duration_ms` values, including failures with measured
durations but excluding rows with a missing duration. Median averages the two
central values for an even-sized sample; p95 is the nearest-rank value at
`ceil(0.95 * n)`. Both are `null` when no duration is available. The API returns
all active UTC days in chronological order, plus the five most recent attempts;
the UI renders at most the last 14 active days and converts recent timestamps to
local time. Missing days are not inferred as zero-volume observations.

History and metrics contain metadata only. The dashboard displays sanitized URLs
as text (never HTML), and does not fetch or render request/response bodies. On a
new database, it shows an empty state rather than synthetic sample data. Schema
migration must be run before calling the summary endpoint.
