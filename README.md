# TraceLens — Local-first API debugging and observability workspace

**Phase 1 backend core.** The API can send manually initiated requests **only to
the bundled demo API**. The web page is still a placeholder; collections, history
recording, dashboard and the request-builder UI are not implemented yet. See
[the specification](TraceLens_Project_Specification.md) for the roadmap.

## Quick start (Docker)

Prerequisites: Docker Engine with Compose v2 (or Docker Desktop). Clone the project
and run from its root:

```sh
cp .env.example .env    # optional; defaults work without this step
docker compose up --build -d --wait
```

Open the placeholder UI at http://127.0.0.1:5173/ . Check the API at
http://127.0.0.1:8000/api/v1/health and the sample service at
http://127.0.0.1:8001/items . All published ports bind to **127.0.0.1**, not to
the LAN. Change port numbers in `.env` if they are occupied. `docker compose down`
stops the stack; `docker compose logs -f` shows startup errors.

Try the deterministic demo API (POST does not persist data):

```sh
curl http://127.0.0.1:8001/items
curl -X POST http://127.0.0.1:8001/items \
  -H 'Content-Type: application/json' -d '{"name":"Eraser"}'
```

Send through the guarded backend (response JSON includes status, duration, headers,
body and truncation flag):

```sh
curl -X POST http://127.0.0.1:8000/api/v1/requests/send \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","url":"http://demo-api:8001/items","headers":{},"query":{},"body":null}'
```

For non-Docker development use `http://127.0.0.1:8001/items` in the JSON URL.
To exercise rejection, replace `/items` with `/redirect` (502,
`REDIRECT_BLOCKED`) or the URL with `http://example.com` (403,
`DESTINATION_BLOCKED`). Network failures return 502 or 504 with
`{"code":"...","message":"...","details":{}}`. HTTP errors from the demo
service return a normal result with that HTTP status. The API does not retry.

## Local development and checks

Prerequisites: Python 3.12–3.14, [uv 0.13.6](https://docs.astral.sh/uv/),
Node.js 22+ and npm. In the repository root:

```sh
make install                # uv sync --frozen; npm ci
make check                  # Python + frontend formatting, lint, typecheck, tests, build
make format                 # format Python and frontend sources
```

Compose runs `alembic upgrade head` before starting the API. For local development
run it yourself before starting the services:

```sh
uv run --frozen alembic -c apps/api/alembic.ini upgrade head
```

To run services without Docker, use separate terminals from the repository root:

```sh
uv run --frozen uvicorn --app-dir apps/api app.main:app --host 127.0.0.1 --port 8000 --no-access-log
uv run --frozen uvicorn --app-dir demo-api main:app --host 127.0.0.1 --port 8001 --no-access-log
cd apps/web && npm run dev
```

The UI does not make API calls yet. No external APIs, accounts, telemetry or
credentials are required. `.env` and `data/` are ignored by Git. SQLite schema
exists but no request attempts are saved yet; metadata history recording and
collection endpoints belong to Phase 3. Do not assume attempts are audited in
Phase 1. Do not store secrets in requests; credential headers are rejected.

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/web/` | React, TypeScript, Vite, Tailwind placeholder + Vitest |
| `apps/api/` | Guarded FastAPI backend, SQLAlchemy models, Alembic migration and tests |
| `demo-api/` | Stateless sample GET/POST API + tests |
| `docs/` | Architecture, security boundary and Phase 0 decisions |
| `compose.yaml` | Local-only 3-service stack |
| `.github/workflows/ci.yml` | Locked install, checks, Compose smoke test |

Further architecture and security notes: [Phase 1 security](docs/security/phase-1.md),
[architecture](docs/architecture/phase-1.md), [decisions](docs/decisions/phase-0.md).
Do not use this project as a general-purpose proxy or a public service.
