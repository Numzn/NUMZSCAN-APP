import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { ADMIN, MANAGER, renderAs } from "../../test/session";
import { EventShell } from "./EventShell";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn(), getEvent: vi.fn() } };
});

const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };

beforeEach(() => {
  vi.mocked(api.getEvent).mockResolvedValue({ event: EVENT });
});

describe("event shell", () => {
  it("shows the event's name, dates, and status, with breadcrumbs that end at the event", async () => {
    renderAs(<EventShell />, { user: ADMIN, path: "/events/:eventId", route: `/events/${EVENT.id}` });
    expect(await screen.findByText("Youth Camp", { selector: ".event-name" })).toBeInTheDocument();
    expect(screen.getByText("1 Dec – 5 Dec 2027 · Africa/Lusaka")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Youth Camp", { selector: "[aria-current=page]" })).toBeInTheDocument();
  });

  it("names the section in the breadcrumbs, so the trail reads Events, event, section", async () => {
    renderAs(<EventShell />, { user: MANAGER, memberships: [{ eventId: EVENT.id, role: "event_manager" }], path: "/events/:eventId/*", route: `/events/${EVENT.id}/groups` });
    const trail = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
    expect(within(trail).getByRole("link", { name: "Youth Camp" })).toHaveAttribute("href", `/events/${EVENT.id}`);
    expect(within(trail).getByText("Groups")).toHaveAttribute("aria-current", "page");
  });

  it("does not repeat the event's sections as a second row of tabs; the sidebar carries them", async () => {
    renderAs(<EventShell />, { user: ADMIN, path: "/events/:eventId", route: `/events/${EVENT.id}` });
    await screen.findByText("Youth Camp", { selector: ".event-name" });
    expect(screen.queryByRole("navigation", { name: "Event sections" })).toBeNull();
  });
});
