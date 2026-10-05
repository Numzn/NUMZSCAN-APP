import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { describeError } from "../../app/errors";
import { EVENT_STATUS, statusOf } from "../../app/labels";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../services/api";
import type { CampEvent } from "../../services/types";

export function EventsAdminPage() {
  const [events, setEvents] = useState<CampEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listEvents()
      .then(({ events: list }) => !cancelled && setEvents(list))
      .catch((err) => !cancelled && setError(describeError(err, "Could not load events.")));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!events) return <p className="status">Loading events…</p>;

  return (
    <section>
      <PageHeader title="Events" actions={<Link to="/events/new" className="btn">New event</Link>} />
      {events.length === 0 ? (
        <p className="status">No events yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Dates</th><th>Status</th></tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const status = statusOf(EVENT_STATUS, event.status);
              return (
                <tr key={event.id}>
                  <td data-label="Name"><Link to={`/admin/events/${event.id}`}>{event.name}</Link></td>
                  <td data-label="Dates">{event.startsOn} to {event.endsOn}</td>
                  <td data-label="Status"><Badge tone={status.tone}>{status.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
