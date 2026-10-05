import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { EventShell } from "./EventShell";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn(), getEvent: vi.fn() } };
});

const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };

beforeEach(() => {
  vi.mocked(api.getEvent).mockResolvedValue({ event: EVENT });
});

function tabs(user: typeof ADMIN, memberships: { eventId: string; role: "event_manager" | "staff" }[] = []) {
  renderAs(<EventShell />, { user, memberships, path: "/events/:eventId", route: `/events/${EVENT.id}` });
  return screen.findByRole("navigation", { name: "Event sections" }).then((nav) => nav.textContent);
}

describe("event shell", () => {
  it("shows the event's name, dates, and status, with breadcrumbs that end at the event", async () => {
    renderAs(<EventShell />, { user: ADMIN, path: "/events/:eventId", route: `/events/${EVENT.id}` });
    expect(await screen.findByText("Youth Camp", { selector: ".event-name" })).toBeInTheDocument();
    expect(screen.getByText("2027-12-01 to 2027-12-05 · Africa/Lusaka")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Youth Camp", { selector: "[aria-current=page]" })).toBeInTheDocument();
  });

  it("gives an administrator every section, including Settings", async () => {
    expect(await tabs(ADMIN)).toBe("OverviewParticipantsGroupsAccessSettings");
  });

  it("gives an event manager the event sections but not Settings", async () => {
    expect(await tabs(MANAGER, [{ eventId: EVENT.id, role: "event_manager" }])).toBe("OverviewParticipantsGroupsAccess");
  });

  it("hides Access from staff, who cannot see the access list", async () => {
    expect(await tabs(STAFF, [{ eventId: EVENT.id, role: "staff" }])).toBe("OverviewParticipantsGroups");
  });
});
