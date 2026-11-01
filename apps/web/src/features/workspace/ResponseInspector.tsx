import { useRef, useState, type KeyboardEvent } from "react";
import { SendError } from "../../lib/api";
import type { SendResult } from "../../types/api";

type InspectorProps = {
  state: "idle" | "loading" | "success" | "error";
  result: SendResult | null;
  error: SendError | null;
};

function displayBody(body: string): { text: string; clipped: boolean } {
  let text = body;
  try {
    text = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    // Non-JSON is rendered as plain escaped text by React.
  }
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= 1024 * 1024) return { text, clipped: false };
  return {
    text: new TextDecoder().decode(bytes.slice(0, 1024 * 1024)),
    clipped: true,
  };
}

export default function ResponseInspector({
  state,
  result,
  error,
}: InspectorProps) {
  const [tab, setTab] = useState<"body" | "headers">("body");
  const bodyTab = useRef<HTMLButtonElement>(null);
  const headersTab = useRef<HTMLButtonElement>(null);
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "ArrowLeft" || event.key === "Home" ? "body" : "headers";
    setTab(next);
    (next === "body" ? bodyTab : headersTab).current?.focus();
  }
  const statusTone =
    result && result.status >= 200 && result.status < 300
      ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/25"
      : "text-amber-200 bg-amber-400/10 border-amber-400/25";
  const body =
    result?.body === null || result?.body === undefined
      ? null
      : displayBody(result.body);
  const clipped = result?.truncated || body?.clipped;
  const headers = Object.entries(result?.headers ?? {}).filter(
    ([key]) =>
      ![
        "authorization",
        "cookie",
        "set-cookie",
        "proxy-authorization",
        "x-api-key",
      ].includes(key.toLowerCase()) && !key.toLowerCase().includes("api-key"),
  );
  const contentType = result?.headers["content-type"] ?? "Not provided";

  return (
    <section
      aria-labelledby="inspector-title"
      className="panel flex min-h-[32rem] min-w-0 flex-col"
    >
      <div className="panel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">02 / Inspect</p>
          <h2
            id="inspector-title"
            className="mt-1 text-lg font-semibold text-slate-100"
          >
            Response inspector
          </h2>
        </div>
        <span className="badge">Read-only output</span>
      </div>

      {state === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
          <div
            aria-hidden="true"
            className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-teal-400/20 bg-teal-400/5 font-mono text-2xl text-teal-300"
          >
            ↗
          </div>
          <h3 className="text-lg font-semibold text-slate-200">
            Ready when you are
          </h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
            Choose an example or compose a request, then press Send. Responses
            appear here.
          </p>
        </div>
      )}
      {state === "loading" && (
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center"
        >
          <span
            aria-hidden="true"
            className="mb-5 size-9 animate-spin rounded-full border-2 border-slate-700 border-t-teal-300"
          />
          <h3 className="font-medium text-slate-200">
            Waiting for the demo API…
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            One request in flight. No retries.
          </p>
        </div>
      )}
      {state === "error" && error && (
        <div
          role="alert"
          className="m-5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 sm:m-6"
        >
          <p className="font-mono text-xs font-semibold tracking-widest text-rose-300">
            {error.code}
          </p>
          <h3 className="mt-3 text-lg font-semibold text-slate-100">
            Request could not be completed
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {error.message}
          </p>
          <p className="mt-5 text-xs text-slate-400">
            Your request is still in the editor. Check the local API and try
            again.
          </p>
        </div>
      )}
      {state === "success" && result && (
        <div className="flex flex-1 flex-col">
          <div className="grid gap-3 border-b border-slate-800 p-5 sm:grid-cols-3 sm:p-6">
            <div className="metric-card">
              <span className="metric-label">HTTP status</span>
              <span
                className={`mt-2 inline-flex w-fit rounded-md border px-2 py-1 font-mono text-lg font-semibold ${statusTone}`}
              >
                {result.status}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Duration</span>
              <span className="mt-2 font-mono text-xl text-slate-100">
                {result.duration_ms}{" "}
                <small className="text-sm text-slate-400">ms</small>
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Content type</span>
              <span className="mt-2 break-all font-mono text-xs text-slate-200">
                {contentType}
              </span>
            </div>
          </div>
          {clipped && (
            <p
              role="status"
              className="mx-5 mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200 sm:mx-6"
            >
              Response body truncated at the 1 MiB display limit.
            </p>
          )}
          <div
            className="flex gap-5 border-b border-slate-800 px-5 pt-5 sm:px-6"
            role="tablist"
            aria-label="Response details"
          >
            <button
              type="button"
              ref={bodyTab}
              role="tab"
              aria-selected={tab === "body"}
              tabIndex={tab === "body" ? 0 : -1}
              onKeyDown={onTabKeyDown}
              id="response-body-tab"
              aria-controls="response-body-panel"
              onClick={() => setTab("body")}
              className={`tab ${tab === "body" ? "tab-active" : ""}`}
            >
              Body
            </button>
            <button
              type="button"
              ref={headersTab}
              role="tab"
              aria-selected={tab === "headers"}
              tabIndex={tab === "headers" ? 0 : -1}
              onKeyDown={onTabKeyDown}
              id="response-headers-tab"
              aria-controls="response-headers-panel"
              onClick={() => setTab("headers")}
              className={`tab ${tab === "headers" ? "tab-active" : ""}`}
            >
              Headers{" "}
              <span className="text-xs text-slate-500">{headers.length}</span>
            </button>
          </div>
          {tab === "body" ? (
            <div
              id="response-body-panel"
              role="tabpanel"
              aria-labelledby="response-body-tab"
              className="min-w-0 flex-1 p-5 sm:p-6"
            >
              {body ? (
                <pre
                  aria-label="Response body"
                  className="code-panel max-h-[36rem] overflow-auto whitespace-pre-wrap break-words"
                >
                  {body.text}
                </pre>
              ) : (
                <div className="code-panel text-sm text-slate-400">
                  No text body to display. Binary responses show metadata only.
                </div>
              )}
            </div>
          ) : (
            <div
              id="response-headers-panel"
              role="tabpanel"
              aria-labelledby="response-headers-tab"
              className="min-w-0 flex-1 p-5 sm:p-6"
            >
              {headers.length ? (
                <dl className="code-panel divide-y divide-slate-800">
                  {headers.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)]"
                    >
                      <dt className="break-all font-mono text-xs text-teal-300">
                        {key}
                      </dt>
                      <dd className="break-all font-mono text-xs text-slate-200">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-400">
                  No response headers available.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
