# Phase 2 request workspace

Browser (127.0.0.1:5173) -> explicit Send -> local API (127.0.0.1:8000)
-> guarded backend -> bundled demo API. The browser never contacts the demo
service directly and never sends on mount, example selection or navigation.
There are no retries. Docker builds the chosen local API port and internal demo
origin into the static web assets. For local Vite development the defaults are
`http://127.0.0.1:8000` (API) and `http://127.0.0.1:8001` (demo origin).

With the three services running, open http://127.0.0.1:5173/ and press **Send
request** to inspect the default GET example. Select **POST /items**, then press
**Send request** to send the prefilled JSON example. Example selection alone
does not send anything. Set `VITE_API_BASE_URL=http://127.0.0.1:<port>` for a
nonstandard local API port outside Docker. The UI only accepts the bundled demo
origin, selected via `VITE_DEMO_ORIGIN` in the Docker build; the backend enforces
that restriction independently.

The browser validates the exact demo origin, query/header rows and JSON body
for feedback. The backend remains the security boundary. The inspector treats
every response body as text (React escapes HTML), pretty-prints valid JSON,
filters sensitive response headers defensively, caps rendered output at 1 MiB,
and marks truncated or binary-only responses. The Save action is disabled until
the persistence UI is implemented.
