import type { ReactNode } from "react";
import { useAuth } from "../../app/AuthContext";
import { can, viewerOf } from "../../app/policy";
import { NotFound } from "../../components/NotFound";

// Mirrors the server: a non-administrator gets the same not-found page, so the admin area is not advertised.
export function AdminRoute({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "signed-in") return null;
  if (!can(viewerOf(state), "app.admin")) return <NotFound />;
  return <>{children}</>;
}
