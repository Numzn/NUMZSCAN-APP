import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import type { FormField, Membership } from "../../services/types";
import { MANAGER, STAFF, renderAs } from "../../test/session";
import { FormBuilderPage } from "./FormBuilderPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn(),
      registrationForm: vi.fn(),
      addRegistrationField: vi.fn(),
      updateRegistrationField: vi.fn(),
      removeRegistrationField: vi.fn(),
      reorderRegistrationFields: vi.fn(),
    },
  };
});

const EVENT_ID = "e-1";
const MEMBERSHIP: Membership[] = [{ eventId: EVENT_ID, role: "event_manager" }];

const field = (overrides: Partial<FormField>): FormField => ({
  id: "f-x", key: "x", label: "Question", type: "text", required: false, section: null, options: null, personField: null, position: 0,
  ...overrides,
});

const FORM: FormField[] = [
  field({ id: "f-first", key: "first_name", label: "First name", required: true, section: "Personal information", personField: "first_name", position: 0 }),
  field({ id: "f-phone", key: "phone", label: "Phone number", type: "phone", required: true, section: "Personal information", personField: "phone", position: 1 }),
  field({ id: "f-church", key: "church", label: "Church", required: true, section: "Church information", position: 2 }),
  field({ id: "f-diet", key: "dietary_requirements", label: "Dietary requirements", type: "long_text", section: "Camp information", position: 3 }),
];

function renderBuilder(user = MANAGER, memberships = MEMBERSHIP) {
  return renderAs(<FormBuilderPage />, { user, memberships, path: "/events/:eventId/registration/form", route: `/events/${EVENT_ID}/registration/form` });
}

beforeEach(() => {
  vi.mocked(api.registrationForm).mockReset();
  vi.mocked(api.registrationForm).mockResolvedValue({ fields: FORM.map((f) => ({ ...f })) });
  vi.mocked(api.addRegistrationField).mockReset();
  vi.mocked(api.updateRegistrationField).mockReset();
  vi.mocked(api.removeRegistrationField).mockReset();
  vi.mocked(api.reorderRegistrationFields).mockReset();
});

describe("registration form builder", () => {
  it("lists the questions in order, grouped by section, with required and person markers", async () => {
    renderBuilder();
    expect(await screen.findByRole("heading", { level: 2, name: "Personal information" })).toBeInTheDocument();
    const personal = screen.getByRole("region", { name: "Personal information" });
    expect(within(personal).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent)).toEqual([
      "First name",
      "Phone number",
    ]);
    expect(within(personal).getAllByRole("listitem")[1]).toHaveTextContent("Phone");
    expect(within(personal).getAllByText("Identifies the person")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "Camp information" })).toBeInTheDocument();
  });

  it("moves a question down, and sends the whole new order", async () => {
    vi.mocked(api.reorderRegistrationFields).mockResolvedValue({ fields: [FORM[1], FORM[0], FORM[2], FORM[3]] });
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: "Move First name down" }));
    expect(api.reorderRegistrationFields).toHaveBeenCalledWith(EVENT_ID, ["f-phone", "f-first", "f-church", "f-diet"]);
    expect(await screen.findByText('Moved "First name".')).toBeInTheDocument();
  });

  it("does not offer to move the first question up, or the last down", async () => {
    renderBuilder();
    await screen.findByRole("heading", { level: 2, name: "Personal information" });
    expect(screen.getByRole("button", { name: "Move First name up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Dietary requirements down" })).toBeDisabled();
  });

  it("adds a dropdown with options, and asks for two distinct options before saving", async () => {
    vi.mocked(api.addRegistrationField).mockResolvedValue({ field: field({ id: "f-new", key: "shirt", label: "Shirt size", type: "dropdown", options: ["S", "M"], position: 4 }) });
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: "Add field" }));
    const editor = screen.getByRole("form", { name: "Add a field" });

    await userEvent.type(within(editor).getByLabelText("Label"), "Shirt size");
    await userEvent.selectOptions(within(editor).getByLabelText("Type"), "dropdown");
    await userEvent.type(within(editor).getByLabelText("Options"), "S");
    await userEvent.click(within(editor).getByRole("button", { name: "Save field" }));
    expect(api.addRegistrationField).not.toHaveBeenCalled();
    expect(await within(editor).findByText("Add at least two options, one per line")).toBeInTheDocument();

    await userEvent.type(within(editor).getByLabelText("Options"), "{enter}M");
    await userEvent.click(within(editor).getByRole("button", { name: "Save field" }));
    await waitFor(() =>
      expect(api.addRegistrationField).toHaveBeenCalledWith(EVENT_ID, {
        label: "Shirt size",
        type: "dropdown",
        required: false,
        section: null,
        options: ["S", "M"],
      })
    );
    expect(await screen.findByText(/Added "Shirt size"/)).toBeInTheDocument();
  });

  it("edits a question's label, leaving its type and key alone", async () => {
    vi.mocked(api.updateRegistrationField).mockResolvedValue({ field: field({ ...FORM[2], label: "Home church" }) });
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Church/ }));
    const editor = screen.getByRole("form", { name: "Edit “Church”" });
    const label = within(editor).getByLabelText("Label");
    await userEvent.clear(label);
    await userEvent.type(label, "Home church");
    await userEvent.click(within(editor).getByRole("button", { name: "Save field" }));
    await waitFor(() =>
      expect(api.updateRegistrationField).toHaveBeenCalledWith(EVENT_ID, "f-church", {
        label: "Home church",
        type: "text",
        required: true,
        section: "Church information",
        options: null,
      })
    );
  });

  it("locks the person fields: no removal, and the type and required setting cannot change", async () => {
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Phone number/ }));
    const editor = screen.getByRole("form", { name: "Edit “Phone number”" });
    expect(within(editor).getByLabelText("Type")).toBeDisabled();
    expect(within(editor).getByRole("checkbox", { name: /Required/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove Phone number" })).toBeNull();
  });

  it("removes a question only after a second, explicit confirmation", async () => {
    vi.mocked(api.removeRegistrationField).mockResolvedValue({ field: FORM[3] });
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: "Remove Dietary requirements" }));
    expect(api.removeRegistrationField).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", { name: "Confirm removing Dietary requirements" });
    expect(within(confirm).getByText(/Answers already given are kept/)).toBeInTheDocument();

    await userEvent.click(within(confirm).getByRole("button", { name: "Confirm remove" }));
    expect(api.removeRegistrationField).toHaveBeenCalledWith(EVENT_ID, "f-diet");
    await waitFor(() => expect(screen.queryByText("Dietary requirements")).toBeNull());
    expect(screen.getByText(/Answers already given are kept/, { selector: "[role=status]" })).toBeInTheDocument();
  });

  it("shows the server's reason when it refuses a change", async () => {
    vi.mocked(api.addRegistrationField).mockRejectedValue(new ApiError(409, "FORM_FULL", "A form can have at most 60 fields"));
    renderBuilder();
    await userEvent.click(await screen.findByRole("button", { name: "Add field" }));
    const editor = screen.getByRole("form", { name: "Add a field" });
    await userEvent.type(within(editor).getByLabelText("Label"), "Extra");
    await userEvent.click(within(editor).getByRole("button", { name: "Save field" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A form can have at most 60 fields");
  });

  it("lets staff see that the form is for managers, and nothing more", async () => {
    renderBuilder(STAFF, [{ eventId: EVENT_ID, role: "staff" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only event managers can edit the registration form.");
    expect(api.registrationForm).not.toHaveBeenCalled();
  });
});
