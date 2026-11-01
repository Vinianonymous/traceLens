import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "../../lib/api";

type DayCount = { date: string; count: number };
type RecentRequest = {
  id: string;
  method: string;
  sanitized_url: string;
  status: number | null;
  duration_ms: number | null;
  error_code: string | null;
  requested_at: string;
};
export type StatsSummary = {
  total_requests: number;
  successful_requests: number;
  client_errors: number;
  server_errors: number;
  network_failures: number;
  other_responses: number;
  median_duration_ms: number | null;
  p95_duration_ms: number | null;
  counts_by_day: DayCount[];
  recent_requests: RecentRequest[];
};

async function loadSummary(): Promise<StatsSummary> {
  const response = await fetch(`${API_BASE_URL}/api/v1/stats/summary`, {
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error("Unable to load dashboard metrics from the local API.");
  const data: unknown = await response.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("total_requests" in data) ||
    typeof data.total_requests !== "number" ||
    !("counts_by_day" in data) ||
    !Array.isArray(data.counts_by_day) ||
    !("recent_requests" in data) ||
    !Array.isArray(data.recent_requests)
  ) {
    throw new Error("The local API returned invalid dashboard data.");
  }
  return data as StatsSummary;
}

function duration(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}

const statusGroups = [
  { key: "successful_requests", label: "2xx success", color: "bg-emerald-400" },
  { key: "client_errors", label: "4xx client error", color: "bg-amber-400" },
  { key: "server_errors", label: "5xx server error", color: "bg-rose-400" },
  { key: "other_responses", label: "Other HTTP", color: "bg-sky-400" },
  { key: "network_failures", label: "No HTTP response", color: "bg-slate-400" },
] as const;

function Charts({ stats }: { stats: StatsSummary }) {
  const visibleDays = stats.counts_by_day.slice(-14);
  const maxDay = Math.max(1, ...visibleDays.map((day) => day.count));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section
        className="rounded-xl border border-slate-700 bg-slate-800 p-5"
        aria-labelledby="days-title"
      >
        <h2 id="days-title" className="text-lg font-semibold">
          Requests by day (UTC)
        </h2>
        <div
          className="mt-5 space-y-3"
          role="list"
          aria-label="Daily request counts"
        >
          {visibleDays.map((day) => (
            <div
              key={day.date}
              role="listitem"
              className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm"
            >
              <time dateTime={day.date}>{day.date}</time>
              <div className="h-3 rounded-full bg-slate-700" aria-hidden="true">
                <div
                  className="h-3 rounded-full bg-teal-400"
                  style={{ width: `${(day.count / maxDay) * 100}%` }}
                />
              </div>
              <span className="text-right">{day.count}</span>
            </div>
          ))}
        </div>
      </section>
      <section
        className="rounded-xl border border-slate-700 bg-slate-800 p-5"
        aria-labelledby="status-title"
      >
        <h2 id="status-title" className="text-lg font-semibold">
          Status distribution
        </h2>
        <div className="mt-5 space-y-3" role="list" aria-label="Status counts">
          {statusGroups.map(({ key, label, color }) => (
            <div
              key={key}
              role="listitem"
              className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm"
            >
              <span>{label}</span>
              <div className="h-3 rounded-full bg-slate-700" aria-hidden="true">
                <div
                  className={`h-3 rounded-full ${color}`}
                  style={{
                    width: `${(stats[key] / stats.total_requests) * 100}%`,
                  }}
                />
              </div>
              <span className="text-right">{stats[key]}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-300">
          Network failures have no HTTP status and are counted separately.
        </p>
      </section>
    </div>
  );
}

export default function Dashboard() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["stats", "summary"],
    queryFn: loadSummary,
    retry: false,
  });
  if (isPending)
    return (
      <p role="status" className="p-6">
        Loading dashboard…
      </p>
    );
  if (isError)
    return (
      <div role="alert" className="rounded-xl border border-rose-400 p-6">
        <p>Dashboard unavailable. Check that the local API is running.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded bg-teal-400 px-4 py-2 text-slate-950"
        >
          Retry
        </button>
      </div>
    );

  const cards = [
    ["Total requests", data.total_requests],
    ["Successful (2xx)", data.successful_requests],
    ["HTTP errors (4xx/5xx)", data.client_errors + data.server_errors],
    ["Network failures", data.network_failures],
    ["Median duration", duration(data.median_duration_ms)],
    ["P95 duration", duration(data.p95_duration_ms)],
  ] as const;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-slate-300">Local request history overview</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-700 bg-slate-800 p-5"
          >
            <p className="text-sm text-slate-300">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {data.total_requests === 0 ? (
        <section className="rounded-xl border border-slate-700 bg-slate-800 p-8">
          <h2 className="text-xl font-semibold">No request history yet</h2>
          <p className="mt-3 text-slate-300">
            Send a request from Request studio to start filling your local
            history. Only sanitized metadata is retained.
          </p>
        </section>
      ) : (
        <>
          <Charts stats={data} />
          <section
            className="rounded-xl border border-slate-700 bg-slate-800 p-5"
            aria-labelledby="recent-title"
          >
            <h2 id="recent-title" className="text-lg font-semibold">
              Recent requests
            </h2>
            <ul className="mt-4 divide-y divide-slate-700">
              {data.recent_requests.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
                >
                  <time dateTime={item.requested_at} className="text-slate-300">
                    {new Date(item.requested_at).toLocaleString()}
                  </time>
                  <strong>{item.method}</strong>
                  <span className="min-w-0 flex-1 break-all font-mono">
                    {item.sanitized_url}
                  </span>
                  <span>
                    {item.status ?? item.error_code ?? "No HTTP response"}
                  </span>
                  <span>{duration(item.duration_ms)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
