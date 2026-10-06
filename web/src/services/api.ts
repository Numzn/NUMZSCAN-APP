import type {
  AccessRow,
  AttendanceSummary,
  Checkpoint,
  CheckpointKind,
  CheckpointRule,
  Occurrence,
  ScanResult,
  AdminUser,
  Confirmation,
  FormField,
  PublicRegistration,
  RegistrationFieldType,
  RegistrationSubmissionView,
  RegistrationSummary,
  AdminUserDetail,
  AuditEntry,
  CampEvent,
  Credential,
  Group,
  GroupKind,
  IssuedCredential,
  Membership,
  Overview,
  Participant,
  ParticipantRole,
  ParticipantStatus,
  PersonMatch,
  User,
} from "./types";

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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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

export interface UserListQuery {
  q?: string;
  status?: "active" | "deactivated" | "all";
  limit?: number;
  offset?: number;
}

export interface AuditQuery {
  limit?: number;
  before?: string;
  action?: string;
  eventId?: string;
}

const enc = encodeURIComponent;

function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${enc(key)}=${enc(String(value))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>("POST", "/auth/login", { email, password }),
  me: () => request<{ user: User; memberships: Membership[] }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),

  listEvents: () => request<{ events: CampEvent[] }>("GET", "/events"),
  getEvent: (eventId: string) => request<{ event: CampEvent }>("GET", `/events/${enc(eventId)}`),
  createEvent: (body: NewEvent) => request<{ event: CampEvent }>("POST", "/events", body),
  updateEvent: (eventId: string, body: Partial<Pick<CampEvent, "name" | "status" | "timezone" | "startsOn" | "endsOn">>) =>
    request<{ event: CampEvent }>("PATCH", `/events/${enc(eventId)}`, body),

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

  // Administrator area
  registration: (eventId: string) =>
    request<{ registration: RegistrationSummary | null }>("GET", `/events/${enc(eventId)}/registration`),
  createRegistration: (eventId: string) =>
    request<{ registration: RegistrationSummary }>("POST", `/events/${enc(eventId)}/registration`, {}),
  changeRegistrationLink: (eventId: string, slug: string) =>
    request<{ registration: RegistrationSummary }>("PATCH", `/events/${enc(eventId)}/registration`, { slug }),
  publishRegistration: (eventId: string) =>
    request<{ registration: RegistrationSummary }>("POST", `/events/${enc(eventId)}/registration/publish`, {}),
  closeRegistration: (eventId: string) =>
    request<{ registration: RegistrationSummary }>("POST", `/events/${enc(eventId)}/registration/close`, {}),
  registrationForm: (eventId: string) => request<{ fields: FormField[] }>("GET", `/events/${enc(eventId)}/registration/form`),
  addRegistrationField: (eventId: string, body: { label: string; type: RegistrationFieldType; required: boolean; section: string | null; options: string[] | null }) =>
    request<{ field: FormField }>("POST", `/events/${enc(eventId)}/registration/form/fields`, body),
  updateRegistrationField: (eventId: string, fieldId: string, body: Partial<Omit<FormField, "id" | "key" | "personField" | "position">>) =>
    request<{ field: FormField }>("PATCH", `/events/${enc(eventId)}/registration/form/fields/${enc(fieldId)}`, body),
  removeRegistrationField: (eventId: string, fieldId: string) =>
    request<{ field: FormField }>("DELETE", `/events/${enc(eventId)}/registration/form/fields/${enc(fieldId)}`),
  reorderRegistrationFields: (eventId: string, fieldOrder: string[]) =>
    request<{ fields: FormField[] }>("PATCH", `/events/${enc(eventId)}/registration/form`, { fieldOrder }),
  registrationAnswers: (participantId: string) =>
    request<{ submission: RegistrationSubmissionView | null }>("GET", `/event-participants/${enc(participantId)}/registration`),
  publicRegistration: (slug: string) => request<PublicRegistration>("GET", `/public/registration/${enc(slug)}`),
  submitPublicRegistration: (slug: string, body: { submissionId: string; answers: Record<string, string | boolean> }) =>
    request<{ confirmation: Confirmation }>("POST", `/public/registration/${enc(slug)}`, body),

  checkpoints: (eventId: string) => request<{ checkpoints: Checkpoint[] }>("GET", `/events/${enc(eventId)}/checkpoints`),
  createCheckpoint: (eventId: string, body: { name: string; kind: CheckpointKind; ruleType: CheckpointRule; active?: boolean }) =>
    request<{ checkpoint: Checkpoint }>("POST", `/events/${enc(eventId)}/checkpoints`, body),
  updateCheckpoint: (checkpointId: string, body: { name?: string; kind?: CheckpointKind; ruleType?: CheckpointRule; active?: boolean }) =>
    request<{ checkpoint: Checkpoint }>("PATCH", `/checkpoints/${enc(checkpointId)}`, body),
  occurrences: (checkpointId: string) => request<{ occurrences: Occurrence[] }>("GET", `/checkpoints/${enc(checkpointId)}/occurrences`),
  createOccurrence: (checkpointId: string, body: { label: string; startsAt: string; endsAt: string; serviceDate: string }) =>
    request<{ occurrence: Occurrence }>("POST", `/checkpoints/${enc(checkpointId)}/occurrences`, body),
  scan: (eventId: string, body: { id: string; credential: string; checkpointId: string; occurrenceId: string; scannedAt: string }) =>
    request<ScanResult>("POST", `/events/${enc(eventId)}/scans`, body),
  attendance: (eventId: string) => request<AttendanceSummary>("GET", `/events/${enc(eventId)}/attendance`),

  adminOverview: () => request<{ overview: Overview }>("GET", "/admin/overview"),
  adminListUsers: (params: UserListQuery = {}) =>
    request<{ users: AdminUser[]; total: number }>("GET", `/admin/users${query({ ...params })}`),
  adminCreateUser: (body: { email: string; displayName: string; password: string; isAdmin: boolean }) =>
    request<{ user: AdminUser }>("POST", "/admin/users", body),
  adminGetUser: (userId: string) => request<{ user: AdminUserDetail }>("GET", `/admin/users/${enc(userId)}`),
  adminUpdateUser: (userId: string, body: { displayName?: string; isAdmin?: boolean; isActive?: boolean }) =>
    request<{ user: AdminUser }>("PATCH", `/admin/users/${enc(userId)}`, body),
  adminResetPassword: (userId: string, password: string) =>
    request<{ ok: boolean; sessionsEnded: number }>("POST", `/admin/users/${enc(userId)}/password`, { password }),
  adminRevokeSessions: (userId: string) =>
    request<{ ok: boolean; sessionsEnded: number }>("POST", `/admin/users/${enc(userId)}/sessions/revoke`, {}),
  adminAudit: (params: AuditQuery = {}) =>
    request<{ entries: AuditEntry[]; nextBefore: string | null }>("GET", `/admin/audit${query({ ...params })}`),

  // Event access
  listMemberships: (eventId: string) =>
    request<{ memberships: AccessRow[] }>("GET", `/events/${enc(eventId)}/memberships`),
  addMembership: (eventId: string, body: { userId: string; role: "event_manager" | "staff" }) =>
    request<{ membership: AccessRow }>("POST", `/events/${enc(eventId)}/memberships`, body),
  changeMembership: (eventId: string, userId: string, role: "event_manager" | "staff") =>
    request<{ membership: AccessRow }>("PATCH", `/events/${enc(eventId)}/memberships/${enc(userId)}`, { role }),
  removeMembership: (eventId: string, userId: string) =>
    request<void>("DELETE", `/events/${enc(eventId)}/memberships/${enc(userId)}`),
};
