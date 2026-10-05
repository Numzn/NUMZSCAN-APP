import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";

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
        <Link to="/" className="brand">EventPass</Link>
        <nav>
          <Link to="/">Events</Link>
          {state.status === "signed-in" && state.user.isAdmin && <Link to="/events/new">New event</Link>}
        </nav>
        <div className="account">
          <span>{displayName}</span>
          <button type="button" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
