import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { PARTICIPANT_STATUS, statusOf } from "../../app/labels";
import { can, viewerOf } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/Badge";
import { DataTable } from "../../components/DataTable";
import { api, ApiError } from "../../services/api";
import type { CampEvent, Group, Participant } from "../../services/types";
import { EmptyState, LoadingState } from "../../components/States";

export function ParticipantsPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ event: e }, { groups: g }, { participants: p }] = await Promise.all([
          api.getEvent(eventId),
          api.listGroups(eventId),
          api.listParticipants(eventId),
        ]);
        if (!cancelled) {
          setEvent(e);
          setGroups(g);
          setParticipants(p);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load participants.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (state.status !== "signed-in") return null;
  const manager = can(viewerOf(state), "event.manage", eventId);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!participants || !event) return <LoadingState>Loading participants…</LoadingState>;

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "No group";

  return (
    <section>
      <PageHeader
        title="Participants"
        description="Manage people registered for this event."
        actions={manager ? <Link to={`/events/${eventId}/participants/new`} className="btn">Register a participant</Link> : undefined}
      />
      {participants.length === 0 ? (
        <EmptyState>No participants registered yet.</EmptyState>
      ) : (
        <DataTable
          label="Participants"
          columns={["Name", "Group", "Status"]}
          rows={participants.map((p) => {
            const status = statusOf(PARTICIPANT_STATUS, p.status);
            return [
              <Link key="name" to={`/event-participants/${p.id}`}>{p.fullName}</Link>,
              groupName(p.groupId),
              <Badge key="status" tone={status.tone}>{status.label}</Badge>,
            ];
          })}
        />
      )}
    </section>
  );
}
