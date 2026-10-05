import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../services/api";
import { ADMIN, MANAGER, renderAs } from "../../test/session";
import { EventCreatePage } from "./EventCreatePage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn(), createEvent: vi.fn() } };
});

const mocked = vi.mocked(api);

async function fillDates() {
  fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2027-12-01" } });
  fireEvent.change(screen.getByLabelText("Ends on"), { target: { value: "2027-12-05" } });
}

describe("EventCreatePage", () => {
  beforeEach(() => {
    mocked.createEvent.mockReset();
  });

  it("tells a non-administrator that only admins can create events", async () => {
    renderAs(<EventCreatePage />, { user: MANAGER, path: "/events/new", route: "/events/new" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Only administrators can create events.");
    expect(screen.queryByRole("button", { name: "Create event" })).toBeNull();
  });

  it("fills the web address from the name, and sends the event to the API", async () => {
    mocked.createEvent.mockResolvedValue({
      event: { id: "e-1", slug: "youth-camp-2027", name: "Youth Camp 2027", kind: "church_camp", timezone: "Africa/Lusaka", status: "draft", startsOn: "2027-12-01", endsOn: "2027-12-05" },
    });
    renderAs(<EventCreatePage />, { user: ADMIN, path: "/events/new", route: "/events/new" });
    await userEvent.type(await screen.findByLabelText("Name"), "Youth Camp 2027");
    expect(screen.getByLabelText("Web address (slug)")).toHaveValue("youth-camp-2027");
    await fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() =>
      expect(mocked.createEvent).toHaveBeenCalledWith({
        slug: "youth-camp-2027",
        name: "Youth Camp 2027",
        kind: "church_camp",
        timezone: "Africa/Lusaka",
        startsOn: "2027-12-01",
        endsOn: "2027-12-05",
      })
    );
  });

  it("stops overwriting the web address once the administrator edits it", async () => {
    renderAs(<EventCreatePage />, { user: ADMIN, path: "/events/new", route: "/events/new" });
    const name = await screen.findByLabelText("Name");
    const slug = screen.getByLabelText("Web address (slug)");
    await userEvent.type(name, "Camp");
    await userEvent.clear(slug);
    await userEvent.type(slug, "summer-2027");
    await userEvent.type(name, " Extra");
    expect(slug).toHaveValue("summer-2027");
  });

  it("shows the server's message when the slug is already taken", async () => {
    mocked.createEvent.mockRejectedValueOnce(new ApiError(409, "SLUG_TAKEN", "An event with this slug already exists"));
    renderAs(<EventCreatePage />, { user: ADMIN, path: "/events/new", route: "/events/new" });
    await userEvent.type(await screen.findByLabelText("Name"), "Camp");
    await fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An event with this slug already exists");
  });

  it("names the field the server rejected, using the label the form shows", async () => {
    mocked.createEvent.mockRejectedValueOnce(
      new ApiError(400, "INVALID_INPUT", "Request is invalid", [{ path: "slug", message: "String must contain at least 3 character(s)" }])
    );
    renderAs(<EventCreatePage />, { user: ADMIN, path: "/events/new", route: "/events/new" });
    await userEvent.type(await screen.findByLabelText("Name"), "Camp");
    await fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request is invalid. Web address: String must contain at least 3 character(s).");
  });

  it("refuses an end date before the start date without sending the request", async () => {
    renderAs(<EventCreatePage />, { user: ADMIN, path: "/events/new", route: "/events/new" });
    await userEvent.type(await screen.findByLabelText("Name"), "Camp");
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2027-12-05" } });
    fireEvent.change(screen.getByLabelText("Ends on"), { target: { value: "2027-12-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ends on must not be before Starts on.");
    expect(mocked.createEvent).not.toHaveBeenCalled();
  });
});
