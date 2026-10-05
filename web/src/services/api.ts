import type { CampEvent, Membership, User } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PATCH";

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

// The API always answers errors as { error: { code, message } }. Anything else is a generic failure.
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (method !== "GET") {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body ?? {});
  }

  const response = await fetch(`/api/v1${path}`, init);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const error = (json as ErrorEnvelope | null)?.error;
    throw new ApiError(response.status, error?.code ?? "UNKNOWN", error?.message ?? "Request failed", error?.details);
  }
  return json as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>("POST", "/auth/login", { email, password }),
  me: () => request<{ user: User; memberships: Membership[] }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  listEvents: () => request<{ events: CampEvent[] }>("GET", "/events"),
  getEvent: (eventId: string) => request<{ event: CampEvent }>("GET", `/events/${encodeURIComponent(eventId)}`),
};
