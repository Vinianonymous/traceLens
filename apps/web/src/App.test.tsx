import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const result = (overrides: Record<string, unknown> = {}) => ({
  status: 200,
  duration_ms: 18,
  headers: { "content-type": "application/json" },
  body: '[{"id":1,"name":"Notebook"}]',
  truncated: false,
  error: null,
  ...overrides,
});

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("starts empty and sends a GET only on explicit action", async () => {
  const fetchMock = vi.fn().mockResolvedValue(reply(200, result()));
  vi.stubGlobal("fetch", fetchMock);
  renderApp();
  expect(screen.getByText("Ready when you are")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  await screen.findByLabelText("Response body");
  expect(screen.getByText("18", { exact: false })).toBeInTheDocument();
  expect(screen.getByLabelText("Response body")).toHaveTextContent(
    '"Notebook"',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [endpoint, options] = fetchMock.mock.calls[0];
  expect(endpoint).toBe("http://127.0.0.1:8000/api/v1/requests/send");
  expect(JSON.parse(options.body)).toMatchObject({
    method: "GET",
    url: "http://127.0.0.1:8001/items",
    body: null,
  });
  expect(options.credentials).toBe("omit");
});

it("composes a POST example with editable query, header and JSON body", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      reply(200, result({ status: 201, body: '{"id":3,"name":"Eraser"}' })),
    );
  vi.stubGlobal("fetch", fetchMock);
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "POST /items" }));
  fireEvent.click(screen.getByRole("button", { name: /Add query parameter/ }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Query parameter 1 key" }),
    {
      target: { value: "page" },
    },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Query parameter 1 value" }),
    {
      target: { value: "1" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  await screen.findByLabelText("Response body");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    query: { page: "1" },
    body: '{\n  "name": "Eraser"\n}',
  });
  expect(screen.getByLabelText("Response body")).toHaveTextContent("Eraser");
  expect(screen.getByRole("tab", { name: "Headers 1" })).toBeInTheDocument();
});

it("disables Send while pending and preserves the editor after a structured error", async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(
    () => new Promise<Response>((done) => (resolve = done)),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "POST /items" }));
  fireEvent.change(screen.getByLabelText("Request URL"), {
    target: { value: "http://127.0.0.1:8001/redirect" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(screen.getByText("Waiting for the demo API…")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await act(async () => {
    resolve(
      reply(502, {
        code: "REDIRECT_BLOCKED",
        message: "Demo API redirect blocked",
        details: {},
      }),
    );
  });
  expect(await screen.findByText("REDIRECT_BLOCKED")).toBeInTheDocument();
  expect(screen.getByLabelText("Request URL")).toHaveValue(
    "http://127.0.0.1:8001/redirect",
  );
  expect(screen.getByRole("textbox", { name: /Body/ })).toHaveValue(
    '{\n  "name": "Eraser"\n}',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("validates a blocked URL and invalid JSON without sending", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderApp();
  fireEvent.change(screen.getByLabelText("Request URL"), {
    target: { value: "http://example.com/items" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Only the bundled demo API",
  );
  fireEvent.change(screen.getByLabelText("Request URL"), {
    target: { value: "http://127.0.0.1:8001/items" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /Body/ }), {
    target: { value: "{" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects credential headers and duplicate rows before sending", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: /Add header/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Header 1 key" }), {
    target: { value: "Authorization" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Header 1 value" }), {
    target: { value: "do-not-send" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Sensitive or unsupported header",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Header 1 key" }), {
    target: { value: "x-demo" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Add header/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Header 2 key" }), {
    target: { value: "X-Demo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Duplicate header");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows network failures without clearing the editor", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(await screen.findByText("API_UNAVAILABLE")).toBeInTheDocument();
  expect(screen.getByLabelText("Request URL")).toHaveValue(
    "http://127.0.0.1:8001/items",
  );
});

it("renders HTML as inert text, filters sensitive headers and marks truncation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      reply(
        200,
        result({
          headers: {
            "content-type": "text/html",
            "set-cookie": "private=1",
            "x-request-id": "demo",
          },
          body: '<img src=x onerror="alert(1)">',
          truncated: true,
        }),
      ),
    ),
  );
  const { container } = renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(await screen.findByLabelText("Response body")).toHaveTextContent(
    "<img src=x",
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText(/Response body truncated/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Headers/ }));
  expect(screen.getByText("x-request-id")).toBeInTheDocument();
  expect(screen.queryByText("set-cookie")).not.toBeInTheDocument();
  expect(screen.queryByText("private=1")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: /Headers/ })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
});

it("supports arrow keys between response tabs without losing focus", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, result())));
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  const body = await screen.findByRole("tab", { name: "Body" });
  const headers = screen.getByRole("tab", { name: /Headers/ });
  body.focus();
  fireEvent.keyDown(body, { key: "ArrowRight" });
  expect(headers).toHaveFocus();
  expect(headers).toHaveAttribute("aria-selected", "true");
  expect(body).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(headers, { key: "Home" });
  expect(body).toHaveFocus();
  expect(screen.getByRole("tabpanel", { name: "Body" })).toBeInTheDocument();
});

it("shows metadata rather than attempting to render a binary response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      reply(
        200,
        result({
          headers: { "content-type": "image/png" },
          body: null,
        }),
      ),
    ),
  );
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Send request →" }));
  expect(await screen.findByText("image/png")).toBeInTheDocument();
  expect(
    screen.getByText(/Binary responses show metadata only/),
  ).toBeInTheDocument();
});
