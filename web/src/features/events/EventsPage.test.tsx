import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import { EventsPage } from "./EventsPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, listEvents: vi.fn() } };
});

const mocked = vi.mocked(api);

const camp = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "youth-2026",
  name: "Youth Camp 2026",
  kind: "church_camp" as const,
  timezone: "Africa/Lusaka",
  status: "open" as const,
  startsOn: "2026-12-01",
  endsOn: "2026-12-05",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsPage />
    </MemoryRouter>
  );
}

describe("EventsPage", () => {
  beforeEach(() => mocked.listEvents.mockReset());

  it("lists the events the API returns, with links to their pages", async () => {
    mocked.listEvents.mockResolvedValue({ events: [camp] });
    renderPage();
    const link = await screen.findByRole("link", { name: "Youth Camp 2026" });
    expect(link).toHaveAttribute("href", `/events/${camp.id}`);
    expect(screen.getByText("2026-12-01 to 2026-12-05 · open")).toBeInTheDocument();
  });

  it("says so when there are no events", async () => {
    mocked.listEvents.mockResolvedValue({ events: [] });
    renderPage();
    expect(await screen.findByText("No events yet.")).toBeInTheDocument();
  });

  it("shows the server's message when the list cannot be loaded", async () => {
    mocked.listEvents.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Forbidden"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  });
});
