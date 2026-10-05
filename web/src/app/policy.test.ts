import { describe, expect, it } from "vitest";
import { ADMIN, MANAGER, STAFF } from "../test/session";
import { can, roleOn, viewerOf, type Viewer } from "./policy";

const EVENT_A = "event-a";
const EVENT_B = "event-b";
const managerOfA: Viewer = { user: MANAGER, memberships: [{ eventId: EVENT_A, role: "event_manager" }] };
const staffOfA: Viewer = { user: STAFF, memberships: [{ eventId: EVENT_A, role: "staff" }] };
const admin: Viewer = { user: ADMIN, memberships: [] };

describe("roleOn", () => {
  it("gives an administrator the admin role everywhere", () => {
    expect(roleOn(admin, EVENT_A)).toBe("admin");
    expect(roleOn(admin, "any")).toBe("admin");
  });

  it("gives a member only the role on their own events", () => {
    expect(roleOn(managerOfA, EVENT_A)).toBe("event_manager");
    expect(roleOn(managerOfA, EVENT_B)).toBeNull();
    expect(roleOn(null, EVENT_A)).toBeNull();
  });
});

describe("can", () => {
  it("lets only administrators use the admin area and create events", () => {
    expect(can(admin, "app.admin")).toBe(true);
    expect(can(admin, "event.create")).toBe(true);
    expect(can(managerOfA, "app.admin")).toBe(false);
    expect(can(managerOfA, "event.create")).toBe(false);
    expect(can(null, "app.admin")).toBe(false);
  });

  it("lets event managers manage their own event and see its access list, but not change access", () => {
    expect(can(managerOfA, "event.manage", EVENT_A)).toBe(true);
    expect(can(managerOfA, "event.access.view", EVENT_A)).toBe(true);
    expect(can(managerOfA, "participant.register", EVENT_A)).toBe(true);
    expect(can(managerOfA, "event.access.change", EVENT_A)).toBe(false);
    expect(can(managerOfA, "event.manage", EVENT_B)).toBe(false);
  });

  it("lets staff view and issue credentials, but not manage or see access", () => {
    expect(can(staffOfA, "event.view", EVENT_A)).toBe(true);
    expect(can(staffOfA, "credential.issue", EVENT_A)).toBe(true);
    expect(can(staffOfA, "event.manage", EVENT_A)).toBe(false);
    expect(can(staffOfA, "event.access.view", EVENT_A)).toBe(false);
    expect(can(staffOfA, "participant.register", EVENT_A)).toBe(false);
  });

  it("lets event managers and administrators configure registration, and keeps it from staff and outsiders", () => {
    expect(can(managerOfA, "event.registration.view", EVENT_A)).toBe(true);
    expect(can(managerOfA, "event.registration.manage", EVENT_A)).toBe(true);
    expect(can(managerOfA, "event.registration.manage", EVENT_B)).toBe(false);
    expect(can(admin, "event.registration.manage", EVENT_B)).toBe(true);
    expect(can(staffOfA, "event.registration.view", EVENT_A)).toBe(false);
    expect(can(staffOfA, "event.registration.manage", EVENT_A)).toBe(false);
    expect(can({ user: STAFF, memberships: [] }, "event.registration.view", EVENT_A)).toBe(false);
  });

  it("lets administrators change access on any event", () => {
    expect(can(admin, "event.access.change", EVENT_A)).toBe(true);
    expect(can(admin, "event.manage", EVENT_B)).toBe(true);
  });

  it("gives an outsider nothing on an event", () => {
    const outsider: Viewer = { user: STAFF, memberships: [] };
    expect(can(outsider, "event.view", EVENT_A)).toBe(false);
    expect(can(outsider, "credential.issue", EVENT_A)).toBe(false);
  });
});

describe("viewerOf", () => {
  it("is null until the session is known", () => {
    expect(viewerOf({ status: "loading" })).toBeNull();
    expect(viewerOf({ status: "anonymous" })).toBeNull();
    expect(viewerOf({ status: "signed-in", user: MANAGER, memberships: [] })).toEqual({ user: MANAGER, memberships: [] });
  });
});
