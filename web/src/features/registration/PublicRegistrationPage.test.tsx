import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { PublicRegistration } from "../../services/types";
import { PublicRegistrationPage } from "./PublicRegistrationPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, publicRegistration: vi.fn(), submitPublicRegistration: vi.fn() },
  };
});

const OPEN: PublicRegistration = {
  event: { name: "BIGOCA Youth Camp", startsOn: "2026-12-10", endsOn: "2026-12-17", timezone: "Africa/Lusaka" },
  registration: {
    status: "open",
    fields: [
      { key: "first_name", label: "First name", type: "text", required: true, section: "Personal information", options: null },
      { key: "last_name", label: "Last name", type: "text", required: true, section: "Personal information", options: null },
      { key: "date_of_birth", label: "Date of birth", type: "date", required: true, section: "Personal information", options: null },
      { key: "phone", label: "Phone number", type: "phone", required: true, section: "Personal information", options: null },
      { key: "email", label: "Email", type: "email", required: false, section: "Personal information", options: null },
      { key: "church", label: "Church", type: "text", required: true, section: "Church information", options: null },
      { key: "shirt", label: "Shirt size", type: "radio", required: false, section: "Camp information", options: ["S", "M", "L"] },
      { key: "consent", label: "I agree to the camp rules", type: "checkbox", required: true, section: "Camp information", options: null },
    ],
  },
};

function renderAt(slug = "bigoca-2026") {
  return render(
    <MemoryRouter initialEntries={[`/r/${slug}`]}>
      <Routes>
        <Route path="/r/:slug" element={<PublicRegistrationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillRequired(overrides: Record<string, string> = {}) {
  const values = {
    "First name": "Michael",
    "Last name": "Banda",
    "Date of birth": "2010-05-17",
    "Phone number": "+260 971 000001",
    Church: "Lusaka Central",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    await userEvent.type(screen.getByLabelText(new RegExp(`^${label}`), { selector: "input, select, textarea" }), value);
  }
  await userEvent.click(screen.getByRole("checkbox", { name: /I agree to the camp rules/ }));
}

beforeEach(() => {
  vi.mocked(api.publicRegistration).mockReset();
  vi.mocked(api.submitPublicRegistration).mockReset();
  vi.mocked(api.publicRegistration).mockResolvedValue(OPEN);
});

describe("public registration page", () => {
  it("shows the event first, then the form, with no sign-in and no navigation", async () => {
    renderAt();
    expect(await screen.findByRole("heading", { level: 1, name: "Participant registration" })).toBeInTheDocument();
    expect(screen.getByText("BIGOCA Youth Camp")).toBeInTheDocument();
    expect(screen.getByText("10 Dec – 17 Dec 2026 · Africa/Lusaka")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Personal information" })).toBeInTheDocument();
  });

  it("marks required questions, and offers the choice fields with their options", async () => {
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    expect(screen.getByText("Required questions are marked with an asterisk (*).")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "M" })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp("^Email"), { selector: "input, select, textarea" })).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(new RegExp("^Phone number"), { selector: "input, select, textarea" })).toHaveAttribute("type", "tel");
  });

  it("names each missing required answer before anything is sent", async () => {
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Register" }));
    expect(api.submitPublicRegistration).not.toHaveBeenCalled();
    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("I agree to the camp rules must be ticked")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Please answer the highlighted questions.");
    expect(screen.getByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" })).toHaveAttribute("aria-invalid", "true");
  });

  it("sends the answers and shows a confirmation the person can keep", async () => {
    vi.mocked(api.submitPublicRegistration).mockResolvedValue({
      confirmation: {
        reference: "EP-7F3K9",
        firstName: "Michael",
        eventName: "BIGOCA Youth Camp",
        startsOn: "2026-12-10",
        endsOn: "2026-12-17",
        timezone: "Africa/Lusaka",
      },
    });
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    await fillRequired();
    await userEvent.click(screen.getByRole("radio", { name: "M" }));
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Registration complete" })).toBeInTheDocument();
    expect(screen.getByText("Thank you, Michael.")).toBeInTheDocument();
    expect(screen.getByText("EP-7F3K9")).toBeInTheDocument();
    expect(screen.getByText(/Your event manager may provide your camp pass before the event/)).toBeInTheDocument();

    const [slug, body] = vi.mocked(api.submitPublicRegistration).mock.calls[0];
    expect(slug).toBe("bigoca-2026");
    expect(body.answers).toEqual({
      first_name: "Michael",
      last_name: "Banda",
      date_of_birth: "2010-05-17",
      phone: "+260 971 000001",
      church: "Lusaka Central",
      shirt: "M",
      consent: true,
    });
    expect(body.submissionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the same submission id when the first attempt fails, so a retry cannot register twice", async () => {
    vi.mocked(api.submitPublicRegistration)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        confirmation: { reference: "EP-AAAAA", firstName: "Michael", eventName: "BIGOCA Youth Camp", startsOn: "2026-12-10", endsOn: "2026-12-17", timezone: "Africa/Lusaka" },
      });
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your registration was not sent");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    await screen.findByText("Thank you, Michael.");
    const [first, second] = vi.mocked(api.submitPublicRegistration).mock.calls;
    expect(first[1].submissionId).toBe(second[1].submissionId);
  });

  it("puts a server refusal on the field it names", async () => {
    vi.mocked(api.submitPublicRegistration).mockRejectedValue(
      new ApiError(400, "INVALID_INPUT", "Request is invalid", [{ path: "phone", message: "Enter a valid phone number" }])
    );
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    await fillRequired({ "Phone number": "+260 971 000001" });
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByText("Enter a valid phone number")).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp("^Phone number"), { selector: "input, select, textarea" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted answers.");
  });

  it("says when the person is already registered, rather than suggesting a second try", async () => {
    vi.mocked(api.submitPublicRegistration).mockRejectedValue(new ApiError(409, "ALREADY_REGISTERED", "You are already registered for this event"));
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You are already registered for this event.");
  });

  it("moves to the closed message when registration closes while the form is open", async () => {
    vi.mocked(api.submitPublicRegistration).mockRejectedValue(new ApiError(409, "REGISTRATION_CLOSED", "Registration for this event is closed"));
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Registration closed" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
  });

  it("shows a closed registration without a form, and still names the event", async () => {
    vi.mocked(api.publicRegistration).mockResolvedValue({ ...OPEN, registration: { status: "closed", fields: [] } });
    renderAt();
    expect(await screen.findByRole("heading", { level: 1, name: "Registration closed" })).toBeInTheDocument();
    expect(screen.getByText("Registration for BIGOCA Youth Camp is no longer accepting new participants.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull();
  });

  it("shows a draft as not yet open", async () => {
    vi.mocked(api.publicRegistration).mockResolvedValue({ ...OPEN, registration: { status: "draft", fields: [] } });
    renderAt();
    expect(await screen.findByRole("heading", { level: 1, name: "Registration not open yet" })).toBeInTheDocument();
  });

  it("says an unknown address is not an event, without exposing details", async () => {
    vi.mocked(api.publicRegistration).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Registration not found"));
    renderAt("nope");
    expect(await screen.findByRole("heading", { level: 1, name: "Event not found" })).toBeInTheDocument();
    expect(screen.getByText(/does not match an event/)).toBeInTheDocument();
  });

  it("is laid out on its own, away from the application's sidebar and account", async () => {
    renderAt();
    await screen.findByLabelText(new RegExp("^First name"), { selector: "input, select, textarea" });
    const page = document.querySelector(".public-page");
    expect(page).not.toBeNull();
    expect(within(page as HTMLElement).getByText("EventPass")).toBeInTheDocument();
    expect(document.querySelector(".sidebar")).toBeNull();
  });
});
