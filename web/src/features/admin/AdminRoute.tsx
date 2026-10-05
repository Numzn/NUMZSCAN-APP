import type { ReactNode } from "react";
import { useAuth } from "../../app/AuthContext";

// Mirrors the server: a non-administrator gets the same not-found page, so the admin area is not advertised.
export function AdminRoute({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "signed-in") return null;
  if (!state.user.isAdmin) return <p className="status">Page not found.</p>;
  return <>{children}</>;
}
