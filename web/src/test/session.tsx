import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../app/AuthContext";
import { api } from "../services/api";
import type { Membership, User } from "../services/types";

export const ADMIN: User = { id: "u-admin", email: "admin@example.org", displayName: "Ada Admin", isAdmin: true };
export const MANAGER: User = { id: "u-mgr", email: "manager@example.org", displayName: "Grace", isAdmin: false };
export const STAFF: User = { id: "u-staff", email: "staff@example.org", displayName: "Sam", isAdmin: false };

// Renders a page as a signed-in user at a route. The session comes from the mocked /auth/me.
export function renderAs(ui: ReactElement, { user, memberships = [], path, route }: { user: User; memberships?: Membership[]; path: string; route: string }) {
  vi.mocked(api.me).mockResolvedValue({ user, memberships });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<p>Landed elsewhere</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}
