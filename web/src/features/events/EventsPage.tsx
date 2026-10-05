import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";

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
  if (!events) return <p className="status">Loading events…</p>;
  if (events.length === 0) return <p className="status">No events yet.</p>;

  return (
    <section>
      <h1>Events</h1>
      <ul className="event-list">
        {events.map((event) => (
          <li key={event.id}>
            <Link to={`/events/${event.id}`}>{event.name}</Link>
            <span className="meta">
              {event.startsOn} to {event.endsOn} · {event.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
