# Phase 0 security boundary

- No outbound request execution exists yet. `TRACELENS_ALLOWED_DESTINATIONS` is a
  reserved configuration value, **not** an implemented safety control. Do not
  deploy or expose this scaffold as an internet-facing service.
- Docker ports are bound to 127.0.0.1. In non-Docker development, server commands
  in the README also bind to 127.0.0.1.
- Demo API has no secrets and stores nothing. Its POST endpoint returns an example
  response without changing the fixture.
- Before adding any request execution in Phase 1, enforce the destination binding,
  allowlist, redirect prohibition, timeouts and response limits in the specification.
