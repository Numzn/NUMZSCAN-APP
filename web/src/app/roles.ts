import type { EventMembershipRole, Membership, User } from "../services/types";

export type EventRole = "admin" | EventMembershipRole;

// The UI uses these only to decide what to show. Every action is still enforced by the API.
export function roleFor(user: User, memberships: Membership[], eventId: string): EventRole | null {
  if (user.isAdmin) return "admin";
  return memberships.find((m) => m.eventId === eventId)?.role ?? null;
}

export const canManage = (role: EventRole | null) => role === "admin" || role === "event_manager";
export const canIssue = (role: EventRole | null) => role !== null;
