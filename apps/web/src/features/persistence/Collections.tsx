import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { DEMO_ORIGIN } from "../../lib/api";
import type { Method, SendRequest } from "../../types/api";
import { api, type Collection, type Template } from "./api";

type Props = {
  draft: SendRequest | null;
  onSaved: () => void;
  onLoad: (request: SendRequest) => void;
};

export default function Collections({ draft, onSaved, onLoad }: Props) {
  const client = useQueryClient();
  const {
    data = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<Collection[]>("/collections"),
    retry: false,
  });
  const [name, setName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editMethod, setEditMethod] = useState<Method>("GET");
  const [editUrl, setEditUrl] = useState("");
  const [editQuery, setEditQuery] = useState("{}");
  const [editHeaders, setEditHeaders] = useState("{}");
  const [editBody, setEditBody] = useState("");
  const [persistBody, setPersistBody] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);

  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["collections"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: Template) {
    setEditing(item);
    setEditName(item.name);
    setEditMethod(item.method);
    setEditUrl(item.url);
    setEditQuery(JSON.stringify(item.query, null, 2));
    setEditHeaders(JSON.stringify(item.headers, null, 2));
    setEditBody(item.body ?? "");
    setPersistBody(false);
  }

  function parseRows(text: string): Record<string, string> {
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.entries(value).some(
        ([key, entry]) => !key || typeof entry !== "string",
      )
    )
      throw new Error(
        "Query and headers must be JSON objects with string values.",
      );
    return value as Record<string, string>;
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    await action(async () => {
      const payload = {
        name: editName,
        method: editMethod,
        url: editUrl,
        query: parseRows(editQuery),
        headers: parseRows(editHeaders),
        ...(persistBody ? { body: editBody || null, persist_body: true } : {}),
      };
      await api(`/saved-requests/${editing.id}`, "PATCH", payload);
      setEditing(null);
    });
  }

  async function importFile(file: File) {
    if (file.size > 1024 * 1024 + 65536) {
      setMessage("Import file exceeds size limit.");
      return;
    }
    await action(async () => {
      const content: unknown = JSON.parse(await file.text());
      await api("/import", "POST", content);
      setMessage("Collections imported.");
    });
    if (upload.current) upload.current.value = "";
  }

  async function exportFile() {
    await action(async () => {
      const content = await api<unknown>("/export");
      const link = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(content, null, 2)], {
          type: "application/json",
        }),
      );
      link.href = url;
      link.download = "tracelens-collections.json";
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="space-y-5" aria-labelledby="collections-title">
      <header>
        <p className="eyebrow">TraceLens / Collections</p>
        <h1 id="collections-title" className="mt-2 text-3xl font-semibold">
          Saved requests
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Local templates for the demo API. Bodies are not saved unless
          explicitly opted in; exports never include them.
        </p>
      </header>
      {message && (
        <p
          role="alert"
          className="rounded-lg border border-amber-600 p-3 text-amber-200"
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert">
          {error instanceof Error ? error.message : "Cannot load collections."}
        </p>
      )}
      {isPending && <p>Loading collections…</p>}
      <div className="panel space-y-5 p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              await api("/collections", "POST", { name });
              setName("");
            });
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            aria-label="New collection name"
            className="field min-w-0 flex-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={200}
            placeholder="New collection name"
          />
          <button className="send-button" disabled={busy} type="submit">
            Create collection
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="example-button"
            disabled={busy}
            onClick={() => void exportFile()}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="example-button"
            disabled={busy}
            onClick={() => upload.current?.click()}
          >
            Import JSON
          </button>
          <input
            id="collection-import"
            aria-label="Choose collection JSON file"
            ref={upload}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>
        {draft && (
          <form
            className="space-y-3 rounded-xl border border-teal-400/40 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!collectionId) {
                setMessage("Choose a collection first.");
                return;
              }
              void action(async () => {
                await api(`/collections/${collectionId}/requests`, "POST", {
                  ...draft,
                  name: templateName,
                });
                setTemplateName("");
                onSaved();
              });
            }}
          >
            <h2 className="font-semibold">Save current request</h2>
            <p className="text-xs text-slate-400">
              Request body is excluded by default. Check the destination and
              remove secrets before saving.
            </p>
            <input
              aria-label="Saved request name"
              className="field w-full"
              required
              maxLength={200}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Request name"
            />
            <select
              aria-label="Save to collection"
              className="field w-full"
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              required
            >
              <option value="">Select collection</option>
              {data.map((collection) => (
                <option value={collection.id} key={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !data.length}
              type="submit"
              className="send-button"
            >
              Save request
            </button>
          </form>
        )}
      </div>
      {!isPending && !data.length && (
        <p className="text-sm text-slate-400">
          No collections yet. Create one to organize your requests.
        </p>
      )}
      {data.map((collection) => (
        <article key={collection.id} className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {collection.name}{" "}
              <span className="section-count">
                {collection.requests.length} requests
              </span>
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="example-button"
                onClick={() => {
                  const renamed = window.prompt(
                    "Rename collection",
                    collection.name,
                  );
                  if (renamed !== null && renamed.trim())
                    void action(() =>
                      api(`/collections/${collection.id}`, "PATCH", {
                        name: renamed.trim(),
                      }),
                    );
                }}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={busy}
                className="example-button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${collection.name} and its saved requests?`,
                    )
                  )
                    void action(() =>
                      api(`/collections/${collection.id}`, "DELETE"),
                    );
                }}
              >
                Delete
              </button>
            </div>
          </div>
          {!collection.requests.length && (
            <p className="mt-4 text-sm text-slate-400">
              No requests saved here.
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {collection.requests.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 p-3"
              >
                <span className="min-w-0 text-sm">
                  <strong className="mr-2 font-mono text-teal-300">
                    {item.method}
                  </strong>
                  {item.name}
                  <span className="ml-2 block break-all font-mono text-xs text-slate-400 sm:inline">
                    {item.url.replace(DEMO_ORIGIN, "")}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="example-button"
                    onClick={() => onLoad(item)}
                  >
                    Open in builder
                  </button>
                  <button
                    type="button"
                    className="example-button"
                    onClick={() => startEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="example-button"
                    onClick={() =>
                      void action(() =>
                        api(`/collections/${collection.id}/requests`, "POST", {
                          name: `${item.name} copy`,
                          method: item.method,
                          url: item.url,
                          query: item.query,
                          headers: item.headers,
                        }),
                      )
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="example-button"
                    onClick={() => {
                      if (window.confirm(`Delete ${item.name}?`))
                        void action(() =>
                          api(`/saved-requests/${item.id}`, "DELETE"),
                        );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
      {editing && (
        <form
          className="panel space-y-3 p-5"
          onSubmit={(event) => void saveEdit(event)}
        >
          <h2 className="text-lg font-semibold">Edit {editing.name}</h2>
          <label className="block text-sm">
            Name
            <input
              className="field mt-1 w-full"
              required
              maxLength={200}
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Method
            <select
              className="field mt-1 w-full"
              value={editMethod}
              onChange={(event) => setEditMethod(event.target.value as Method)}
            >
              {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map(
                (method) => (
                  <option key={method}>{method}</option>
                ),
              )}
            </select>
          </label>
          <label className="block text-sm">
            Demo URL
            <input
              className="field mt-1 w-full"
              required
              value={editUrl}
              onChange={(event) => setEditUrl(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Query (JSON object)
            <textarea
              className="field mt-1 w-full font-mono"
              value={editQuery}
              onChange={(event) => setEditQuery(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Headers (JSON object)
            <textarea
              className="field mt-1 w-full font-mono"
              value={editHeaders}
              onChange={(event) => setEditHeaders(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Body (optional)
            <textarea
              className="field mt-1 w-full font-mono"
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={persistBody}
              onChange={(event) => setPersistBody(event.target.checked)}
            />
            Explicitly save body locally (may contain secrets)
          </label>
          <div className="flex gap-2">
            <button className="send-button" disabled={busy} type="submit">
              Update template
            </button>
            <button
              className="example-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
