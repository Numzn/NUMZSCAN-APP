import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function Layout() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = state.status === "signed-in" ? state.user.displayName : "";

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" end className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          EventPass
        </NavLink>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>Events</NavLink>
          {state.status === "signed-in" && state.user.isAdmin && <NavLink to="/events/new">New event</NavLink>}
          {state.status === "signed-in" && state.user.isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="account">
          {displayName && (
            <span className="avatar" aria-hidden="true">{initials(displayName)}</span>
          )}
          <span className="account-name">{displayName}</span>
          <button type="button" className="btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
