import { describe, expect, it } from "vitest";
import type { Membership, User } from "../services/types";
import { eventIdFromPath, navigationFor, type NavOptions, type NavSection, type WorkspaceEvent } from "./navigation";
import type { Viewer } from "./policy";

const ADMIN_USER: User = { id: "u-admin", email: "admin@example.org", displayName: "Ada Admin", isAdmin: true };
const MANAGER_USER: User = { id: "u-mgr", email: "manager@example.org", displayName: "Grace", isAdmin: false };
const STAFF_USER: User = { id: "u-staff", email: "staff@example.org", displayName: "Sam", isAdmin: false };

const viewer = (user: User, memberships: Membership[]): Viewer => ({ user, memberships });

const CAMP: WorkspaceEvent = { id: "e-1", name: "Youth Camp" };
const OTHER: WorkspaceEvent = { id: "e-2", name: "Other Camp" };

function nav(user: User, memberships: Membership[], options: Partial<NavOptions> = {}): NavSection[] {
  return navigationFor(viewer(user, memberships), { events: [CAMP], eventsState: "ready", eventId: null, ...options });
}

const labels = (sections: NavSection[], title: string) => sections.find((s) => s.title === title)?.items.map((i) => i.label);

const managerOfCamp: Membership[] = [{ eventId: CAMP.id, role: "event_manager" }];
const staffOfCamp: Membership[] = [{ eventId: CAMP.id, role: "staff" }];

describe("administrator navigation", () => {
  it("keeps the platform view unchanged when no event is open", () => {
    const sections = nav(ADMIN_USER, [], { eventId: null });
    expect(sections.map((s) => s.title)).toEqual(["Workspace", "Administration"]);
    expect(labels(sections, "Workspace")).toEqual(["Events", "New event"]);
    expect(labels(sections, "Administration")).toEqual(["Overview", "Users", "Manage events", "Audit log"]);
  });

  it("adds the event's operations and setup between the workspace and administration, inside an event", () => {
    const sections = nav(ADMIN_USER, [], { eventId: CAMP.id });
    expect(sections.map((s) => s.title)).toEqual(["Workspace", "Event operations", "Event setup", "Administration"]);
    expect(labels(sections, "Event operations")).toEqual(["Overview", "Participants", "Registration", "Checkpoints", "Scanner", "Attendance", "Groups"]);
    expect(labels(sections, "Event setup")).toEqual(["Access", "Settings"]);
  });
});

describe("event manager navigation", () => {
  it("lists the events the manager is assigned to under My events", () => {
    const sections = nav(MANAGER_USER, managerOfCamp, { events: [CAMP] });
    expect(sections.map((s) => s.title)).toEqual(["My events"]);
    expect(labels(sections, "My events")).toEqual(["Youth Camp"]);
    expect(sections[0].items[0].to).toBe(`/events/${CAMP.id}`);
  });

  it("offers the operations and setup of the event it is inside, without Settings", () => {
    const sections = nav(MANAGER_USER, managerOfCamp, { eventId: CAMP.id });
    expect(sections.map((s) => s.title)).toEqual(["My events", "Event operations", "Event setup"]);
    expect(labels(sections, "Event operations")).toEqual(["Overview", "Participants", "Registration", "Checkpoints", "Scanner", "Attendance", "Groups"]);
    expect(labels(sections, "Event setup")).toEqual(["Access"]);
  });

  it("never offers the platform administration section", () => {
    const sections = nav(MANAGER_USER, managerOfCamp, { eventId: CAMP.id });
    expect(sections.some((s) => s.title === "Administration")).toBe(false);
    expect(labels(sections, "Workspace")).toBeUndefined();
  });

  it("says why the list is empty, while loading, on failure, and when nothing is assigned", () => {
    expect(nav(MANAGER_USER, [], { events: [], eventsState: "loading" })[0].note).toBe("Loading your events…");
    expect(nav(MANAGER_USER, [], { events: [], eventsState: "error" })[0].note).toBe("Your events could not be loaded.");
    expect(nav(MANAGER_USER, [], { events: [], eventsState: "ready" })[0].note).toBe("No events assigned to you yet.");
  });

  it("marks the event it is inside as current, and no other", () => {
    const sections = nav(MANAGER_USER, managerOfCamp, { events: [CAMP], eventId: CAMP.id });
    const myEvent = sections[0].items[0];
    expect(myEvent.match(`/events/${CAMP.id}/groups`)).toBe(true);
    expect(myEvent.match(`/events/${OTHER.id}`)).toBe(false);
  });

  it("gives an event the manager is not part of no operations", () => {
    const sections = nav(MANAGER_USER, managerOfCamp, { events: [CAMP], eventId: OTHER.id });
    expect(sections.map((s) => s.title)).toEqual(["My events"]);
  });
});

describe("staff navigation", () => {
  it("offers operations, scanning and attendance, but not checkpoint setup, Registration, Access or Settings", () => {
    const sections = nav(STAFF_USER, staffOfCamp, { eventId: CAMP.id });
    expect(labels(sections, "Event operations")).toEqual(["Overview", "Participants", "Scanner", "Attendance", "Groups"]);
    expect(sections.some((s) => s.title === "Event setup")).toBe(false);
    expect(sections.some((s) => s.title === "Administration")).toBe(false);
  });
});

describe("current item matching", () => {
  it("marks Overview only on the event's own address, and Participants on its pages", () => {
    const operations = nav(MANAGER_USER, managerOfCamp, { eventId: CAMP.id })[1].items;
    const [overview, participants] = operations;
    expect(overview.match(`/events/${CAMP.id}`)).toBe(true);
    expect(overview.match(`/events/${CAMP.id}/groups`)).toBe(false);
    expect(participants.match(`/events/${CAMP.id}/participants/new`)).toBe(true);
  });

  it("finds the event an address belongs to, and not the new-event page or the admin event page", () => {
    expect(eventIdFromPath(`/events/${CAMP.id}`)).toBe(CAMP.id);
    expect(eventIdFromPath(`/events/${CAMP.id}/participants/new`)).toBe(CAMP.id);
    expect(eventIdFromPath("/events/new")).toBeNull();
    expect(eventIdFromPath("/events")).toBeNull();
    expect(eventIdFromPath(`/admin/events/${CAMP.id}`)).toBeNull();
    expect(eventIdFromPath("/event-participants/p-1")).toBeNull();
  });
});

describe("what the navigation offers", () => {
  it("never offers a page that does not exist yet", () => {
    const everything = [
      nav(ADMIN_USER, [], { eventId: CAMP.id }),
      nav(MANAGER_USER, managerOfCamp, { eventId: CAMP.id }),
      nav(STAFF_USER, staffOfCamp, { eventId: CAMP.id }),
    ].flat();
    const offered = everything.flatMap((s) => s.items.map((i) => i.label));
    for (const future of ["Credentials", "Reports"]) {
      expect(offered).not.toContain(future);
    }
  });
});
