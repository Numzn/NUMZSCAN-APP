import { useEffect, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { EVENT_STATUS, statusOf } from "../../app/labels";
import { can, viewerOf } from "../../app/policy";
import { Badge } from "../../components/Badge";
import { Breadcrumbs, type Crumb } from "../../components/Breadcrumbs";
import { NavTabs, type Tab } from "../../components/NavTabs";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";

// Wraps every page of one event: its name, dates, status, breadcrumbs, and sections.
export function EventShell() {
  const { eventId = "" } = useParams();
  const { pathname } = useLocation();
  const { state } = useAuth();
  const viewer = viewerOf(state);
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getEvent(eventId)
      .then(({ event: loaded }) => !cancelled && setEvent(loaded))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load this event."));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!event) return <p className="status">Loading event…</p>;

  const base = `/events/${eventId}`;
  const section = pathname.slice(base.length);
  const sectionCrumbs: Crumb[] = section.startsWith("/participants/new")
    ? [{ label: "Participants", to: `${base}/participants` }, { label: "Register a participant" }]
    : section.startsWith("/participants")
      ? [{ label: "Participants" }]
      : section.startsWith("/groups")
        ? [{ label: "Groups" }]
        : section.startsWith("/access")
          ? [{ label: "Access" }]
          : [];
  const trail: Crumb[] = [
    { label: "Events", to: "/events" },
    { label: event.name, to: sectionCrumbs.length ? base : undefined },
    ...sectionCrumbs,
  ];

  const tabs: Tab[] = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/participants`, label: "Participants" },
    { to: `${base}/groups`, label: "Groups" },
    ...(can(viewer, "event.access.view", eventId) ? [{ to: `${base}/access`, label: "Access" }] : []),
    ...(can(viewer, "app.admin") ? [{ to: `/admin/events/${eventId}`, label: "Settings" }] : []),
  ];

  const status = statusOf(EVENT_STATUS, event.status);

  return (
    <div className="event-shell">
      <Breadcrumbs items={trail} />
      <header className="event-header">
        <div>
          <p className="event-name">{event.name}</p>
          <p className="meta">{event.startsOn} to {event.endsOn} · {event.timezone}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <NavTabs label="Event sections" items={tabs} />
      <div className="event-body">
        <Outlet />
      </div>
    </div>
  );
}
