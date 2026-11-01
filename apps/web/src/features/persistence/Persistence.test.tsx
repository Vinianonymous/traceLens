import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../App";

const collections = [
  {
    id: "c1",
    name: "Examples",
    requests: [],
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

function reply(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("saves an explicit workspace draft into a collection without persisting its body by default", async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string, options?: RequestInit) => {
      if (url.endsWith("/collections") && options?.method === "POST")
        return Promise.resolve(reply(collections[0], 201));
      if (url.endsWith("/collections/c1/requests"))
        return Promise.resolve(reply({ id: "r1" }, 201));
      return Promise.resolve(reply(collections));
    });
  vi.stubGlobal("fetch", fetchMock);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "POST /items" }));
  fireEvent.click(screen.getByRole("button", { name: "Save request" }));
  await screen.findByRole("heading", { name: "Saved requests" });
  await screen.findByRole("option", { name: "Examples" });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Saved request name" }),
    { target: { value: "Create item" } },
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Save to collection" }),
    { target: { value: "c1" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save request" }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) =>
        url.endsWith("/collections/c1/requests"),
      ),
    ).toBe(true),
  );
  const [, request] = fetchMock.mock.calls.find(([url]) =>
    url.endsWith("/collections/c1/requests"),
  )!;
  expect(JSON.parse(request.body)).toMatchObject({
    method: "POST",
    name: "Create item",
    body: '{\n  "name": "Eraser"\n}',
  });
  expect(JSON.parse(request.body).persist_body).toBeUndefined();
  expect(
    fetchMock.mock.calls.some(([url]) => url.endsWith("/requests/send")),
  ).toBe(false);
});

it("shows history with an empty state and requires confirmation to clear it", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(reply({ items: [], total: 0, page: 1, page_size: 25 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(false);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  expect(await screen.findByText(/No requests match yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(
    fetchMock.mock.calls.every(([, options]) => options?.method !== "DELETE"),
  ).toBe(true);
  vi.mocked(window.confirm).mockRestore();
});
