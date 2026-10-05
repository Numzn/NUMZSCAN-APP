import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { CampEvent, Group, Membership } from "../../services/types";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { GroupsPage } from "./GroupsPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), getEvent: vi.fn(), listGroups: vi.fn(), createGroup: vi.fn() },
  };
});

const mocked = vi.mocked(api);
const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };
const GROUP: Group = { id: "g-1", eventId: "e-1", name: "Church A", kind: "church" };

function renderGroups(user: typeof MANAGER, memberships: Membership[] = [{ eventId: "e-1", role: "event_manager" }]) {
  return renderAs(<GroupsPage />, { user, memberships, path: "/events/:eventId/groups", route: "/events/e-1/groups" });
}

describe("GroupsPage", () => {
  beforeEach(() => {
    mocked.getEvent.mockReset().mockResolvedValue({ event: EVENT });
    mocked.listGroups.mockReset().mockResolvedValue({ groups: [GROUP] });
    mocked.createGroup.mockReset();
  });

  it("lists the event's groups", async () => {
    renderGroups(MANAGER);
    expect(await screen.findByText("Church A")).toBeInTheDocument();
  });

  it("lets a manager add a group and then shows it in the list", async () => {
    mocked.createGroup.mockResolvedValue({ group: { ...GROUP, id: "g-2", name: "Dorm 1", kind: "dorm" } });
    mocked.listGroups
      .mockResolvedValueOnce({ groups: [GROUP] })
      .mockResolvedValueOnce({ groups: [GROUP, { ...GROUP, id: "g-2", name: "Dorm 1", kind: "dorm" }] });
    renderGroups(MANAGER);
    await screen.findByText("Church A");
    await userEvent.type(screen.getByLabelText("Name"), "Dorm 1");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "dorm");
    await userEvent.click(screen.getByRole("button", { name: "Add group" }));
    await waitFor(() => expect(mocked.createGroup).toHaveBeenCalledWith("e-1", { name: "Dorm 1", kind: "dorm" }));
    expect(await screen.findByText("Dorm 1")).toBeInTheDocument();
  });

  it("shows the server's message when a group name is taken", async () => {
    mocked.createGroup.mockRejectedValue(new ApiError(409, "GROUP_NAME_TAKEN", "A group with this name already exists"));
    renderGroups(ADMIN, []);
    await screen.findByText("Church A");
    await userEvent.type(screen.getByLabelText("Name"), "Church A");
    await userEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A group with this name already exists");
  });

  it("hides the add form from staff", async () => {
    renderGroups(STAFF, [{ eventId: "e-1", role: "staff" }]);
    expect(await screen.findByText("Church A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
  });
});
