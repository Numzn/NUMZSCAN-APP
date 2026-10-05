import type { CampEvent, Credential, Group, GroupKind, IssuedCredential, Membership, Participant, ParticipantRole, ParticipantStatus, PersonMatch, User } from "./types";

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

export interface NewEvent {
  slug: string;
  name: string;
  kind: "church_camp" | "generic";
  timezone: string;
  startsOn: string;
  endsOn: string;
}

export interface NewParticipant {
  personId?: string;
  person?: { fullName: string; phone?: string };
  groupId?: string | null;
  role?: ParticipantRole;
}

const enc = encodeURIComponent;

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>("POST", "/auth/login", { email, password }),
  me: () => request<{ user: User; memberships: Membership[] }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),

  listEvents: () => request<{ events: CampEvent[] }>("GET", "/events"),
  getEvent: (eventId: string) => request<{ event: CampEvent }>("GET", `/events/${enc(eventId)}`),
  createEvent: (body: NewEvent) => request<{ event: CampEvent }>("POST", "/events", body),

  listGroups: (eventId: string) => request<{ groups: Group[] }>("GET", `/events/${enc(eventId)}/groups`),
  createGroup: (eventId: string, body: { name: string; kind: GroupKind }) =>
    request<{ group: Group }>("POST", `/events/${enc(eventId)}/groups`, body),

  listParticipants: (eventId: string) =>
    request<{ participants: Participant[] }>("GET", `/events/${enc(eventId)}/participants`),
  createParticipant: (eventId: string, body: NewParticipant) =>
    request<{ participant: Participant }>("POST", `/events/${enc(eventId)}/participants`, body),
  getParticipant: (participantId: string) =>
    request<{ participant: Participant }>("GET", `/event-participants/${enc(participantId)}`),
  updateParticipant: (participantId: string, body: { groupId?: string | null; status?: ParticipantStatus; role?: ParticipantRole }) =>
    request<{ participant: Participant }>("PATCH", `/event-participants/${enc(participantId)}`, body),

  searchPeople: (q: string) => request<{ people: PersonMatch[] }>("GET", `/people?q=${enc(q)}`),

  listCredentials: (participantId: string) =>
    request<{ credentials: Credential[] }>("GET", `/event-participants/${enc(participantId)}/credentials`),
  issueCredential: (participantId: string) =>
    request<IssuedCredential>("POST", `/event-participants/${enc(participantId)}/credentials`, {}),
  replaceCredential: (credentialId: string) =>
    request<IssuedCredential>("POST", `/credentials/${enc(credentialId)}/replace`, {}),
  revokeCredential: (credentialId: string) =>
    request<{ credential: Credential }>("POST", `/credentials/${enc(credentialId)}/revoke`, {}),
};
