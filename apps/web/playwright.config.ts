import { mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E never uses the developer's database, even if one is running locally.
const dataDir = mkdtempSync("/tmp/opencode/tracelens-e2e-");
const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.TRACELENS_RECORD_WALKTHROUGH
    ? []
    : ["**/walkthrough.spec.ts"],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "uv run --frozen uvicorn --app-dir demo-api main:app --host 127.0.0.1 --port 8001 --no-access-log",
      cwd: root,
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        "uv run --frozen alembic -c apps/api/alembic.ini upgrade head && uv run --frozen uvicorn --app-dir apps/api app.main:app --host 127.0.0.1 --port 8000 --no-access-log",
      cwd: root,
      env: { TRACELENS_DATA_DIR: dataDir },
      url: "http://127.0.0.1:8000/api/v1/health",
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://127.0.0.1:5173/",
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
