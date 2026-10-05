import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../app/AuthContext";
import { ApiError, api } from "../services/api";
import { RequireAuth } from "./RequireAuth";

vi.mock("../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/api")>();
  return { ...actual, api: { ...actual.api, me: vi.fn() } };
});

const mocked = vi.mocked(api);

describe("RequireAuth", () => {
  beforeEach(() => mocked.me.mockReset());

  it("sends an anonymous visitor to the sign-in page", async () => {
    mocked.me.mockRejectedValueOnce(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Sign-in page</p>} />
            <Route path="/secret" element={<RequireAuth><p>Private</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Sign-in page")).toBeInTheDocument());
    expect(screen.queryByText("Private")).toBeNull();
  });

  it("renders the protected content for a signed-in user", async () => {
    mocked.me.mockResolvedValue({ user: { id: "1", email: "a@b.org", displayName: "A", isAdmin: true }, memberships: [] });
    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <AuthProvider>
          <Routes>
            <Route path="/secret" element={<RequireAuth><p>Private</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Private")).toBeInTheDocument();
  });
});
