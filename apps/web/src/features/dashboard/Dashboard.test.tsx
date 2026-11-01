import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Dashboard, { type StatsSummary } from "./Dashboard";

const empty: StatsSummary = {
  total_requests: 0,
  successful_requests: 0,
  client_errors: 0,
  server_errors: 0,
  network_failures: 0,
  other_responses: 0,
  median_duration_ms: null,
  p95_duration_ms: null,
  counts_by_day: [],
  recent_requests: [],
};

function renderDashboard() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Dashboard />
    </QueryClientProvider>,
  );
}

function mockSummary(summary: StatsSummary) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => summary }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("explains an empty history without displaying misleading zero latency", async () => {
  mockSummary(empty);
  renderDashboard();
  expect(await screen.findByText("No request history yet")).toBeInTheDocument();
  expect(
    screen.getByText(/Send a request from Request studio/),
  ).toBeInTheDocument();
  expect(screen.getByText("P95 duration")).toBeInTheDocument();
  expect(screen.getAllByText("—")).toHaveLength(2);
});

it("renders seeded counts, charts and a status-less network failure", async () => {
  mockSummary({
    ...empty,
    total_requests: 3,
    successful_requests: 1,
    client_errors: 1,
    network_failures: 1,
    median_duration_ms: 15,
    p95_duration_ms: 20,
    counts_by_day: [{ date: "2026-11-01", count: 3 }],
    recent_requests: [
      {
        id: "a",
        method: "GET",
        sanitized_url: "http://127.0.0.1:8001",
        status: null,
        duration_ms: null,
        error_code: "CONNECTION_FAILED",
        requested_at: "2026-11-01T12:00:00Z",
      },
    ],
  });
  renderDashboard();
  expect(await screen.findByText("Recent requests")).toBeInTheDocument();
  expect(screen.getByText("CONNECTION_FAILED")).toBeInTheDocument();
  expect(screen.getByText("No HTTP response")).toBeInTheDocument();
  expect(screen.getByText("P95 duration")).toBeInTheDocument();
  expect(screen.getByText("20 ms")).toBeInTheDocument();
  expect(
    screen.getByRole("list", { name: "Daily request counts" }),
  ).toHaveTextContent("2026-11-01");
});

it("shows a recoverable error when the local API cannot be reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  renderDashboard();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Dashboard unavailable",
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
