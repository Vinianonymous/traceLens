export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type KeyValue = { id: number; key: string; value: string };

export type SendRequest = {
  method: Method;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string | null;
};

export type SendResult = {
  status: number;
  duration_ms: number;
  headers: Record<string, string>;
  body: string | null;
  truncated: boolean;
  error: null;
};

export type ApiError = {
  code: string;
  message: string;
  details: Record<string, string>;
};
