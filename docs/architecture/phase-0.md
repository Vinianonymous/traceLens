# Phase 0 architecture

```text
Browser -> static React/Vite build (web :5173)
                [no API calls in Phase 0]
FastAPI health service (api :8000)   Demo FastAPI (demo-api :8001)
```

Compose places services on its internal network, but binds all published ports to
127.0.0.1 on the host. The API has a health endpoint only. Demo data is stateless
and deterministic. There are no collections, history, migrations, outbound
connections or database access in this phase. `data/` is reserved for SQLite in
later phases. The Docker image binds to 0.0.0.0 **inside** the container so the
Compose health check and port forwarding can reach it; host publishing is localhost-only.
