import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { roleOn, viewerOf, type EventRole } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { api, ApiError } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { LoadingState } from "../../components/States";

const ROLE_LABEL: Record<EventRole, string> = {
  admin: "Administrator",
  event_manager: "Event manager",
  staff: "Staff",
};

// A total is null when its list could not be loaded. It is left out rather than shown as zero.
interface Totals {
  participants: number | null;
  groups: number | null;
}

// The event's overview: the totals that already exist (people and groups), then the viewer's role.
// The event's name, dates, status, and sections are provided by EventShell and the sidebar.
export function EventDetailPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
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
    async function loadTotals() {
      const [participants, groups] = await Promise.allSettled([api.listParticipants(eventId), api.listGroups(eventId)]);
      if (cancelled) return;
      setTotals({
        participants: participants.status === "fulfilled" ? participants.value.participants.length : null,
        groups: groups.status === "fulfilled" ? groups.value.groups.length : null,
      });
    }
    void load();
    void loadTotals();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!event) return <LoadingState>Loading event…</LoadingState>;

  const role = roleOn(viewerOf(state), event.id);
  const shownTotals = totals
    ? [
        totals.participants !== null && { label: "Participants", value: totals.participants },
        totals.groups !== null && { label: "Groups", value: totals.groups },
      ].filter((total): total is { label: string; value: number } => Boolean(total))
    : [];

  return (
    <section>
      <PageHeader title="Overview" />
      {shownTotals.length > 0 && (
        <div className="metrics">
          {shownTotals.map((total) => (
            <div key={total.label} className="metric">
              <span className="metric-value">{total.value}</span>
              <span className="metric-label">{total.label}</span>
            </div>
          ))}
        </div>
      )}
      <dl className="facts card">
        <dt>Timezone</dt>
        <dd>{event.timezone}</dd>
        <dt>Your role</dt>
        <dd>{role ? ROLE_LABEL[role] : "No role"}</dd>
      </dl>
    </section>
  );
}
