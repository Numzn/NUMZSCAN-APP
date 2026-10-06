import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import type { AttendanceSummary, Participant } from "../../services/types";
import { STAFF, renderAs } from "../../test/session";
import { AttendancePage } from "./AttendancePage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), attendance: vi.fn(), listParticipants: vi.fn(), listGroups: vi.fn() },
  };
});

const SUMMARY: AttendanceSummary = {
  counts: { registered: 1, checked_in: 1, departed: 0, cancelled: 0 },
  byGroup: [{ groupName: "Church A", total: 2, checkedIn: 1, departed: 0 }],
  byCheckpoint: [{ checkpointId: "cp-1", name: "Lunch", kind: "meal", accepted: 3, duplicate: 1, refused: 0 }],
  meals: [{ name: "Lunch", served: 3 }],
};

const people: Participant[] = [
  { id: "p-1", eventId: "e-1", personId: "x", fullName: "Michael Banda", groupId: "g-1", role: "camper", status: "checked_in", registeredAt: "" },
  { id: "p-2", eventId: "e-1", personId: "y", fullName: "Ruth Mwansa", groupId: null, role: "camper", status: "registered", registeredAt: "" },
];

beforeEach(() => {
  vi.mocked(api.attendance).mockResolvedValue(SUMMARY);
  vi.mocked(api.listParticipants).mockResolvedValue({ participants: people });
  vi.mocked(api.listGroups).mockResolvedValue({ groups: [{ id: "g-1", eventId: "e-1", name: "Church A", kind: "church" }] });
});

function renderPage() {
  return renderAs(<AttendancePage />, { user: STAFF, memberships: [{ eventId: "e-1", role: "staff" }], path: "/events/:eventId/attendance", route: "/events/e-1/attendance" });
}

describe("attendance", () => {
  it("shows who is checked in, by status and by group", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "By group" })).toBeInTheDocument();
    const groups = screen.getByRole("table", { name: "Attendance by group" });
    expect(within(groups).getByText("Church A")).toBeInTheDocument();
    expect(within(groups).getByText("2")).toBeInTheDocument();
  });

  it("shows meals and checkpoint activity, including duplicates", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Scans by checkpoint" });
    expect(within(table).getByText("Lunch")).toBeInTheDocument();
    expect(within(table).getByText("3")).toBeInTheDocument();
    expect(within(table).getByText("1")).toBeInTheDocument();
  });

  it("finds a participant by name and shows their status", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Find a participant" });
    await userEvent.type(screen.getByLabelText("Name"), "ruth");
    const link = await screen.findByRole("link", { name: "Ruth Mwansa" });
    expect(within(link.closest("li") as HTMLElement).getByText("Registered")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Michael Banda" })).toBeNull();
  });

  it("offers a way to the scanner", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Open scanner" })).toHaveAttribute("href", "/events/e-1/scanner");
  });
});
