import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../services/api";
import type { Membership, User } from "../services/types";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; user: User; memberships: Membership[] };

interface AuthValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { user, memberships } = await api.me();
        if (!cancelled) setState({ status: "signed-in", user, memberships });
      } catch {
        // Whether that is a 401 or a network failure, the user is treated as signed out.
        if (!cancelled) setState({ status: "anonymous" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    const { user, memberships } = await api.me();
    setState({ status: "signed-in", user, memberships });
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ status: "anonymous" });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
