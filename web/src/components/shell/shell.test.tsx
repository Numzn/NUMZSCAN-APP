import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigationFor } from "../../app/navigation";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { PageHeader } from "../PageHeader";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn() } };
});
import { AppShell } from "./AppShell";

// Simulates a phone (below the 1100px desktop breakpoint) or a desktop window.
function viewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width: 1100px") ? desktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  delete (window as Partial<Window>).matchMedia;
  document.documentElement.classList.remove("drawer-open");
});

const viewer = (user: typeof ADMIN, memberships: { eventId: string; role: "event_manager" | "staff" }[] = []) => ({ user, memberships });

describe("navigation definition", () => {
  it("shows administrators the new-event action and the whole administration section", () => {
    const sections = navigationFor(viewer(ADMIN));
    expect(sections.map((s) => s.title)).toEqual(["Workspace", "Administration"]);
    expect(sections[0].items.map((i) => i.label)).toEqual(["Events", "New event"]);
    expect(sections[1].items.map((i) => i.label)).toEqual(["Overview", "Users", "Manage events", "Audit log"]);
  });

  it("shows managers and staff only the events they work on", () => {
    expect(navigationFor(viewer(MANAGER, [{ eventId: "e", role: "event_manager" }]))).toEqual([
      expect.objectContaining({ title: "Workspace", items: [expect.objectContaining({ label: "Events" })] }),
    ]);
    expect(navigationFor(viewer(STAFF, [{ eventId: "e", role: "staff" }]))[0].items.map((i) => i.label)).toEqual(["Events"]);
  });

  it("marks Events current for event pages but not for the new-event page", () => {
    const events = navigationFor(viewer(ADMIN))[0].items[0];
    expect(events.match("/events/abc/groups")).toBe(true);
    expect(events.match("/events/new")).toBe(false);
  });
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
    renderAs(<AppShell />, { user: MANAGER, memberships: [{ eventId: "e", role: "event_manager" }], path: "*", route: "/events" });
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
