import type { AuthState } from "./AuthContext";
import type { EventMembershipRole, Membership, User } from "../services/types";

// The one place the screens decide what a person may do. The server enforces every rule again.
// Pages ask can(viewer, capability, eventId) and never compare roles themselves. See docs/design/ui-architecture.md.

export type EventRole = "admin" | EventMembershipRole;

export type Capability =
  | "app.admin"
  | "event.create"
  | "event.view"
  | "event.manage"
  | "event.access.view"
  | "event.access.change"
  | "participant.register"
  | "credential.issue"
  | "event.registration.view"
  | "event.registration.manage"
  | "checkpoint.manage"
  | "operations.scan"
  | "attendance.view";

export interface Viewer {
  user: User;
  memberships: Membership[];
}

export function viewerOf(state: AuthState): Viewer | null {
  return state.status === "signed-in" ? { user: state.user, memberships: state.memberships } : null;
}

// The role a viewer holds on one event. Administrators hold "admin" everywhere.
export function roleOn(viewer: Viewer | null, eventId: string): EventRole | null {
  if (!viewer) return null;
  if (viewer.user.isAdmin) return "admin";
  return viewer.memberships.find((m) => m.eventId === eventId)?.role ?? null;
}

const CAN_MANAGE_EVENT: ReadonlySet<EventRole> = new Set(["admin", "event_manager"]);

export function can(viewer: Viewer | null, capability: Capability, eventId?: string): boolean {
  if (!viewer) return false;
  const role = eventId ? roleOn(viewer, eventId) : null;
  switch (capability) {
    case "app.admin":
    case "event.create":
    case "event.access.change":
      return viewer.user.isAdmin;
    case "event.view":
      return role !== null;
    // Staff operate the camp; they do not issue passes, which is a manager decision.
    case "credential.issue":
      return role !== null && CAN_MANAGE_EVENT.has(role);
    // Staff and managers scan and see attendance. Only managers change checkpoints.
    case "operations.scan":
    case "attendance.view":
      return role !== null;
    case "checkpoint.manage":
      return role !== null && CAN_MANAGE_EVENT.has(role);
    case "event.manage":
    case "event.access.view":
    case "participant.register":
    // Registration holds personal answers and sets the public form, so only managers and administrators see it.
    case "event.registration.view":
    case "event.registration.manage":
      return role !== null && CAN_MANAGE_EVENT.has(role);
  }
}
