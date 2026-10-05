import { NavLink, Outlet } from "react-router-dom";

// Sidebar on desktop, a row of tabs on a phone (see styles.css).
export function AdminLayout() {
  return (
    <div className="admin">
      <nav className="admin-nav" aria-label="Administration">
        <NavLink to="/admin" end>Overview</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/events">Events</NavLink>
        <NavLink to="/admin/audit">Audit log</NavLink>
      </nav>
      <div className="admin-body">
        <Outlet />
      </div>
    </div>
  );
}
