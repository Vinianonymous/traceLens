import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type HistoryPage } from "./api";

export default function History() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState("newest");
  const [message, setMessage] = useState("");
  const params = new URLSearchParams({ page: String(page), search, sort });
  if (method) params.set("method", method);
  const { data, error, isPending } = useQuery({
    queryKey: ["history", page, search, sort, method],
    queryFn: () => api<HistoryPage>(`/history?${params}`),
    retry: false,
  });

  async function clear() {
    if (
      !window.confirm("Clear all local request history? This cannot be undone.")
    )
      return;
    try {
      await api("/history", "DELETE");
      setPage(1);
      await client.invalidateQueries({ queryKey: ["history"] });
      await client.invalidateQueries({ queryKey: ["stats", "summary"] });
      setMessage("History cleared.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Cannot clear history.",
      );
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="history-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">TraceLens / History</p>
          <h1 id="history-title" className="mt-2 text-3xl font-semibold">
            Request history
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Metadata only: no request or response bodies, query values, or URL
            paths.
          </p>
        </div>
        <button
          type="button"
          className="example-button"
          onClick={() => void clear()}
        >
          Clear history
        </button>
      </header>
      {message && (
        <p role="status" className="text-sm text-teal-200">
          {message}
        </p>
      )}
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Search history"
            placeholder="Search destination"
            className="field min-w-0 flex-1"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            maxLength={200}
          />
          <select
            aria-label="Filter method"
            className="field"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All methods</option>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Sort history"
            className="field"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="duration_asc">Fastest</option>
            <option value="duration_desc">Slowest</option>
          </select>
        </div>
        {isPending && <p>Loading history…</p>}
        {error && (
          <p role="alert">
            {error instanceof Error ? error.message : "Cannot load history."}
          </p>
        )}
        {data && !data.items.length && (
          <p className="text-sm text-slate-400">
            No requests match yet. Send a demo request in the studio to begin.
          </p>
        )}
        {data && data.items.length > 0 && (
          <ul className="space-y-2">
            {data.items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-700 p-3 text-sm"
              >
                <div>
                  <strong className="mr-2 font-mono text-teal-300">
                    {row.method}
                  </strong>
                  <span className="break-all">{row.sanitized_url}</span>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(row.requested_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <p>{row.status ?? row.error_code ?? "No status"}</p>
                  <p className="mt-1 text-slate-400">
                    {row.duration_ms === null ? "—" : `${row.duration_ms} ms`}
                    {row.truncated ? " · truncated" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > data.page_size && (
          <div className="flex items-center justify-end gap-3 text-sm">
            <button
              type="button"
              className="example-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(data.total / data.page_size)}
            </span>
            <button
              type="button"
              className="example-button"
              disabled={page * data.page_size >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
