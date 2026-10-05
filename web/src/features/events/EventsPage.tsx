import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { EVENT_STATUS, statusOf } from "../../app/labels";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { EmptyState, LoadingState } from "../../components/States";

export function EventsPage() {
  const [events, setEvents] = useState<CampEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { events: loaded } = await api.listEvents();
        if (!cancelled) setEvents(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load events.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!events) return <LoadingState>Loading events…</LoadingState>;
  if (events.length === 0) return <EmptyState>No events yet.</EmptyState>;

  return (
    <section>
      <PageHeader title="Events" />
      <ul className="event-list">
        {events.map((event) => {
          const status = statusOf(EVENT_STATUS, event.status);
          return (
            <li key={event.id} className="event-card">
              <div className="event-card-main">
                <Link to={`/events/${event.id}`}>{event.name}</Link>
                <span className="meta">{event.startsOn} to {event.endsOn}</span>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
