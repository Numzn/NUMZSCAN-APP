import { describe, expect, it } from "vitest";
import { canIssue, canManage, roleFor } from "./roles";
import type { Membership, User } from "../services/types";

const admin: User = { id: "a", email: "a@x.org", displayName: "A", isAdmin: true };
const user: User = { id: "u", email: "u@x.org", displayName: "U", isAdmin: false };
const memberships: Membership[] = [
  { eventId: "event-a", role: "event_manager" },
  { eventId: "event-b", role: "staff" },
];

describe("roleFor", () => {
  it("gives an admin the admin role on every event", () => {
    expect(roleFor(admin, [], "anything")).toBe("admin");
  });

  it("returns the membership role for the event it belongs to", () => {
    expect(roleFor(user, memberships, "event-a")).toBe("event_manager");
    expect(roleFor(user, memberships, "event-b")).toBe("staff");
  });

  it("returns null for an event the user has no membership in", () => {
    expect(roleFor(user, memberships, "event-c")).toBeNull();
  });
});

describe("permissions for the UI", () => {
  it("only managers and admins may manage an event", () => {
    expect(canManage("admin")).toBe(true);
    expect(canManage("event_manager")).toBe(true);
    expect(canManage("staff")).toBe(false);
    expect(canManage(null)).toBe(false);
  });

  it("staff and managers may issue credentials, but not outsiders", () => {
    expect(canIssue("staff")).toBe(true);
    expect(canIssue("event_manager")).toBe(true);
    expect(canIssue(null)).toBe(false);
  });
});
