# TraceLens — AI Implementation Reference

Version: 1.0 | Status: Proposed | License: MIT | Audience: AI coding agents and maintainers

## 1. Mission
Build a local-first HTTP API debugging workspace. Users compose HTTP requests to endpoints they own or are authorized to test, inspect responses, save requests into collections, and review local request history and performance summaries. The product must run without accounts, cloud services, or telemetry.

### Portfolio outcome
A demonstrable, documented, tested full-stack developer tool with reproducible local setup, attractive UI, meaningful error handling, and a short walkthrough video.

## 2. Product boundaries
### MVP (required)
1. Send manually initiated GET, POST, PUT, PATCH, DELETE requests to explicitly allowed destinations.
2. Configure URL, query parameters, request headers, and JSON or plain-text body.
3. Show response status, duration, response headers, and safely rendered text/JSON body.
4. Save, rename, delete, and organize requests into collections.
5. Store local history with timestamp, method, destination, status, duration, and error summary.
6. Dashboard: request count, status distribution, median and p95 latency, recent requests.
7. Export/import collections as versioned JSON with schema validation.
8. Ship a seeded local demo API, examples, automated tests, Docker Compose, and README.

### Explicitly excluded from MVP
Traffic interception, browser MITM, system-wide packet capture, credential harvesting, automatic endpoint discovery, fuzzing, scanning, scheduled high-volume traffic, collaboration, hosted accounts, and arbitrary remote proxying. Do not silently add excluded features.

## 3. Users and jobs
Primary: developer troubleshooting a service they control. Secondary: student learning HTTP request/response semantics. Main flow: create request -> validate -> send -> inspect -> save -> compare with history.

## 4. Technical stack
- Frontend: React + TypeScript + Vite + Tailwind CSS; TanStack Query for server state; React Router optional.
- Backend: Python 3.12+ with FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, httpx.
- Database: SQLite with migrations, stored under configurable local data directory.
- Tests: pytest + pytest-asyncio + httpx ASGI transport, Vitest + React Testing Library, Playwright smoke tests.
- Tooling: Ruff, mypy (incremental), ESLint, Prettier, GitHub Actions, Docker Compose.
- Keep versions pinned via lockfiles. Avoid unnecessary frameworks.

## 5. System architecture
Browser UI -> FastAPI REST API -> request service -> guarded HTTP client -> explicitly approved demo/local API. FastAPI -> SQLAlchemy -> SQLite for collections and history. No inbound capture or transparent proxy. All outgoing requests originate only from explicit user action.

### Repository layout
```
tracelens/
  apps/
    web/src/{components,pages,features,lib,types}/
    api/app/{api,core,models,schemas,services,db}/
    api/tests/
  demo-api/
  docs/{architecture,security,decisions}/
  .github/workflows/
  compose.yaml
  .env.example
  README.md
  LICENSE
```

## 6. Functional specifications
### Request builder
Method selector, URL input, editable key/value rows for query and headers, body editor (JSON/text), Send button, Save button, loading state, validation feedback. Preserve editor state on failed requests. Disable Send while in flight. No automatic retries.

### Response inspector
Display status, duration in ms, content type, headers, pretty-printed JSON when valid, otherwise escaped text. Never inject returned HTML into the DOM. Cap stored/rendered body at 1 MiB; indicate truncation. Binary responses show metadata only. Timeouts and DNS/connect failures appear as structured errors, not blank screens.

### Collections
Create collection, rename, delete with confirmation; save request template, edit, duplicate, delete. Do not persist secrets in templates by default. Import must reject unknown schema versions, oversized files, malformed data, and dangerous fields; export must redact sensitive header values.

### History
Save metadata for every attempt, including failures. Show searchable/sortable list; allow viewing response summary; provide Clear History with confirmation. Store request/response bodies only when explicitly enabled; default OFF.

### Dashboard
Cards: total requests, successful requests (2xx), client/server errors (4xx/5xx), median duration, p95 duration. Chart: counts by day, status distribution. Explain that network failures have no HTTP status and are counted separately. Empty state must be useful.

## 7. API contract (initial)
All endpoints under `/api/v1` and return JSON. Use consistent `{code,message,details}` error shape.

| Method | Route | Purpose |
|---|---|---|
| POST | /requests/send | Execute one explicitly authorized request |
| GET | /history | Paginated history with filters |
| DELETE | /history | Clear history |
| GET | /collections | List collections |
| POST | /collections | Create collection |
| PATCH | /collections/{id} | Rename collection |
| DELETE | /collections/{id} | Delete collection |
| POST | /collections/{id}/requests | Save template |
| PATCH | /saved-requests/{id} | Update template |
| DELETE | /saved-requests/{id} | Delete template |
| GET | /stats/summary | Aggregate metrics |
| GET | /export | Export sanitized collections |
| POST | /import | Validate and import collections |
| GET | /health | Health status |

Example send request:
```json
{"method":"GET","url":"http://demo-api:8001/items","headers":{},"query":{},"body":null}
```
Example result:
```json
{"status":200,"duration_ms":42,"headers":{"content-type":"application/json"},"body":"[]","truncated":false,"error":null}
```
Network failures return a documented non-2xx API error with `code`, `message`, and `details`, and are also recorded in history.

## 8. Data model
- `collections`: id UUID, name, created_at, updated_at.
- `saved_requests`: id UUID, collection_id FK, name, method, url, query_json, headers_json_redacted, body_template, created_at, updated_at.
- `request_history`: id UUID, method, sanitized_url, status nullable, duration_ms nullable, error_code nullable, requested_at, response_size_bytes nullable, truncated boolean.
Indexes: history(requested_at), history(status), saved_requests(collection_id). Foreign keys enabled; delete behavior documented. Use UTC in storage and local display.

## 9. Security requirements (mandatory)
**This is a local developer tool, not an open proxy.**
- Backend binds `127.0.0.1` by default; Docker published ports bind localhost. No public deployment by default.
- MVP outbound destinations must be explicitly allowlisted in configuration. Default allowlist: bundled demo API only. Optional user-configured additional localhost endpoints; document risks.
- Block redirects by default; if supported later, validate each hop against the same allowlist.
- Prevent SSRF by validating parsed scheme, host, port and resolved addresses immediately before connection; guard against DNS rebinding and address-family changes. Prefer a transport that pins connection to validated addresses; do not claim DNS-only checks are sufficient.
- Only `http` and `https` schemes. Deny URL userinfo, unsupported ports, and ambiguous/obfuscated hosts. Set connection/read timeouts, response size limits, and concurrency limits.
- Strip or redact Authorization, Cookie, Set-Cookie, API keys, and configurable sensitive headers from logs, history, export, and screenshots.
- Never execute returned scripts or render untrusted HTML. Sanitize errors; no stack traces in client responses.
- Limit CORS to the local frontend origin. No wildcard origins. Validate request sizes and imports. No analytics/telemetry.
- If strict destination binding cannot be implemented safely, limit execution to the bundled demo API until it can.

## 10. UX and visual design
Desktop-first responsive interface. Sidebar: Dashboard, Workspace, Collections, History, Settings. Workspace split view: request builder left/top, response inspector right/bottom. Monospace code panels, restrained neutral palette, accessible contrast, keyboard navigation, meaningful loading/error/empty states. Do not copy branding or interface assets from commercial tools.

## 11. Delivery phases and exit gates
**Phase 0 — Scaffold:** monorepo, dependency lockfiles, lint/format/test scripts, `.env.example`, compose, CI. Gate: fresh clone starts reliably.

**Phase 1 — Backend core:** models, migrations, schemas, allowlisted HTTP service, error mapping, unit/integration tests. Gate: demo request succeeds; blocked destination and redirect tests pass.

**Phase 2 — Request workspace:** builder, response inspector, loading/error states. Gate: user can send GET and POST to bundled demo API and inspect responses.

**Phase 3 — Persistence:** collections, saved requests, history, import/export. Gate: data survives restart; malformed import rejected; secrets redacted.

**Phase 4 — Dashboard:** summary queries, charts, empty states. Gate: metrics match seeded test fixtures, including network failures.

**Phase 5 — Polish and ship:** accessibility, E2E, security tests, README, screenshots, walkthrough, release tag. Gate: CI green and complete manual acceptance checklist.

## 12. Definition of done
- `docker compose up --build` launches web, API, demo API locally with documented URLs.
- Clean database migrates successfully and seeded demo requests work.
- Tests cover URL validation, blocked destinations, redirects, timeouts, response limits, secret redaction, CRUD, import/export, stats.
- Frontend keyboard-operable; no raw HTML injection; responsive at laptop and mobile widths.
- CI runs formatting, lint, backend tests, frontend tests, and build.
- No production secrets, external telemetry, or unapproved network calls.
- README contains setup, screenshots, architecture diagram, feature list, limitations, and demo instructions.

## 13. Portfolio presentation
README headline: “TraceLens — Local-first API debugging and observability workspace.” Include 30–60 second demo showing request creation, response inspection, collection save, history, and dashboard. Add an architecture diagram and explain engineering tradeoffs: why localhost-only, allowlist security, SQLite, response caps, and explicit non-goals. Document what AI generated and what was manually reviewed and tested. Publish source with MIT license only if all dependencies and assets permit.

## 14. Backlog (after MVP only)
- Request environment variables with local-only encrypted secret handling.
- Side-by-side response diff.
- cURL import/export with credential redaction.
- OpenAPI import and request generation.
- Lightweight assertions for API regression testing.
- HAR import for *offline analysis only*, without interception.
Prioritize based on demonstrated user value, not feature count.

## 15. AI coding-agent operating instructions
You are implementing TraceLens according to this document. Treat the security requirements and MVP exclusions as hard constraints. Never add scanning, interception, or general-purpose proxy behavior. Implement one phase at a time. Before writing code, summarize the intended files, architecture decisions, and acceptance tests. Prefer simple, maintainable solutions over novelty. Use type hints and typed interfaces; no placeholder functionality, fake tests, or silent exception swallowing. Write tests alongside features. Run relevant checks after each phase and report exact commands, results, unresolved issues, and manual verification steps. Never assert that tests passed without running them. Ask before changing scope or making security tradeoffs. Commit logical increments with descriptive messages. If the environment lacks required tools, state what could not be verified.

### First prompt to paste into OpenCode
> Read `TraceLens_Project_Specification.md` as the source of truth. Implement Phase 0 only. First produce a concise plan and file tree. Then scaffold the project, configure formatting/linting/testing/CI, create the local-only Docker Compose setup and demo API, and write reproducible setup instructions. Run available checks, report results, and stop. Do not begin Phase 1 until I approve.

### Phase transition prompt
> Continue with Phase [N] from the specification. First identify dependencies, security implications, tests, and exit gate. Implement only this phase, run checks, and report evidence of completion. Stop before the next phase.

## 16. Risks and decisions
- **SSRF risk:** outbound HTTP execution is dangerous if unrestricted; default to demo-only allowlist.
- **Scope creep:** avoid packet capture, authentication, team features, and advanced test runners until MVP is complete.
- **Data leakage:** store minimal metadata and redact sensitive values; verify exports.
- **UI complexity:** prioritize one polished workspace over many unfinished views.
- **Metrics accuracy:** document duration measurement and p95 algorithm; exclude missing durations from latency aggregates.

## 17. Suggested evaluation rubric
Correctness 30%; security 25%; test quality 20%; UX 15%; documentation/reproducibility 10%. Do not claim production readiness solely from a polished demo.
