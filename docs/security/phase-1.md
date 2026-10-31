# Phase 1: demo-only outbound execution

Only `http://demo-api:8001` (Compose) or `http://127.0.0.1:8001` (local development)
is configurable as the exact demo origin. Configuration rejects other origins;
requests must match the configured scheme, authority and port exactly. No
userinfo, fragments, obfuscated hosts, credentials in headers, redirects or
environment proxy settings. The service resolves before each send and pins the
httpx connection to an accepted IPv4 address, with the original `Host` header.
Docker DNS must resolve to RFC1918 space and the local demo origin must resolve
exactly to 127.0.0.1. DNS changes between validation and connection cannot move
the connection to a different address. The demo API and Docker networking remain
trusted components; do not repurpose `demo-api` to point at unrelated services.

Requests have a 1 MiB body cap and a 1 MiB response body cap (plus 64 KiB JSON
envelope allowance on input). The response is streamed, truncated and marked when
the cap is exceeded. Binary or compressed data returns headers/status but no body;
HTML is returned as inert text, never rendered as markup. Concurrency is 8 with a
1-second queue timeout, 2-second connect/DNS timeout, 5-second read timeout and
10-second HTTP execution timeout (after resolution). Sensitive response headers are excluded from
the result. CORS accepts only the local web origin. Docker publishes localhost
ports only. Access logs are disabled on both services so URL query values cannot
be logged by Uvicorn. No request/response bodies, query strings, or headers are persisted.

History **is not recorded in Phase 1**, including network errors; persistence and
its redaction tests are Phase 3. Do not rely on this phase for audit trails. Any
future expansion beyond the demo destination requires a separate security design
and review; a DNS check without pinned connection is insufficient.
