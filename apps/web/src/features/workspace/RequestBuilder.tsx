import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { DEMO_ORIGIN, SendError, sendRequest } from "../../lib/api";
import type {
  KeyValue,
  Method,
  SendRequest,
  SendResult,
} from "../../types/api";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MAX_BODY_BYTES = 1024 * 1024;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const BLOCKED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-connection",
  "keep-alive",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "accept-encoding",
]);

type BuilderProps = {
  onStart: () => void;
  onResult: (result: SendResult) => void;
  onError: (error: SendError) => void;
};

function rowsToObject(rows: KeyValue[], kind: "Header" | "Query parameter") {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value) continue;
    if (!key) throw new SendError("INVALID_INPUT", `${kind} needs a name.`);
    const normalized = kind === "Header" ? key.toLowerCase() : key;
    if (used.has(normalized))
      throw new SendError(
        "INVALID_INPUT",
        `Duplicate ${kind.toLowerCase()}: ${key}`,
      );
    used.add(normalized);
    if (kind === "Header") {
      if (!HEADER_NAME.test(key))
        throw new SendError("INVALID_INPUT", "Invalid header name.");
      if (
        BLOCKED_HEADERS.has(normalized) ||
        normalized.includes("api-key") ||
        [...row.value].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126,
        )
      ) {
        throw new SendError(
          "INVALID_INPUT",
          "Sensitive or unsupported header.",
        );
      }
    }
    result[key] = row.value;
  }
  return result;
}

function validateUrl(url: string) {
  // Do not normalize obfuscated hosts in the browser before checking the raw authority.
  if (
    [...url].some((char) => char.charCodeAt(0) < 33 || char === "\\") ||
    url.length > 4096
  ) {
    throw new SendError("INVALID_URL", "Enter a valid demo API URL.");
  }
  const authority = /^http:\/\/([^/?#]+)/.exec(url);
  if (
    !authority ||
    `http://${authority[1]}` !== DEMO_ORIGIN ||
    url.includes("#")
  ) {
    throw new SendError(
      "DESTINATION_BLOCKED",
      "Only the bundled demo API is available.",
    );
  }
  try {
    new URL(url);
  } catch {
    throw new SendError("INVALID_URL", "Enter a valid demo API URL.");
  }
}

function KeyValueEditor({
  title,
  rows,
  onChange,
  nextId,
}: {
  title: "Header" | "Query parameter";
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  nextId: () => number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div className="flex gap-2" key={row.id}>
          <input
            aria-label={`${title} ${index + 1} key`}
            placeholder="Key"
            value={row.key}
            onChange={(event) =>
              onChange(
                rows.map((entry) =>
                  entry.id === row.id
                    ? { ...entry, key: event.target.value }
                    : entry,
                ),
              )
            }
            className="field min-w-0 flex-1 font-mono text-sm"
          />
          <input
            aria-label={`${title} ${index + 1} value`}
            placeholder="Value"
            value={row.value}
            onChange={(event) =>
              onChange(
                rows.map((entry) =>
                  entry.id === row.id
                    ? { ...entry, value: event.target.value }
                    : entry,
                ),
              )
            }
            className="field min-w-0 flex-1 font-mono text-sm"
          />
          <button
            type="button"
            aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
            onClick={() =>
              onChange(rows.filter((entry) => entry.id !== row.id))
            }
            className="icon-button"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...rows, { id: nextId(), key: "", value: "" }])
        }
        className="text-sm font-medium text-teal-300 hover:text-teal-200 focus-visible:underline"
      >
        + Add {title.toLowerCase()}
      </button>
    </div>
  );
}

export default function RequestBuilder({
  onStart,
  onResult,
  onError,
}: BuilderProps) {
  const ids = useRef(1);
  const sending = useRef(false);
  const nextId = () => ids.current++;
  const [method, setMethod] = useState<Method>("GET");
  const [url, setUrl] = useState(`${DEMO_ORIGIN}/items`);
  const [query, setQuery] = useState<KeyValue[]>([]);
  const [headers, setHeaders] = useState<KeyValue[]>([]);
  const [bodyMode, setBodyMode] = useState<"json" | "text">("json");
  const [body, setBody] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: sendRequest, retry: false });

  function loadExample(example: "get" | "post") {
    if (sending.current || mutation.isPending) return;
    setMethod(example === "get" ? "GET" : "POST");
    setUrl(`${DEMO_ORIGIN}/items`);
    setHeaders(
      example === "get"
        ? []
        : [{ id: nextId(), key: "Content-Type", value: "application/json" }],
    );
    setQuery([]);
    setBody(example === "get" ? "" : '{\n  "name": "Eraser"\n}');
    setBodyMode("json");
    setValidation(null);
  }

  function preparePayload(): SendRequest {
    validateUrl(url);
    const safeHeaders = rowsToObject(headers, "Header");
    const safeQuery = rowsToObject(query, "Query parameter");
    if (body && bodyMode === "json") {
      try {
        JSON.parse(body);
      } catch {
        throw new SendError("INVALID_BODY", "Body must contain valid JSON.");
      }
    }
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      throw new SendError("REQUEST_TOO_LARGE", "Body must be at most 1 MiB.");
    }
    if (
      body &&
      !Object.keys(safeHeaders).some(
        (key) => key.toLowerCase() === "content-type",
      )
    ) {
      safeHeaders["Content-Type"] =
        bodyMode === "json" ? "application/json" : "text/plain";
    }
    return {
      method,
      url,
      headers: safeHeaders,
      query: safeQuery,
      body: body || null,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || mutation.isPending) return;
    setValidation(null);
    let payload: SendRequest;
    try {
      payload = preparePayload();
    } catch (error) {
      setValidation(
        error instanceof SendError
          ? error.message
          : "Check your request and try again.",
      );
      return;
    }
    sending.current = true;
    onStart();
    try {
      onResult(await mutation.mutateAsync(payload));
    } catch (error) {
      onError(
        error instanceof SendError
          ? error
          : new SendError(
              "API_UNAVAILABLE",
              "Cannot reach the local TraceLens API.",
            ),
      );
    } finally {
      sending.current = false;
    }
  }

  return (
    <section
      aria-labelledby="builder-title"
      className="panel flex min-w-0 flex-col"
    >
      <div className="panel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">01 / Compose</p>
          <h2
            id="builder-title"
            className="mt-1 text-lg font-semibold text-slate-100"
          >
            Request builder
          </h2>
        </div>
        <span className="badge">Manual execution only</span>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col gap-7 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Try an example:</span>
          <button
            type="button"
            onClick={() => loadExample("get")}
            disabled={mutation.isPending}
            className="example-button"
          >
            GET /items
          </button>
          <button
            type="button"
            onClick={() => loadExample("post")}
            disabled={mutation.isPending}
            className="example-button"
          >
            POST /items
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="request-url" className="field-label">
            Request URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="HTTP method"
              value={method}
              onChange={(event) => setMethod(event.target.value as Method)}
              className="field w-full font-mono text-sm font-semibold text-teal-300 sm:w-28"
            >
              {METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              id="request-url"
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              spellCheck={false}
              autoComplete="off"
              className="field min-w-0 flex-1 font-mono text-sm"
            />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Allowed destination:{" "}
            <code className="text-slate-300">{DEMO_ORIGIN}</code> only.
          </p>
        </div>

        <div className="space-y-4 border-t border-slate-800 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="field-label">Query parameters</h3>
            <span className="section-count">{query.length} rows</span>
          </div>
          <KeyValueEditor
            title="Query parameter"
            rows={query}
            onChange={setQuery}
            nextId={nextId}
          />
        </div>
        <div className="space-y-4 border-t border-slate-800 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="field-label">Headers</h3>
            <span className="section-count">{headers.length} rows</span>
          </div>
          <KeyValueEditor
            title="Header"
            rows={headers}
            onChange={setHeaders}
            nextId={nextId}
          />
          <p className="text-xs text-slate-400">
            Credentials and connection-control headers are blocked.
          </p>
        </div>
        <div className="space-y-3 border-t border-slate-800 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="request-body" className="field-label">
              Body{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <div
              className="flex rounded-lg border border-slate-700 p-0.5"
              role="group"
              aria-label="Body format"
            >
              {(["json", "text"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBodyMode(mode)}
                  aria-pressed={bodyMode === mode}
                  className={`rounded-md px-3 py-1 text-xs font-semibold uppercase transition ${bodyMode === mode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="request-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              bodyMode === "json"
                ? '{ "name": "Eraser" }'
                : "Plain-text request body"
            }
            spellCheck={false}
            rows={7}
            className="field w-full resize-y font-mono text-sm leading-6"
          />
          <p className="text-xs text-slate-400">
            {bodyMode === "json"
              ? "JSON is validated before sending."
              : "Text is sent without JSON validation."}{" "}
            Maximum 1 MiB.
          </p>
        </div>

        {validation && (
          <p
            role="alert"
            className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
          >
            {validation}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6">
          <p className="text-xs text-slate-400">
            No automatic retries or background traffic.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled
              title="Saving requests arrives in Phase 3"
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-500"
            >
              Save · later
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="send-button min-w-28"
            >
              {mutation.isPending ? "Sending…" : "Send request →"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
