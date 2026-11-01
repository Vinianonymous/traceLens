# Phase 5 release acceptance checklist

Run against a fresh database with demo-only, non-sensitive example data. This is
an **unchecked manual checklist** until a human records the result; automated
tests do not substitute for the Docker and accessibility passes.

- [ ] On a clean checkout, `make install && make check` passes.
- [ ] `cd apps/web && npx playwright install chromium && npm run test:e2e` passes.
- [ ] With Docker daemon running, `docker compose up --build -d --wait` starts all
  three services; open the Docker-hosted UI and send GET and POST from the browser.
- [ ] Confirm Compose binds all published ports to `127.0.0.1` and data survives
  `docker compose down` / `docker compose up` without deleting `data/`.
- [ ] On desktop and a 375px-wide viewport, keyboard-only navigation can send a
  request, switch response tabs, save and reopen a template, import a JSON file,
  and view History and Dashboard. Verify focus visibility and screen-reader names.
- [ ] A blocked destination, redirect, timeout, malformed/oversized import and
  credential-like header show safe errors; no body, query value or secret appears
  in history, export, screenshots, console output or network URLs to other hosts.
- [ ] Review dependencies and screenshot/assets license compatibility with MIT.
- [x] Record a 30–60 second demo-only walkthrough showing GET/POST, inspection,
  collection save, history, and dashboard (`docs/walkthrough.webm`, 33 seconds).
- [ ] Human-review the walkthrough for accidental sensitive data before sharing.
- [ ] Human review security model and accessibility on target platforms; tag a
  release only after all items above are complete and CI is green.

Automated coverage: `apps/web/e2e/smoke.spec.ts`,
`apps/api/tests/test_security.py`, `make check`, and the Compose job in
`.github/workflows/ci.yml`. Docker browser testing and video/release publication
cannot be claimed from the automated checks alone.
