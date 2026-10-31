# TraceLens — Local-first API debugging and observability workspace

**Phase 0 scaffold only.** The web page is a placeholder; request sending, SQLite,
collections, history, dashboard and API security enforcement are **not implemented**.
See [the specification](TraceLens_Project_Specification.md) for the roadmap.

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

## Local development and checks

Prerequisites: Python 3.12–3.14, [uv 0.13.6](https://docs.astral.sh/uv/),
Node.js 22+ and npm. In the repository root:

```sh
make install                # uv sync --frozen; npm ci
make check                  # Python + frontend formatting, lint, typecheck, tests, build
make format                 # format Python and frontend sources
```

To run services without Docker, use separate terminals from the repository root:

```sh
uv run --frozen uvicorn --app-dir apps/api app.main:app --host 127.0.0.1 --port 8000
uv run --frozen uvicorn --app-dir demo-api main:app --host 127.0.0.1 --port 8001
cd apps/web && npm run dev
```

The UI does not make API calls in Phase 0. No external APIs, accounts, telemetry
or credentials are required. `.env` and `data/` are ignored by Git. The data
directory is reserved for a later phase; there are no migrations to run yet.

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/web/` | React, TypeScript, Vite, Tailwind placeholder + Vitest |
| `apps/api/` | FastAPI health service + pytest/ASGI test |
| `demo-api/` | Stateless sample GET/POST API + tests |
| `docs/` | Architecture, security boundary and Phase 0 decisions |
| `compose.yaml` | Local-only 3-service stack |
| `.github/workflows/ci.yml` | Locked install, checks, Compose smoke test |

Further architecture and security notes: [architecture](docs/architecture/phase-0.md),
[security](docs/security/phase-0.md), [decisions](docs/decisions/phase-0.md).
Phase 1 will add the guarded outbound client, models and migrations; do not use
this scaffold as a general-purpose proxy or a public service.
