import { useEffect, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";
import { formatEventDates } from "../../app/dates";
import { EVENT_STATUS, statusOf } from "../../app/labels";
import { Badge } from "../../components/Badge";
import { Breadcrumbs, type Crumb } from "../../components/Breadcrumbs";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { LoadingState } from "../../components/States";

// Wraps every page of one event: its name, dates, status, and breadcrumbs. The sections are in the sidebar.
export function EventShell() {
  const { eventId = "" } = useParams();
  const { pathname } = useLocation();
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
  if (!event) return <LoadingState>Loading event…</LoadingState>;

  const base = `/events/${eventId}`;
  const section = pathname.slice(base.length);
  const sectionCrumbs: Crumb[] = section.startsWith("/participants/new")
    ? [{ label: "Participants", to: `${base}/participants` }, { label: "Register a participant" }]
    : section.startsWith("/participants")
      ? [{ label: "Participants" }]
      : section.startsWith("/registration/form")
        ? [{ label: "Registration", to: `${base}/registration` }, { label: "Form" }]
      : section.startsWith("/registration")
        ? [{ label: "Registration" }]
      : section.startsWith("/checkpoints")
        ? [{ label: "Checkpoints" }]
      : section.startsWith("/scanner")
        ? [{ label: "Scanner" }]
      : section.startsWith("/attendance")
        ? [{ label: "Attendance" }]
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

  const status = statusOf(EVENT_STATUS, event.status);

  return (
    <div className="event-shell">
      <Breadcrumbs items={trail} />
      <header className="event-header">
        <div>
          <p className="event-name">{event.name}</p>
          <p className="meta">{formatEventDates(event.startsOn, event.endsOn)} · {event.timezone}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <div className="event-body">
        <Outlet />
      </div>
    </div>
  );
}
