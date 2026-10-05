import { can, type Viewer } from "./policy";

// The one definition of the application's navigation. The sidebar and the phone drawer both read it.
// An item is current when its match rule accepts the address.
export interface NavItem {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const isEventsList = (p: string) => p === "/" || p === "/events" || (p.startsWith("/events/") && p !== "/events/new");

export function navigationFor(viewer: Viewer | null): NavSection[] {
  if (!viewer) return [];
  const workspace: NavItem[] = [{ to: "/events", label: "Events", match: isEventsList }];
  if (can(viewer, "event.create")) {
    workspace.push({ to: "/events/new", label: "New event", match: (p) => p === "/events/new" });
  }
  const sections: NavSection[] = [{ title: "Workspace", items: workspace }];

  if (can(viewer, "app.admin")) {
    sections.push({
      title: "Administration",
      items: [
        { to: "/admin", label: "Overview", match: (p) => p === "/admin" },
        { to: "/admin/users", label: "Users", match: (p) => p.startsWith("/admin/users") },
        { to: "/admin/events", label: "Manage events", match: (p) => p.startsWith("/admin/events") },
        { to: "/admin/audit", label: "Audit log", match: (p) => p.startsWith("/admin/audit") },
      ],
    });
  }
  return sections;
}
