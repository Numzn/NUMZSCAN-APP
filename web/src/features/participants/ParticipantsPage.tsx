import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { canManage, roleFor } from "../../app/roles";
import { api, ApiError } from "../../services/api";
import type { CampEvent, Group, Participant } from "../../services/types";

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
  const manager = canManage(roleFor(state.user, state.memberships, eventId));
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!participants || !event) return <p className="status">Loading participants…</p>;

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "No group";

  return (
    <section>
      <p><Link to={`/events/${eventId}`}>← {event.name}</Link></p>
      <h1>Participants</h1>
      {manager && <p><Link to={`/events/${eventId}/participants/new`}>Register a participant</Link></p>}
      {participants.length === 0 ? (
        <p className="status">No participants registered yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Group</th><th>Status</th></tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/event-participants/${p.id}`}>{p.fullName}</Link></td>
                <td>{groupName(p.groupId)}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
