import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import type { Checkpoint, Membership } from "../../services/types";
import { MANAGER, STAFF, renderAs } from "../../test/session";
import { CheckpointsPage } from "./CheckpointsPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      checkpoints: vi.fn(),
      createCheckpoint: vi.fn(),
      updateCheckpoint: vi.fn(),
      occurrences: vi.fn(),
      createOccurrence: vi.fn(),
    },
  };
});

const cp = (over: Partial<Checkpoint> = {}): Checkpoint => ({
  id: "cp-1", eventId: "e-1", name: "Lunch", kind: "meal", ruleType: "once_per_occurrence", active: true, hasScans: false, ...over,
});

function renderPage(user = MANAGER, memberships: Membership[] = [{ eventId: "e-1", role: "event_manager" }]) {
  return renderAs(<CheckpointsPage />, { user, memberships, path: "/events/:eventId/checkpoints", route: "/events/e-1/checkpoints" });
}

beforeEach(() => {
  vi.mocked(api.checkpoints).mockReset();
  vi.mocked(api.checkpoints).mockResolvedValue({ checkpoints: [cp()] });
  vi.mocked(api.occurrences).mockResolvedValue({ occurrences: [] });
  vi.mocked(api.createCheckpoint).mockReset();
  vi.mocked(api.updateCheckpoint).mockReset();
});

describe("checkpoint management", () => {
  it("lists checkpoints with their purpose, rule and status", async () => {
    renderPage();
    expect(await screen.findByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getAllByText("Once per service time").length).toBeGreaterThan(0);
  });

  it("creates a checkpoint with a purpose and a rule", async () => {
    vi.mocked(api.createCheckpoint).mockResolvedValue({ checkpoint: cp({ id: "cp-2", name: "Supper" }) });
    renderPage();
    await screen.findByText("Lunch");
    const form = screen.getByRole("heading", { name: "Add a checkpoint" }).closest("form") as HTMLElement;
    await userEvent.type(within(form).getByLabelText("Name"), "Supper");
    await userEvent.selectOptions(within(form).getByLabelText("Purpose"), "meal");
    await userEvent.click(within(form).getByRole("button", { name: "Add checkpoint" }));
    expect(api.createCheckpoint).toHaveBeenCalledWith("e-1", { name: "Supper", kind: "meal", ruleType: "once_per_occurrence" });
    expect(await screen.findByText("Checkpoint added.")).toBeInTheDocument();
  });

  it("switches a checkpoint off, so it takes no scans", async () => {
    vi.mocked(api.updateCheckpoint).mockResolvedValue({ checkpoint: cp({ active: false }) });
    renderPage();
    await screen.findByText("Lunch");
    await userEvent.click(screen.getByRole("button", { name: "Close checkpoint" }));
    expect(api.updateCheckpoint).toHaveBeenCalledWith("cp-1", { active: false });
    expect(await screen.findByText("Checkpoint closed. It takes no scans now.")).toBeInTheDocument();
  });

  it("locks purpose and rule once a checkpoint has scans, but still allows a rename", async () => {
    vi.mocked(api.checkpoints).mockResolvedValue({ checkpoints: [cp({ hasScans: true })] });
    vi.mocked(api.updateCheckpoint).mockResolvedValue({ checkpoint: cp({ hasScans: true, name: "Lunch hall" }) });
    renderPage();
    await screen.findByText("Has scans: purpose and rule are fixed");
    const row = screen.getByText("Lunch").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByText("Edit Lunch"));
    expect(within(row).getByLabelText("Purpose")).toBeDisabled();
    expect(within(row).getByLabelText("How often each person may be recorded")).toBeDisabled();
    const nameInput = within(row).getByDisplayValue("Lunch");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Lunch hall");
    await userEvent.click(within(row).getByRole("button", { name: "Save changes" }));
    expect(api.updateCheckpoint).toHaveBeenCalledWith("cp-1", { name: "Lunch hall" });
  });

  it("staff cannot manage checkpoints", async () => {
    renderPage(STAFF, [{ eventId: "e-1", role: "staff" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only event managers can manage checkpoints.");
    expect(api.checkpoints).not.toHaveBeenCalled();
  });

  it("refuses a service that ends before it starts, before anything is sent", async () => {
    vi.mocked(api.createOccurrence).mockReset();
    renderPage();
    await screen.findByText("Lunch");
    const row = screen.getByText("Lunch").closest("li") as HTMLElement;
    const form = within(row).getByRole("button", { name: "Add service time" }).closest("form") as HTMLElement;
    await userEvent.type(within(form).getByLabelText("Label"), "Day 1");
    await userEvent.type(within(form).getByLabelText("Date"), "2026-12-02");
    await userEvent.type(within(form).getByLabelText("Starts"), "14:00");
    await userEvent.type(within(form).getByLabelText("Ends"), "10:00");
    await userEvent.click(within(form).getByRole("button", { name: "Add service time" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("The service must end after it starts");
    expect(api.createOccurrence).not.toHaveBeenCalled();
  });
});
