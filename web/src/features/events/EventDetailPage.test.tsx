import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { CampEvent, Group, Participant } from "../../services/types";
import { MANAGER, renderAs } from "../../test/session";
import { EventDetailPage } from "./EventDetailPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn(), getEvent: vi.fn(), listParticipants: vi.fn(), listGroups: vi.fn() } };
});

const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };
const MEMBERSHIP = [{ eventId: EVENT.id, role: "event_manager" as const }];

const person = (i: number) =>
  ({ id: `p-${i}`, eventId: EVENT.id, personId: `x-${i}`, fullName: `Camper ${i}`, groupId: null, role: "camper", status: "registered", registeredAt: "2027-11-01T00:00:00Z" }) as Participant;
const group = (i: number) => ({ id: `g-${i}`, eventId: EVENT.id, name: `Group ${i}`, kind: "team" }) as Group;

function renderOverview() {
  return renderAs(<EventDetailPage />, { user: MANAGER, memberships: MEMBERSHIP, path: "/events/:eventId", route: `/events/${EVENT.id}` });
}

beforeEach(() => {
  vi.mocked(api.getEvent).mockResolvedValue({ event: EVENT });
  vi.mocked(api.listParticipants).mockResolvedValue({ participants: [person(1), person(2), person(3)] });
  vi.mocked(api.listGroups).mockResolvedValue({ groups: [group(1)] });
});

describe("event overview", () => {
  it("shows the participant and group totals from the event's own lists", async () => {
    renderOverview();
    expect(await screen.findByText("Participants", { selector: ".metric-label" })).toBeInTheDocument();
    expect(screen.getByText("3", { selector: ".metric-value" })).toBeInTheDocument();
    expect(screen.getByText("Groups", { selector: ".metric-label" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".metric-value" })).toBeInTheDocument();
    expect(screen.getByText("Event manager")).toBeInTheDocument();
  });

  it("leaves out a total whose list cannot be loaded, rather than showing zero", async () => {
    vi.mocked(api.listGroups).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Forbidden"));
    renderOverview();
    expect(await screen.findByText("Participants", { selector: ".metric-label" })).toBeInTheDocument();
    expect(screen.queryByText("Groups", { selector: ".metric-label" })).toBeNull();
  });

  it("shows no registration card: registration is not built yet", async () => {
    renderOverview();
    await screen.findByText("Participants", { selector: ".metric-label" });
    expect(screen.queryByText(/registration/i)).toBeNull();
  });
});
