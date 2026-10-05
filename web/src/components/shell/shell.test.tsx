import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { PageHeader } from "../PageHeader";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn(), listEvents: vi.fn() } };
});
import { AppShell } from "./AppShell";

const CAMP = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp" as const, timezone: "Africa/Lusaka", status: "open" as const, startsOn: "2027-12-01", endsOn: "2027-12-05" };

// Simulates a phone (below the 1100px desktop breakpoint) or a desktop window.
function viewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width: 1100px") ? desktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.mocked(api.listEvents).mockResolvedValue({ events: [CAMP] });
});

afterEach(() => {
  delete (window as Partial<Window>).matchMedia;
  document.documentElement.classList.remove("drawer-open");
});

describe("application shell", () => {
  it("shows the sidebar with the current page marked, and a skip link to the content", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: ADMIN, path: "*", route: "/events" });
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Audit log" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("gives administration links to administrators only", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: MANAGER, memberships: [{ eventId: CAMP.id, role: "event_manager" }], path: "*", route: "/events" });
    await screen.findByRole("navigation", { name: "Main navigation" });
    expect(screen.queryByRole("link", { name: "Audit log" })).toBeNull();
    expect(screen.queryByRole("link", { name: "New event" })).toBeNull();
  });

  it("keeps the sidebar out of reach on a phone until the menu opens it, then closes on Escape", async () => {
    viewport(false);
    renderAs(<AppShell />, { user: ADMIN, path: "*", route: "/events" });
    const sidebar = await waitFor(() => {
      const element = document.getElementById("app-sidebar");
      expect(element).not.toBeNull();
      return element!;
    });
    expect(sidebar).toHaveAttribute("inert");
    const menu = screen.getByRole("button", { name: "Open navigation" });
    expect(menu).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(menu);
    expect(sidebar).not.toHaveAttribute("inert");
    expect(sidebar).toHaveClass("open");
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(document.documentElement).toHaveClass("drawer-open");
    expect(document.querySelector(".sidebar-brand")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(sidebar).not.toHaveClass("open"));
    expect(sidebar).toHaveAttribute("inert");
    expect(document.documentElement).not.toHaveClass("drawer-open");
    expect(menu).toHaveFocus();
  });

  it("closes the drawer when a navigation link is chosen", async () => {
    viewport(false);
    renderAs(<AppShell />, { user: ADMIN, path: "*", route: "/events" });
    await screen.findByRole("navigation", { name: "Main navigation" });
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    await userEvent.click(screen.getByRole("link", { name: "Audit log" }));
    await waitFor(() => expect(document.getElementById("app-sidebar")).not.toHaveClass("open"));
  });

  it("uses the full navigation without a menu button on desktop", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: ADMIN, path: "*", route: "/events" });
    await screen.findByRole("navigation", { name: "Main navigation" });
    expect(document.getElementById("app-sidebar")).not.toHaveAttribute("inert");
  });
});

describe("event manager workspace", () => {
  const managerOfCamp = [{ eventId: CAMP.id, role: "event_manager" as const }];

  it("shows the manager's event and the operations of the event they are in", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: MANAGER, memberships: managerOfCamp, path: "*", route: `/events/${CAMP.id}/groups` });
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    await within(nav).findByRole("link", { name: "Youth Camp" });
    expect(within(nav).getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Youth Camp" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Access" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Settings" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Credentials" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Registration" })).toBeNull();
  });

  it("offers an event's operations from its address, even before the event list has loaded it", async () => {
    viewport(true);
    vi.mocked(api.listEvents).mockRejectedValue(new Error("offline"));
    renderAs(<AppShell />, { user: MANAGER, memberships: managerOfCamp, path: "*", route: `/events/${CAMP.id}` });
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    expect(await within(nav).findByText("Your events could not be loaded.")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
  });

  it("names the current event in the topbar, linking to its overview", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: MANAGER, memberships: managerOfCamp, path: "*", route: `/events/${CAMP.id}/participants` });
    const topbar = await waitFor(() => {
      const header = document.querySelector("header.topbar");
      expect(header).toHaveTextContent("Youth Camp");
      return header!;
    });
    expect(within(topbar as HTMLElement).getByRole("link", { name: "Youth Camp" })).toHaveAttribute("href", `/events/${CAMP.id}`);
  });

  it("shows no event name in the topbar outside an event", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: MANAGER, memberships: managerOfCamp, path: "*", route: "/events" });
    await screen.findByRole("navigation", { name: "Main navigation" });
    await waitFor(() => expect(vi.mocked(api.listEvents)).toHaveBeenCalled());
    expect(document.querySelector("header.topbar .topbar-context")).toBeNull();
  });

  it("hides Access from staff, who cannot see the access list", async () => {
    viewport(true);
    renderAs(<AppShell />, { user: STAFF, memberships: [{ eventId: CAMP.id, role: "staff" }], path: "*", route: `/events/${CAMP.id}` });
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    await within(nav).findByRole("link", { name: "Groups" });
    expect(within(nav).queryByRole("link", { name: "Access" })).toBeNull();
  });

  it("closes the drawer when a manager chooses an event operation on a phone", async () => {
    viewport(false);
    renderAs(<AppShell />, { user: MANAGER, memberships: managerOfCamp, path: "*", route: `/events/${CAMP.id}` });
    await screen.findByRole("navigation", { name: "Main navigation" });
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    await userEvent.click(within(document.getElementById("app-sidebar")!).getByRole("link", { name: "Groups" }));
    await waitFor(() => expect(document.getElementById("app-sidebar")).not.toHaveClass("open"));
  });
});

describe("page heading", () => {
  it("moves focus to the page's heading when the page appears", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Groups" />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Groups" })).toHaveFocus();
  });
});
