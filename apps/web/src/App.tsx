import { useState } from "react";
import RequestBuilder from "./features/workspace/RequestBuilder";
import ResponseInspector from "./features/workspace/ResponseInspector";
import { DEMO_ORIGIN, SendError } from "./lib/api";
import type { SendResult } from "./types/api";

export default function App() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<SendError | null>(null);

  return (
    <div className="min-h-screen bg-[#0b111c] text-slate-100 lg:flex">
      <aside className="border-b border-slate-800 bg-[#101925] lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5 lg:border-b lg:border-slate-800 lg:py-7">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-teal-300 font-mono text-xl font-bold text-slate-950"
          >
            T
          </span>
          <div>
            <p className="text-base font-bold tracking-tight">TraceLens</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Local workspace
            </p>
          </div>
        </div>
        <nav
          aria-label="Main navigation"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3 lg:py-7"
        >
          <span className="hidden px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:block">
            Workspace
          </span>
          <span
            aria-current="page"
            className="flex shrink-0 items-center gap-3 rounded-lg border border-teal-300/15 bg-teal-300/10 px-3 py-2 text-sm font-semibold text-teal-200 lg:w-full"
          >
            <span aria-hidden="true" className="font-mono">
              ⌘
            </span>{" "}
            Request studio
          </span>
          {(["Dashboard", "Collections", "History", "Settings"] as const).map(
            (item) => (
              <span
                key={item}
                aria-disabled="true"
                title={`${item} is not available yet`}
                className="flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 lg:w-full"
              >
                <span>{item}</span>
                <span className="hidden text-[10px] uppercase tracking-wider lg:inline">
                  Soon
                </span>
              </span>
            ),
          )}
        </nav>
        <div className="mt-auto hidden border-t border-slate-800 p-5 lg:block">
          <p className="font-mono text-xs text-teal-300">● Demo-only mode</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            No accounts, cloud sync, or background traffic.
          </p>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[1550px] min-w-0 px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">TraceLens / Request studio</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Build. Send. Understand.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              A focused space to explore the bundled demo API. Every request
              starts with you.
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1.5 font-mono text-xs text-slate-300">
            Phase 2 · Workspace
          </span>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-300 sm:px-5">
          <span>
            <span aria-hidden="true" className="mr-2 text-teal-300">
              ●
            </span>
            Destination locked to{" "}
            <code className="break-all text-teal-200">{DEMO_ORIGIN}</code>
          </span>
          <span className="text-slate-400">
            Local API · explicit sends only
          </span>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <RequestBuilder
            onStart={() => {
              setResult(null);
              setError(null);
              setState("loading");
            }}
            onResult={(response) => {
              setResult(response);
              setState("success");
            }}
            onError={(failure) => {
              setError(failure);
              setState("error");
            }}
          />
          <ResponseInspector state={state} result={result} error={error} />
        </div>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>TraceLens · local-first API debugging</span>
          <span>
            Saved requests, history &amp; dashboard arrive in later phases.
          </span>
        </footer>
      </main>
    </div>
  );
}
