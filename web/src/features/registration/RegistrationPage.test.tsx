import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { CampEvent, FormField, Membership, RegistrationSummary } from "../../services/types";
import { MANAGER, STAFF, renderAs } from "../../test/session";
import { RegistrationPage } from "./RegistrationPage";

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
      getEvent: vi.fn(),
      registration: vi.fn(),
      registrationForm: vi.fn(),
      createRegistration: vi.fn(),
      publishRegistration: vi.fn(),
      closeRegistration: vi.fn(),
      changeRegistrationLink: vi.fn(),
    },
  };
});

const EVENT: CampEvent = { id: "e-1", slug: "youth", name: "Youth Camp", kind: "church_camp", timezone: "Africa/Lusaka", status: "open", startsOn: "2026-12-10", endsOn: "2026-12-17" };
const MEMBERSHIP: Membership[] = [{ eventId: EVENT.id, role: "event_manager" }];

const summary = (overrides: Partial<RegistrationSummary> = {}): RegistrationSummary => ({
  status: "draft",
  slug: "youth-camp-2026",
  publicUrl: "https://events.example.org/r/youth-camp-2026",
  fieldCount: 10,
  openedAt: null,
  closedAt: null,
  updatedAt: "2026-10-05T10:00:00Z",
  ...overrides,
});

const fields = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `f-${i}`, key: `k${i}`, label: `Q${i}`, type: "text", required: false, section: null, options: null, personField: null, position: i })) as FormField[];

function renderPage(user = MANAGER, memberships = MEMBERSHIP) {
  return renderAs(<RegistrationPage />, { user, memberships, path: "/events/:eventId/registration", route: `/events/${EVENT.id}/registration` });
}

beforeEach(() => {
  vi.mocked(api.me).mockReset();
  vi.mocked(api.getEvent).mockResolvedValue({ event: EVENT });
  vi.mocked(api.registrationForm).mockResolvedValue({ fields: fields(10) });
  vi.mocked(QRCode.toDataURL).mockClear();
  vi.mocked(api.registration).mockClear();
});

describe("registration page", () => {
  it("offers to configure registration when it has not been set up", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: null });
    renderPage();
    expect(await screen.findByText("Registration has not been configured for this event yet.")).toBeInTheDocument();
    vi.mocked(api.createRegistration).mockResolvedValue({ registration: summary() });
    await userEvent.click(screen.getByRole("button", { name: "Configure registration" }));
    expect(api.createRegistration).toHaveBeenCalledWith(EVENT.id);
    expect(await screen.findByRole("button", { name: "Publish registration" })).toBeInTheDocument();
  });

  it("says what the status means and offers the next step", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary({ status: "draft" }) });
    renderPage();
    expect(await screen.findByText("Not published yet. People cannot register until you open registration.")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("closes an open registration, and reopens a closed one", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary({ status: "open" }) });
    vi.mocked(api.closeRegistration).mockResolvedValue({ registration: summary({ status: "closed" }) });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Close registration" }));
    expect(api.closeRegistration).toHaveBeenCalledWith(EVENT.id);
    expect(await screen.findByText("Registration is closed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen registration" })).toBeInTheDocument();
  });

  it("shows the public link, copies it, opens it in a new tab, and shows a QR code for it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.mocked(api.registration).mockResolvedValue({ registration: summary({ status: "open" }) });
    renderPage();

    expect(await screen.findByRole("link", { name: "https://events.example.org/r/youth-camp-2026" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://events.example.org/r/youth-camp-2026");
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();

    const open = screen.getByRole("link", { name: "Open registration" });
    expect(open).toHaveAttribute("href", "https://events.example.org/r/youth-camp-2026");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));

    const qr = screen.getByRole("button", { name: "QR code" });
    expect(qr).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(qr);
    await waitFor(() => expect(screen.getByAltText("QR code for https://events.example.org/r/youth-camp-2026")).toBeInTheDocument());
    expect(vi.mocked(QRCode.toDataURL).mock.calls[0][0]).toBe("https://events.example.org/r/youth-camp-2026");
    expect(screen.getByRole("button", { name: "Hide QR code" })).toHaveAttribute("aria-expanded", "true");
  });

  it("says plainly when the server has no public address, rather than inventing a link", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary({ publicUrl: null, status: "open" }) });
    renderPage();
    expect(await screen.findByText(/No public address is set on this server/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "QR code" })).toBeNull();
  });

  it("shows how many questions the form has, from the form itself", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary() });
    vi.mocked(api.registrationForm).mockResolvedValue({ fields: fields(12) });
    renderPage();
    expect(await screen.findByText("Your form currently has 12 fields.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit form" })).toHaveAttribute("href", `/events/${EVENT.id}/registration/form`);
  });

  it("explains a refusal with the server's own reason and the step that failed", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary() });
    vi.mocked(api.publishRegistration).mockRejectedValue(
      new ApiError(409, "REGISTRATION_INCOMPLETE", "The form is not ready to publish", [{ path: "form", message: "Keep first name, last name and phone number on the form" }])
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Publish registration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The form is not ready to publish: Keep first name, last name and phone number on the form.");
  });

  it("changes the public address only when asked, and reports the new one", async () => {
    vi.mocked(api.registration).mockResolvedValue({ registration: summary() });
    vi.mocked(api.changeRegistrationLink).mockResolvedValue({ registration: summary({ slug: "bigoca-2026", publicUrl: "https://events.example.org/r/bigoca-2026" }) });
    renderPage();
    const input = await screen.findByLabelText("Public address");
    await userEvent.clear(input);
    await userEvent.type(input, "bigoca-2026");
    await userEvent.click(screen.getByRole("button", { name: "Change address" }));
    expect(api.changeRegistrationLink).toHaveBeenCalledWith(EVENT.id, "bigoca-2026");
    expect(await screen.findByText(/The old link no longer works/)).toBeInTheDocument();
  });

  it("lets staff see that registration is for managers, and nothing more", async () => {
    renderPage(STAFF, [{ eventId: EVENT.id, role: "staff" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only event managers can see registration.");
    expect(api.registration).not.toHaveBeenCalled();
  });
});
