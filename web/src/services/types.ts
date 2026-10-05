export type EventMembershipRole = "event_manager" | "staff";

export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export interface Membership {
  eventId: string;
  role: EventMembershipRole;
}

export type EventStatus = "draft" | "open" | "closed" | "archived";

export interface CampEvent {
  id: string;
  slug: string;
  name: string;
  kind: "church_camp" | "generic";
  timezone: string;
  status: EventStatus;
  startsOn: string;
  endsOn: string;
}

export type GroupKind = "church" | "dorm" | "team";

export interface Group {
  id: string;
  eventId: string;
  name: string;
  kind: GroupKind;
}

export type ParticipantRole = "camper" | "leader" | "staff";
export type ParticipantStatus = "registered" | "checked_in" | "departed" | "cancelled";

export interface Participant {
  id: string;
  eventId: string;
  personId: string;
  fullName: string;
  groupId: string | null;
  role: ParticipantRole;
  status: ParticipantStatus;
  registeredAt: string;
}

export type CredentialStatus = "active" | "revoked" | "replaced";

export interface Credential {
  id: string;
  eventParticipantId: string;
  kind: "qr";
  status: CredentialStatus;
  tokenHint: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  replacedBy: string | null;
}

export interface IssuedCredential {
  credential: Credential;
  // Returned once, at issue or replace. The server keeps only an HMAC of it.
  token: string;
}

export interface PersonMatch {
  id: string;
  fullName: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface AccessSummary {
  eventId: string;
  eventName: string;
  role: EventMembershipRole;
}

export interface AdminUserDetail extends AdminUser {
  access: AccessSummary[];
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  eventId: string | null;
  details: Record<string, unknown>;
}

// One person's place on one event, as listed on the access page.
export interface AccessRow {
  userId: string;
  email: string;
  displayName: string;
  isActive?: boolean;
  role: EventMembershipRole;
}

export interface Overview {
  activeUsers: number;
  administrators: number;
  openEvents: number;
  changesLast7Days: number;
}

export type RegistrationStatus = "draft" | "open" | "closed";

export type RegistrationFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "long_text";

// The event's registration as the manager sees it. publicUrl is null when the server has no public address set.
export interface RegistrationSummary {
  status: RegistrationStatus;
  slug: string;
  publicUrl: string | null;
  fieldCount: number;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export interface FormField {
  id: string;
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  section: string | null;
  options: string[] | null;
  personField: "first_name" | "last_name" | "phone" | null;
  position: number;
}

// A field as a public registrant sees it. It carries no id.
export interface PublicField {
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  section: string | null;
  options: string[] | null;
}

export interface PublicRegistration {
  event: { name: string; startsOn: string; endsOn: string; timezone: string };
  registration: { status: RegistrationStatus; fields: PublicField[] };
}

export interface Confirmation {
  reference: string;
  firstName: string;
  eventName: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
}

// The answers one participant gave on their registration, for a manager.
export interface RegistrationAnswer {
  key: string;
  label: string;
  type: RegistrationFieldType;
  value: string;
}

export interface RegistrationSubmissionView {
  reference: string;
  submittedAt: string;
  identityMatch: "new" | "reused" | "ambiguous";
  answers: RegistrationAnswer[];
}
