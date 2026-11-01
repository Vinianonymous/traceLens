import { API_BASE_URL, SendError } from "../../lib/api";
import type { Method, SendRequest } from "../../types/api";

export type Template = Omit<SendRequest, "body"> & {
  id: string;
  name: string;
  body: string | null;
  created_at: string;
  updated_at: string;
};
export type Collection = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  requests: Template[];
};
export type HistoryItem = {
  id: string;
  method: Method;
  sanitized_url: string;
  status: number | null;
  duration_ms: number | null;
  error_code: string | null;
  requested_at: string;
  response_size_bytes: number | null;
  truncated: boolean;
};
export type HistoryPage = {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
};

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    throw new SendError(
      "API_UNAVAILABLE",
      "Cannot reach the local TraceLens API.",
    );
  }
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      throw new SendError("API_ERROR", error.message);
    }
    throw new SendError(
      "API_ERROR",
      `Local API returned HTTP ${response.status}.`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
