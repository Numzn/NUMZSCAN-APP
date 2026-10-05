import { can, type Viewer } from "./policy";

// The one definition of the application's navigation. The sidebar and the phone drawer both read it.
// An item is current when its match rule accepts the address. See docs/design/ui-architecture.md.
export interface NavItem {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
  // An event in "My events" is current while its pages are open. It is marked as the current item in a set,
  // not as the current page, so the page's own item keeps the page highlight.
  context?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  // Shown in place of the items when there are none, so an empty section still says why.
  note?: string;
}

export interface WorkspaceEvent {
  id: string;
  name: string;
}

export interface NavOptions {
  // The events the viewer can open, as the API lists them. Only event managers and staff see them as "My events".
  events: WorkspaceEvent[];
  eventsState: "loading" | "ready" | "error";
  // The event whose pages the address is inside, if any.
  eventId: string | null;
}

const isEventsList = (p: string) => p === "/" || p === "/events" || (p.startsWith("/events/") && p !== "/events/new");

// The event an address belongs to. "/events/new" is the create page, not an event.
export function eventIdFromPath(pathname: string): string | null {
  const match = /^\/events\/([^/]+)/.exec(pathname);
  if (!match || match[1] === "new") return null;
  return match[1];
}

export function navigationFor(viewer: Viewer | null, options: NavOptions): NavSection[] {
  if (!viewer) return [];
  const sections: NavSection[] = [];

  if (can(viewer, "app.admin")) {
    // Administrators keep the platform view: every event is one click away from Workspace.
    const workspace: NavItem[] = [{ to: "/events", label: "Events", match: isEventsList }];
    if (can(viewer, "event.create")) {
      workspace.push({ to: "/events/new", label: "New event", match: (p) => p === "/events/new" });
    }
    sections.push({ title: "Workspace", items: workspace });
  } else {
    sections.push(myEvents(options));
  }

  if (options.eventId && can(viewer, "event.view", options.eventId)) {
    sections.push(...eventSections(viewer, options.eventId));
  }

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

function myEvents({ events, eventsState }: NavOptions): NavSection {
  const items: NavItem[] = events.map((event) => ({
    to: `/events/${event.id}`,
    label: event.name,
    match: (p: string) => eventIdFromPath(p) === event.id,
    context: true,
  }));
  const note =
    items.length > 0
      ? undefined
      : eventsState === "loading"
        ? "Loading your events…"
        : eventsState === "error"
          ? "Your events could not be loaded."
          : "No events assigned to you yet.";
  return { title: "My events", items, note };
}

// The operations and setup of the event the address is inside. The same items appear on desktop and in the drawer.
// Only sections the viewer may use are listed: staff see no Access, and Settings is for administrators.
function eventSections(viewer: Viewer, eventId: string): NavSection[] {
  const base = `/events/${eventId}`;
  const operations: NavItem[] = [
    { to: base, label: "Overview", match: (p) => p === base },
    { to: `${base}/participants`, label: "Participants", match: (p) => p.startsWith(`${base}/participants`) },
  ];
  if (can(viewer, "event.registration.view", eventId)) {
    operations.push({ to: `${base}/registration`, label: "Registration", match: (p) => p.startsWith(`${base}/registration`) });
  }
  operations.push({ to: `${base}/groups`, label: "Groups", match: (p) => p.startsWith(`${base}/groups`) });
  const setup: NavItem[] = [];
  if (can(viewer, "event.access.view", eventId)) {
    setup.push({ to: `${base}/access`, label: "Access", match: (p) => p === `${base}/access` });
  }
  if (can(viewer, "app.admin")) {
    setup.push({
      to: `/admin/events/${eventId}`,
      label: "Settings",
      match: (p) => p.startsWith(`/admin/events/${eventId}`),
    });
  }
  const sections: NavSection[] = [{ title: "Event operations", items: operations }];
  if (setup.length > 0) sections.push({ title: "Event setup", items: setup });
  return sections;
}
