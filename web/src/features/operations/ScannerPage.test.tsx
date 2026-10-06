import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { Checkpoint, Membership, Occurrence, ScanResult } from "../../services/types";
import { MANAGER, STAFF, renderAs } from "../../test/session";
import { ScannerPage } from "./ScannerPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), checkpoints: vi.fn(), occurrences: vi.fn(), scan: vi.fn() },
  };
});

vi.mock("./cameraReader", () => ({
  startCameraReader: vi.fn(),
}));

import { startCameraReader } from "./cameraReader";

const TOKEN = "EP1:" + "b".repeat(43);
const CHECKPOINT: Checkpoint = { id: "cp-1", eventId: "e-1", name: "Lunch", kind: "meal", ruleType: "once_per_occurrence", active: true, hasScans: false };
const CLOSED: Checkpoint = { ...CHECKPOINT, id: "cp-2", name: "Closed gate", active: false };
const OCCURRENCE: Occurrence = { id: "oc-1", checkpointId: "cp-1", label: "Day 1 lunch", startsAt: "2026-12-02T11:00:00Z", endsAt: "2026-12-02T13:00:00Z", serviceDate: "2026-12-02" };

const ok = (over: Partial<ScanResult> = {}): ScanResult => ({
  replayed: false,
  operation: "meal",
  participant: { id: "p-1", fullName: "Michael Banda", groupName: "Church A", status: "registered" },
  interaction: { id: "i-1", outcome: "accepted", reason: null },
  ...over,
});

function renderScanner(user = STAFF, memberships: Membership[] = [{ eventId: "e-1", role: "staff" }]) {
  return renderAs(<ScannerPage />, { user, memberships, path: "/events/:eventId/scanner", route: "/events/e-1/scanner" });
}

async function pickLunch() {
  await screen.findByRole("option", { name: "Lunch" });
  await userEvent.selectOptions(screen.getByLabelText("Checkpoint"), "cp-1");
  await screen.findByRole("option", { name: /Day 1 lunch/ });
  await userEvent.selectOptions(screen.getByLabelText("Service time"), "oc-1");
}

beforeEach(() => {
  vi.mocked(api.checkpoints).mockReset();
  vi.mocked(api.checkpoints).mockResolvedValue({ checkpoints: [CHECKPOINT, CLOSED] });
  vi.mocked(api.occurrences).mockResolvedValue({ occurrences: [OCCURRENCE] });
  vi.mocked(api.scan).mockReset();
  vi.mocked(startCameraReader).mockReset();
});

describe("scanner", () => {
  it("offers only open checkpoints", async () => {
    renderScanner();
    await screen.findByRole("option", { name: "Lunch" });
    expect(screen.queryByRole("option", { name: "Closed gate" })).toBeNull();
  });

  it("a valid pass is recorded and the result is clear", async () => {
    vi.mocked(api.scan).mockResolvedValue(ok());
    renderScanner();
    await pickLunch();
    await userEvent.type(screen.getByLabelText("Pass code"), TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("Meal recorded for Michael Banda.")).toBeInTheDocument();
    expect(api.scan).toHaveBeenCalledWith("e-1", expect.objectContaining({ credential: TOKEN, checkpointId: "cp-1", occurrenceId: "oc-1" }));
  });

  it("a malformed code is refused on the page, without sending anything", async () => {
    renderScanner();
    await pickLunch();
    await userEvent.type(screen.getByLabelText("Pass code"), "not-a-pass");
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("That is not a valid pass code.")).toBeInTheDocument();
    expect(api.scan).not.toHaveBeenCalled();
  });

  it("a refused pass explains why, and names the person when the server gives the name", async () => {
    vi.mocked(api.scan).mockRejectedValue(
      new ApiError(409, "ALREADY_CHECKED_IN", "already", { participant: { fullName: "Ruth Mwansa" } })
    );
    renderScanner(MANAGER, [{ eventId: "e-1", role: "event_manager" }]);
    await pickLunch();
    await userEvent.type(screen.getByLabelText("Pass code"), TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ruth Mwansa is already checked in.");
  });

  it("a dropped connection keeps the same attempt, so pressing again does not record twice", async () => {
    vi.mocked(api.scan).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    renderScanner();
    await pickLunch();
    await userEvent.type(screen.getByLabelText("Pass code"), TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not sent");
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("Meal recorded for Michael Banda.")).toBeInTheDocument();
    const [first, second] = vi.mocked(api.scan).mock.calls;
    expect(first[1].id).toBe(second[1].id);
  });

  it("a new pass after a refusal gets a new attempt", async () => {
    vi.mocked(api.scan).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok({ participant: { id: "p-2", fullName: "Second Person", groupName: null, status: "registered" } }));
    renderScanner();
    await pickLunch();
    await userEvent.type(screen.getByLabelText("Pass code"), TOKEN);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await screen.findByText("Meal recorded for Michael Banda.");
    await userEvent.type(screen.getByLabelText("Pass code"), "EP1:" + "c".repeat(43));
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    await screen.findByText("Meal recorded for Second Person.");
    const [first, second] = vi.mocked(api.scan).mock.calls;
    expect(first[1].id).not.toBe(second[1].id);
  });

  it("without a camera, the manual code entry still works, and the page says why", async () => {
    vi.mocked(startCameraReader).mockRejectedValue(new Error("permission denied"));
    renderScanner();
    await pickLunch();
    await userEvent.click(screen.getByRole("button", { name: "Use camera" }));
    expect(await screen.findByText(/camera is not available/)).toBeInTheDocument();
    expect(screen.getByLabelText("Pass code")).toBeInTheDocument();
  });

  it("scanning needs a checkpoint and a service time first", async () => {
    renderScanner();
    await screen.findByRole("option", { name: "Lunch" });
    expect(screen.getByRole("button", { name: "Record" })).toBeDisabled();
  });

  it("someone with no role on the event cannot use the scanner", async () => {
    renderScanner(STAFF, []);
    expect(await screen.findByRole("alert")).toHaveTextContent("You need a role on this event to scan.");
    expect(api.checkpoints).not.toHaveBeenCalled();
  });

  it("the camera reader is stopped when the page is left", async () => {
    const stop = vi.fn();
    vi.mocked(startCameraReader).mockResolvedValue({ stop });
    const { unmount } = renderScanner();
    await pickLunch();
    await userEvent.click(screen.getByRole("button", { name: "Use camera" }));
    await screen.findByRole("button", { name: "Stop camera" });
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(within(document.body).queryByText("Scanner")).toBeNull();
  });
});
