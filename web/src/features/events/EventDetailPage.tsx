import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { api, ApiError } from "../../services/api";
import type { CampEvent, EventMembershipRole } from "../../services/types";

const ROLE_LABEL: Record<EventMembershipRole, string> = {
  event_manager: "Event manager",
  staff: "Staff",
};

export function EventDetailPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { event: loaded } = await api.getEvent(eventId);
        if (!cancelled) setEvent(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this event.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!event) return <p className="status">Loading event…</p>;

  const signedIn = state.status === "signed-in" ? state : null;
  const membership = signedIn?.memberships.find((m) => m.eventId === event.id);
  const yourRole = signedIn?.user.isAdmin
    ? "Administrator"
    : membership
      ? ROLE_LABEL[membership.role]
      : "No role";

  return (
    <section>
      <h1>{event.name}</h1>
      <dl className="facts">
        <dt>Dates</dt>
        <dd>{event.startsOn} to {event.endsOn}</dd>
        <dt>Timezone</dt>
        <dd>{event.timezone}</dd>
        <dt>Status</dt>
        <dd>{event.status}</dd>
        <dt>Your role</dt>
        <dd>{yourRole}</dd>
      </dl>
      <nav className="subnav" aria-label="Event sections">
        <Link to={`/events/${event.id}/participants`}>Participants</Link>
        <Link to={`/events/${event.id}/groups`}>Groups</Link>
      </nav>
    </section>
  );
}
