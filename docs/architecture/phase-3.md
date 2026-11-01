# Phase 3 — Local persistence

The existing Alembic `0001` migration supplies collections, saved requests, and request-history tables. The API uses SQLite at `TRACELENS_DATA_DIR/tracelens.sqlite3`; Compose applies migrations on startup. Collections and their templates are deleted together via foreign-key cascade. All IDs are server-generated UUIDs.

## Endpoints and browser flow

- `GET/POST /api/v1/collections`, `PATCH/DELETE /api/v1/collections/{id}`: list, create, rename, and delete. The list includes saved templates.
- `POST /api/v1/collections/{id}/requests`, `PATCH/DELETE /api/v1/saved-requests/{id}`: create, edit, and delete templates. The UI supports opening templates in the builder and duplicating them without a body.
- `GET /api/v1/history?page=1&page_size=25&search=&method=&status=&sort=newest` and `DELETE /api/v1/history`: searchable/sortable/paginated metadata and clear with confirmation in the UI. Sort also accepts `oldest`, `duration_asc`, `duration_desc`.
- `GET /api/v1/export` and `POST /api/v1/import`: `{ "version": 1, "collections": [{ "name": "Examples", "requests": [{ "name": "Items", "method": "GET", "url": "http://demo-api:8001/items", "query": {}, "headers": {} }] }] }`. JSON import has a 1 MiB + 64 KiB envelope cap, forbids unknown fields and versions, validates *all* templates before writing in one transaction, and creates new IDs. Export excludes bodies and history. The same demo origin configured for the API must appear in imported URLs.

The request builder's Save button opens collection selection; Save does **not** send. Saved templates loaded in the builder do **not** send until the user presses Send. Import/export requires explicit user action; no background synchronization or telemetry.

## Data and privacy boundaries

- The backend logs every **schema-valid, manually initiated send attempt**, including blocked destinations, redirects, timeouts, and connection errors. Invalid JSON and schema-invalid requests are rejected before the method/URL can be trusted and are not recorded. No request/response bodies, headers, query strings, URL paths, or credentials are stored in history. The destination is the configured demo origin, or `[blocked destination]`. For a text response, `response_size_bytes` reflects the returned (possibly truncated) UTF-8 body; for binary responses it is unknown (`null`).
- Saved URLs must use the configured demo origin, with no embedded query or fragment. Query names associated with credentials and all sensitive/connection-control headers are rejected. Body text is only persisted with explicit `persist_body: true`; the browser defaults to leaving it out. Exports never contain body text, even if saved locally. Users should inspect custom query values, header values, paths, and explicitly opted-in bodies for secrets before saving; arbitrary values cannot be automatically classified as safe.
- The API never executes imported templates. It retains the Phase 1 demo-only outbound restriction, redirect block, DNS pinning, response cap, and same-origin CORS. The browser renders imported strings as React text, not HTML.

## Checks

Use `make check`. Backend integration tests cover migrations/restart, CRUD, pagination/filters, failed attempts, import atomicity, version/size rejection, and secret-header rejection. Frontend tests cover manual Save without sending and confirmation before history deletion. For manual acceptance: start Compose, send GET and POST to `/items`, save a template, reload the page, inspect History and Collections, export/import a JSON file, and confirm the content remains after restarting the stack.
