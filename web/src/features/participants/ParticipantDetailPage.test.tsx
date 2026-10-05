import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { CampEvent, Credential, Group, Membership, Participant } from "../../services/types";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { ParticipantDetailPage } from "./ParticipantDetailPage";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QUJD") },
}));

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      getParticipant: vi.fn(),
      getEvent: vi.fn(),
      listGroups: vi.fn(),
      listCredentials: vi.fn(),
      updateParticipant: vi.fn(),
      issueCredential: vi.fn(),
      replaceCredential: vi.fn(),
      revokeCredential: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);
const TOKEN_1 = "EP1:" + "A".repeat(43);
const TOKEN_2 = "EP1:" + "B".repeat(43);
const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };
const GROUP: Group = { id: "g-1", eventId: "e-1", name: "Church A", kind: "church" };
const PARTICIPANT: Participant = {
  id: "p-1", eventId: "e-1", personId: "person-1", fullName: "Michael Banda", groupId: "g-1", role: "camper", status: "registered", registeredAt: "2027-12-01T08:00:00Z",
};

function credential(over: Partial<Credential>): Credential {
  return {
    id: "c-1", eventParticipantId: "p-1", kind: "qr", status: "active", tokenHint: "AAAA", issuedAt: "2027-12-01T08:00:00Z", expiresAt: null, revokedAt: null, replacedBy: null, ...over,
  };
}

function renderDetail(user: typeof MANAGER, memberships: Membership[] = [{ eventId: "e-1", role: "event_manager" }]) {
  return renderAs(<ParticipantDetailPage />, {
    user,
    memberships,
    path: "/event-participants/:participantId",
    route: "/event-participants/p-1",
  });
}

function loadWith(credentials: Credential[], participant: Participant = PARTICIPANT) {
  mocked.getParticipant.mockResolvedValue({ participant });
  mocked.getEvent.mockResolvedValue({ event: EVENT });
  mocked.listGroups.mockResolvedValue({ groups: [GROUP] });
  mocked.listCredentials.mockResolvedValue({ credentials });
}

describe("ParticipantDetailPage", () => {
  beforeEach(() => {
    vi.mocked(QRCode.toDataURL).mockClear();
    for (const fn of [mocked.getParticipant, mocked.getEvent, mocked.listGroups, mocked.listCredentials, mocked.updateParticipant, mocked.issueCredential, mocked.replaceCredential, mocked.revokeCredential]) {
      fn.mockReset();
    }
  });

  it("issues a credential, shows its QR pass once, and never prints the token as text", async () => {
    loadWith([]);
    mocked.issueCredential.mockResolvedValue({ credential: credential({ id: "c-1", tokenHint: "AAAA" }), token: TOKEN_1 });
    renderDetail(MANAGER);
    await userEvent.click(await screen.findByRole("button", { name: "Issue credential" }));
    expect(await screen.findByAltText("QR pass for Michael Banda")).toBeInTheDocument();
    expect(mocked.issueCredential).toHaveBeenCalledWith("p-1");
    expect(vi.mocked(QRCode.toDataURL).mock.calls.at(-1)?.[0]).toBe(TOKEN_1);
    expect(document.body.textContent).not.toContain(TOKEN_1);
  });

  it("replaces a credential: the old pass is revoked and the QR encodes the new token", async () => {
    loadWith([credential({ id: "c-1", tokenHint: "AAAA" })]);
    mocked.replaceCredential.mockResolvedValue({ credential: credential({ id: "c-2", tokenHint: "BBBB" }), token: TOKEN_2 });
    mocked.listCredentials
      .mockResolvedValueOnce({ credentials: [credential({ id: "c-1", tokenHint: "AAAA" })] })
      .mockResolvedValueOnce({
        credentials: [credential({ id: "c-1", status: "replaced", tokenHint: "AAAA", replacedBy: "c-2" }), credential({ id: "c-2", tokenHint: "BBBB" })],
      });
    renderDetail(MANAGER);
    await userEvent.click(await screen.findByRole("button", { name: "Replace" }));
    expect(await screen.findByText("Credential replaced. The old pass no longer works.")).toBeInTheDocument();
    expect(mocked.replaceCredential).toHaveBeenCalledWith("c-1");
    expect(vi.mocked(QRCode.toDataURL).mock.calls.at(-1)?.[0]).toBe(TOKEN_2);
    const oldRow = screen.getByText("…AAAA").closest("li")!;
    expect(oldRow).toHaveTextContent("replaced");
    expect(within(oldRow).queryByRole("button")).toBeNull();
  });

  it("revokes a credential and removes the pass from the screen", async () => {
    loadWith([credential({ id: "c-1" })]);
    mocked.revokeCredential.mockResolvedValue({ credential: credential({ id: "c-1", status: "revoked" }) });
    mocked.listCredentials
      .mockResolvedValueOnce({ credentials: [credential({ id: "c-1" })] })
      .mockResolvedValueOnce({ credentials: [credential({ id: "c-1", status: "revoked" })] });
    renderDetail(MANAGER);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Credential revoked.")).toBeInTheDocument();
    expect(mocked.revokeCredential).toHaveBeenCalledWith("c-1");
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.getByRole("button", { name: "Issue credential" })).toBeInTheDocument();
  });

  it("lets staff issue and replace, but not change the group or revoke", async () => {
    loadWith([credential({ id: "c-1" })]);
    renderDetail(STAFF, [{ eventId: "e-1", role: "staff" }]);
    expect(await screen.findByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save group" })).toBeNull();
  });

  it("does not offer a credential to a cancelled participant", async () => {
    loadWith([], { ...PARTICIPANT, status: "cancelled" });
    renderDetail(MANAGER);
    await screen.findByText("No credential issued yet.");
    expect(screen.queryByRole("button", { name: "Issue credential" })).toBeNull();
  });

  it("shows the server's message when a credential is already active", async () => {
    loadWith([]);
    mocked.issueCredential.mockRejectedValue(new ApiError(409, "CREDENTIAL_ALREADY_ACTIVE", "This participant already has an active credential; replace it instead"));
    renderDetail(ADMIN, []);
    await userEvent.click(await screen.findByRole("button", { name: "Issue credential" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("replace it instead");
  });

  it("saves a new group for the participant", async () => {
    loadWith([]);
    mocked.updateParticipant.mockResolvedValue({ participant: { ...PARTICIPANT, groupId: null } });
    renderDetail(MANAGER);
    const saveButton = await screen.findByRole("button", { name: "Save group" });
    await userEvent.selectOptions(within(saveButton.parentElement!).getByLabelText("Group"), "");
    await userEvent.click(saveButton);
    await waitFor(() => expect(mocked.updateParticipant).toHaveBeenCalledWith("p-1", { groupId: null }));
    expect(await screen.findByText("Group saved.")).toBeInTheDocument();
  });
});
