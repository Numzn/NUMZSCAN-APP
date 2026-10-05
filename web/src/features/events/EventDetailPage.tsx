import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { roleOn, viewerOf, type EventRole } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";

const ROLE_LABEL: Record<EventRole, string> = {
  admin: "Administrator",
  event_manager: "Event manager",
  staff: "Staff",
};

// The event's overview. The name, dates, status, and sections are provided by EventShell.
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

  const role = roleOn(viewerOf(state), event.id);

  return (
    <section>
      <PageHeader title="Overview" />
      <dl className="facts card">
        <dt>Timezone</dt>
        <dd>{event.timezone}</dd>
        <dt>Your role</dt>
        <dd>{role ? ROLE_LABEL[role] : "No role"}</dd>
      </dl>
    </section>
  );
}
