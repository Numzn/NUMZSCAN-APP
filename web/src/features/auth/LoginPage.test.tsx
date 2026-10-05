import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../app/AuthContext";
import { ApiError, api } from "../../services/api";
import { LoginPage } from "./LoginPage";

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    api: { ...actual.api, me: vi.fn(), login: vi.fn(), logout: vi.fn() },
  };
});

const mocked = vi.mocked(api);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    mocked.me.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
  });

  it("shows the server's message when the credentials are refused", async () => {
    mocked.login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect"));
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "manager@example.org");
    await userEvent.type(screen.getByLabelText("Password"), "wrong password entirely");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
    expect(mocked.login).toHaveBeenCalledWith("manager@example.org", "wrong password entirely");
  });

  it("shows a generic message when the server cannot be reached", async () => {
    mocked.login.mockRejectedValue(new TypeError("Failed to fetch"));
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "manager@example.org");
    await userEvent.type(screen.getByLabelText("Password"), "whatever-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign in. Try again.");
  });

  it("moves to the home page after a successful sign-in", async () => {
    mocked.login.mockResolvedValue({ user: { id: "1", email: "manager@example.org", displayName: "M", isAdmin: false } });
    mocked.me
      .mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "Authentication required"))
      .mockResolvedValue({ user: { id: "1", email: "manager@example.org", displayName: "M", isAdmin: false }, memberships: [] });
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "manager@example.org");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Home page")).toBeInTheDocument());
  });
});
