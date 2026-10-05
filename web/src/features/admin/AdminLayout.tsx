import { Outlet } from "react-router-dom";

// Administration pages sit in the application workspace. Their navigation is the sidebar's Administration section.
export function AdminLayout() {
  return (
    <div className="admin-body">
      <Outlet />
    </div>
  );
}
