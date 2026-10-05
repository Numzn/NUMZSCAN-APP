import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { Group, Membership, Participant } from "../../services/types";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { RegisterParticipantPage } from "./RegisterParticipantPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), listGroups: vi.fn(), searchPeople: vi.fn(), createParticipant: vi.fn() },
  };
});

const mocked = vi.mocked(api);
const GROUP: Group = { id: "g-1", eventId: "e-1", name: "Church A", kind: "church" };
const PARTICIPANT: Participant = {
  id: "p-1", eventId: "e-1", personId: "person-1", fullName: "Michael Banda", groupId: null, role: "camper", status: "registered", registeredAt: "2027-12-01T08:00:00Z",
};

function renderRegister(user: typeof MANAGER, memberships: Membership[] = [{ eventId: "e-1", role: "event_manager" }]) {
  return renderAs(<RegisterParticipantPage />, {
    user,
    memberships,
    path: "/events/:eventId/participants/new",
    route: "/events/e-1/participants/new",
  });
}

describe("RegisterParticipantPage", () => {
  beforeEach(() => {
    mocked.listGroups.mockReset().mockResolvedValue({ groups: [GROUP] });
    mocked.searchPeople.mockReset();
    mocked.createParticipant.mockReset();
  });

  it("keeps staff out of registration", async () => {
    renderRegister(STAFF, [{ eventId: "e-1", role: "staff" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only event managers can register participants.");
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
  });

  it("needs at least two letters before it searches", async () => {
    renderRegister(MANAGER);
    const search = await screen.findByRole("button", { name: "Search" });
    expect(search).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Find an existing person"), "M");
    expect(search).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Find an existing person"), "i");
    expect(search).toBeEnabled();
  });

  it("reuses an existing person found by search, instead of creating a duplicate", async () => {
    mocked.searchPeople.mockResolvedValue({ people: [{ id: "person-1", fullName: "Michael Banda" }] });
    mocked.createParticipant.mockResolvedValue({ participant: PARTICIPANT });
    renderRegister(MANAGER);
    await userEvent.type(await screen.findByLabelText("Find an existing person"), "Mich");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this person" }));
    expect(screen.queryByLabelText("Full name")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() => expect(mocked.createParticipant).toHaveBeenCalledWith("e-1", { personId: "person-1", groupId: null }));
  });

  it("creates a new person with a group when no match exists", async () => {
    mocked.searchPeople.mockResolvedValue({ people: [] });
    mocked.createParticipant.mockResolvedValue({ participant: PARTICIPANT });
    renderRegister(ADMIN, []);
    await userEvent.type(await screen.findByLabelText("Find an existing person"), "Zed");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/No one matches/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create a new person" }));
    await userEvent.type(screen.getByLabelText("Full name"), "Zed Phiri");
    await userEvent.selectOptions(screen.getByLabelText("Group (optional)"), "g-1");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    await waitFor(() =>
      expect(mocked.createParticipant).toHaveBeenCalledWith("e-1", { person: { fullName: "Zed Phiri", phone: undefined }, groupId: "g-1" })
    );
  });

  it("shows the server's message when the person is already registered for this event", async () => {
    mocked.searchPeople.mockResolvedValue({ people: [{ id: "person-1", fullName: "Michael Banda" }] });
    mocked.createParticipant.mockRejectedValue(new ApiError(409, "DUPLICATE_PARTICIPATION", "This person is already registered for this event"));
    renderRegister(MANAGER);
    await userEvent.type(await screen.findByLabelText("Find an existing person"), "Mich");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Use this person" }));
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This person is already registered for this event");
  });
});
