import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { AccessRow, AdminUser, AdminUserDetail, AuditEntry, CampEvent } from "../../services/types";
import { ADMIN, MANAGER, STAFF, renderAs } from "../../test/session";
import { AccessPage } from "../access/AccessPage";
import { AdminRoute } from "./AdminRoute";
import { AuditPage } from "./AuditPage";
import { EventSettingsPage } from "./EventSettingsPage";
import { UserDetailPage } from "./UserDetailPage";
import { UsersPage } from "./UsersPage";
import { describeEntry } from "./auditText";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      getEvent: vi.fn(),
      listEvents: vi.fn(),
      updateEvent: vi.fn(),
      adminListUsers: vi.fn(),
      adminCreateUser: vi.fn(),
      adminGetUser: vi.fn(),
      adminUpdateUser: vi.fn(),
      adminResetPassword: vi.fn(),
      adminRevokeSessions: vi.fn(),
      adminAudit: vi.fn(),
      listMemberships: vi.fn(),
      addMembership: vi.fn(),
      changeMembership: vi.fn(),
      removeMembership: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);
const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2027-12-01", endsOn: "2027-12-05" };
const PERSON: AdminUser = { id: "u-2", email: "grace@example.org", displayName: "Grace Manager", isAdmin: false, isActive: true, lastLoginAt: null };
const ROWS: AccessRow[] = [
  { userId: "u-2", email: "grace@example.org", displayName: "Grace Manager", role: "event_manager" },
  { userId: "u-3", email: "sam@example.org", displayName: "Sam Staff", role: "staff" },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("administrator area guard", () => {
  it("shows the same not-found page to a manager, so the area is not advertised", async () => {
    renderAs(<AdminRoute><p>secret admin content</p></AdminRoute>, { user: MANAGER, path: "/admin", route: "/admin" });
    expect(await screen.findByText("Page not found.")).toBeInTheDocument();
    expect(screen.queryByText("secret admin content")).toBeNull();
  });

  it("lets an administrator through", async () => {
    renderAs(<AdminRoute><p>admin content</p></AdminRoute>, { user: ADMIN, path: "/admin", route: "/admin" });
    expect(await screen.findByText("admin content")).toBeInTheDocument();
  });
});

describe("users", () => {
  it("refuses a password under 12 characters before calling the server", async () => {
    mocked.adminListUsers.mockResolvedValue({ users: [], total: 0 });
    renderAs(<UsersPage />, { user: ADMIN, path: "/admin/users", route: "/admin/users" });
    await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
    await userEvent.type(screen.getByLabelText("Email"), "new@example.org");
    await userEvent.type(screen.getByLabelText("Display name"), "New Person");
    await userEvent.type(screen.getByLabelText(/Initial password/), "short-pass1");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be at least 12 characters.");
    expect(mocked.adminCreateUser).not.toHaveBeenCalled();
  });

  it("creates a user and reminds the administrator to share the password in person", async () => {
    mocked.adminListUsers.mockResolvedValue({ users: [], total: 0 });
    mocked.adminCreateUser.mockResolvedValue({ user: { ...PERSON, displayName: "New Person", email: "new@example.org" } });
    renderAs(<UsersPage />, { user: ADMIN, path: "/admin/users", route: "/admin/users" });
    await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
    await userEvent.type(screen.getByLabelText("Email"), "new@example.org");
    await userEvent.type(screen.getByLabelText("Display name"), "New Person");
    await userEvent.type(screen.getByLabelText(/Initial password/), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(mocked.adminCreateUser).toHaveBeenCalledWith({ email: "new@example.org", displayName: "New Person", password: "a long enough password", isAdmin: false })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Share the password with them in person.");
  });

  it("does not let an administrator remove their own administrator access or deactivate themselves", async () => {
    const self: AdminUserDetail = { ...PERSON, id: ADMIN.id, displayName: "Ada Admin", isAdmin: true, access: [] };
    mocked.adminGetUser.mockResolvedValue({ user: self });
    renderAs(<UserDetailPage />, { user: ADMIN, path: "/admin/users/:userId", route: `/admin/users/${ADMIN.id}` });
    expect(await screen.findByText(/This is your account/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Administrator" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  it("deactivates another person only after a second, explicit confirmation", async () => {
    mocked.adminGetUser.mockResolvedValue({ user: { ...PERSON, access: [] } });
    mocked.adminUpdateUser.mockResolvedValue({ user: { ...PERSON, isActive: false } });
    renderAs(<UserDetailPage />, { user: ADMIN, path: "/admin/users/:userId", route: `/admin/users/${PERSON.id}` });
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    expect(mocked.adminUpdateUser).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot sign in until reactivated/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm deactivate" }));
    await waitFor(() => expect(mocked.adminUpdateUser).toHaveBeenCalledWith(PERSON.id, { isActive: false }));
  });

  it("shows the server's refusal when the last administrator would be removed", async () => {
    mocked.adminGetUser.mockResolvedValue({ user: { ...PERSON, access: [] } });
    mocked.adminUpdateUser.mockRejectedValue(new ApiError(409, "LAST_ADMIN", "At least one active administrator must remain"));
    renderAs(<UserDetailPage />, { user: ADMIN, path: "/admin/users/:userId", route: `/admin/users/${PERSON.id}` });
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm deactivate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("At least one active administrator must remain");
  });
});

describe("event access", () => {
  it("lets an event manager see the list read-only, with a note on who can change it", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    mocked.listMemberships.mockResolvedValue({ memberships: ROWS });
    renderAs(<AccessPage />, {
      user: MANAGER,
      memberships: [{ eventId: EVENT.id, role: "event_manager" }],
      path: "/events/:eventId/access",
      route: `/events/${EVENT.id}/access`,
    });
    expect(await screen.findByText("Grace Manager")).toBeInTheDocument();
    expect(screen.getByText(/Only administrators can add, change, or remove access/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add to event" })).toBeNull();
  });

  it("tells staff they cannot see the list, using the server's refusal", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    mocked.listMemberships.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Your role cannot perform this action"));
    renderAs(<AccessPage />, { user: STAFF, memberships: [{ eventId: EVENT.id, role: "staff" }], path: "/events/:eventId/access", route: `/events/${EVENT.id}/access` });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only administrators and this event's managers can see its access list.");
  });

  it("removes access only after a confirm step, and audits nothing from the page itself", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    mocked.listMemberships.mockResolvedValue({ memberships: ROWS });
    mocked.adminListUsers.mockResolvedValue({ users: [], total: 0 });
    mocked.removeMembership.mockResolvedValue(undefined);
    renderAs(<AccessPage />, { user: ADMIN, path: "/events/:eventId/access", route: `/events/${EVENT.id}/access` });
    const row = (await screen.findByText("Sam Staff")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(mocked.removeMembership).not.toHaveBeenCalled();
    await userEvent.click(within(row).getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(mocked.removeMembership).toHaveBeenCalledWith(EVENT.id, "u-3"));
  });

  it("changes a role through the server and reports the result", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    mocked.listMemberships.mockResolvedValue({ memberships: ROWS });
    mocked.adminListUsers.mockResolvedValue({ users: [], total: 0 });
    mocked.changeMembership.mockResolvedValue({ membership: { ...ROWS[1], role: "event_manager" } });
    renderAs(<AccessPage />, { user: ADMIN, path: "/events/:eventId/access", route: `/events/${EVENT.id}/access` });
    await userEvent.selectOptions(await screen.findByLabelText("Role for Sam Staff"), "event_manager");
    await waitFor(() => expect(mocked.changeMembership).toHaveBeenCalledWith(EVENT.id, "u-3", "event_manager"));
    expect(await screen.findByRole("status")).toHaveTextContent("Role changed.");
  });
});

describe("audit log", () => {
  const entries: AuditEntry[] = [
    {
      id: "41",
      occurredAt: "2027-05-01T10:00:00Z",
      actorId: "u-1",
      actorName: "Ada Admin",
      action: "event.update",
      entity: "event",
      entityId: EVENT.id,
      eventId: EVENT.id,
      details: { changes: { name: { from: "Youth Camp", to: "Youth Camp 2027" } } },
    },
    {
      id: "40",
      occurredAt: "2027-05-01T09:00:00Z",
      actorId: "u-1",
      actorName: "Ada Admin",
      action: "user.password_reset",
      entity: "user",
      entityId: "u-2",
      eventId: null,
      details: { email: "grace@example.org", sessionsEnded: 2 },
    },
  ];

  it("shows plain-language actions with the code beside them, and offers older entries", async () => {
    mocked.listEvents.mockResolvedValue({ events: [EVENT] });
    mocked.adminAudit.mockResolvedValue({ entries, nextBefore: "40" });
    renderAs(<AuditPage />, { user: ADMIN, path: "/admin/audit", route: "/admin/audit" });
    expect(await screen.findByText("Changed event settings")).toBeInTheDocument();
    expect(screen.getByText("event.update")).toBeInTheDocument();
    expect(screen.getByText("name: Youth Camp to Youth Camp 2027")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Reset a password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load older entries" })).toBeInTheDocument();
  });

  it("describes changes without any secret material", () => {
    const text = describeEntry(entries[1]);
    expect(text).toBe("grace@example.org, 2 sessions ended");
    expect(text).not.toMatch(/password_hash|secret/);
  });
});

describe("event settings", () => {
  it("refuses an end date before the start date without calling the server", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    renderAs(<EventSettingsPage />, { user: ADMIN, path: "/admin/events/:eventId", route: `/admin/events/${EVENT.id}` });
    const ends = await screen.findByLabelText("Ends on");
    fireEvent.change(ends, { target: { value: "2027-11-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ends on must not be before Starts on.");
    expect(mocked.updateEvent).not.toHaveBeenCalled();
  });

  it("sends only the fields that changed", async () => {
    mocked.getEvent.mockResolvedValue({ event: EVENT });
    mocked.updateEvent.mockResolvedValue({ event: { ...EVENT, status: "closed" } });
    renderAs(<EventSettingsPage />, { user: ADMIN, path: "/admin/events/:eventId", route: `/admin/events/${EVENT.id}` });
    await userEvent.selectOptions(await screen.findByLabelText(/^Status/), "closed");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocked.updateEvent).toHaveBeenCalledWith(EVENT.id, { status: "closed" }));
  });
});
