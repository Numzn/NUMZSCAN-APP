import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";
import { NavTabs } from "./NavTabs";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as the only h1 and sets the browser tab title from it", async () => {
    render(
      <MemoryRouter>
        <PageHeader title="Participants" />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Participants" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Participants · EventPass"));
  });

  it("shows breadcrumbs only when the page is more than one level deep", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PageHeader title="Events" crumbs={[{ label: "Events" }]} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    rerender(
      <MemoryRouter>
        <PageHeader title="Groups" crumbs={[{ label: "Events", to: "/events" }, { label: "Groups" }]} />
      </MemoryRouter>
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});

describe("Breadcrumbs", () => {
  it("links every item except the last, which is the current page", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: "Events", to: "/events" }, { label: "Youth Camp", to: "/events/1" }, { label: "Groups" }]} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "Youth Camp" })).toHaveAttribute("href", "/events/1");
    const current = screen.getByText("Groups");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });
});

describe("NavTabs", () => {
  it("marks the active section as the current page", () => {
    render(
      <MemoryRouter initialEntries={["/events/1/groups"]}>
        <NavTabs label="Event sections" items={[{ to: "/events/1", label: "Overview", end: true }, { to: "/events/1/groups", label: "Groups" }]} />
      </MemoryRouter>
    );
    expect(screen.getByRole("navigation", { name: "Event sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current", "page");
  });
});
