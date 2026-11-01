import type { ApiError, SendRequest, SendResult } from "../types/api";

const configuredBase =
  import.meta.env.VITE_API_BASE_URL ??
  `http://127.0.0.1:${import.meta.env.VITE_TRACELENS_API_PORT ?? "8000"}`;
const localBase = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(configuredBase);
if (!localBase || Number(localBase[1]) < 1 || Number(localBase[1]) > 65535) {
  throw new Error("The API origin must be an explicit local port on 127.0.0.1");
}

export const API_BASE_URL = configuredBase;
const configuredDemo =
  import.meta.env.VITE_DEMO_ORIGIN ?? "http://127.0.0.1:8001";
if (
  configuredDemo !== "http://demo-api:8001" &&
  configuredDemo !== "http://127.0.0.1:8001"
) {
  throw new Error("The demo origin must be the bundled demo API");
}
export const DEMO_ORIGIN = configuredDemo;

export class SendError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function isSendResult(value: unknown): value is SendResult {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("headers" in value) ||
    typeof value.headers !== "object" ||
    value.headers === null ||
    Array.isArray(value.headers)
  )
    return false;
  return (
    Object.values(value.headers).every((entry) => typeof entry === "string") &&
    "status" in value &&
    typeof value.status === "number" &&
    Number.isInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599 &&
    "duration_ms" in value &&
    typeof value.duration_ms === "number" &&
    Number.isFinite(value.duration_ms) &&
    value.duration_ms >= 0 &&
    "body" in value &&
    (value.body === null || typeof value.body === "string") &&
    "truncated" in value &&
    typeof value.truncated === "boolean"
  );
}

export async function sendRequest(payload: SendRequest): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/requests/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    throw new SendError(
      "API_UNAVAILABLE",
      "Cannot reach the local TraceLens API.",
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SendError(
      "INVALID_RESPONSE",
      "The local API returned an invalid response.",
    );
  }
  if (!response.ok) {
    if (isApiError(data)) throw new SendError(data.code, data.message);
    throw new SendError(
      "API_ERROR",
      `The local API returned HTTP ${response.status}.`,
    );
  }
  if (!isSendResult(data)) {
    throw new SendError(
      "INVALID_RESPONSE",
      "The local API returned an invalid response.",
    );
  }
  return data;
}
