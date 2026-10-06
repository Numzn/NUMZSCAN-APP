import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { PARTICIPANT_STATUS, statusOf } from "../../app/labels";
import { can, viewerOf } from "../../app/policy";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { AttendanceSummary, Group, Participant } from "../../services/types";
import { KIND_LABEL } from "./CheckpointsPage";

// Who is on the camp right now: totals, by group, meals and scans per checkpoint, and a search to find someone.
export function AttendancePage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const allowed = can(viewerOf(state), "attendance.view", eventId);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([api.attendance(eventId), api.listParticipants(eventId), api.listGroups(eventId)])
      .then(([s, p, g]) => {
        if (cancelled) return;
        setSummary(s);
        setParticipants(p.participants);
        setGroups(g.groups);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load attendance."));
    return () => {
      cancelled = true;
    };
  }, [eventId, allowed]);

  if (state.status !== "signed-in") return null;
  if (!allowed) return <p role="alert" className="error">You need a role on this event to see attendance.</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!summary || !participants) return <LoadingState>Loading attendance…</LoadingState>;

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "No group";
  const needle = query.trim().toLowerCase();
  const matches = needle.length < 2 ? [] : participants.filter((p) => p.fullName.toLowerCase().includes(needle));

  return (
    <section>
      <PageHeader
        title="Attendance"
        description="Who is checked in, who has left, and what has been served."
        actions={<Link className="btn-secondary" to={`/events/${eventId}/scanner`}>Open scanner</Link>}
      />

      <div className="metrics">
        {(["registered", "checked_in", "departed", "cancelled"] as const).map((status) => (
          <div key={status} className="metric">
            <span className="metric-value">{summary.counts[status] ?? 0}</span>
            <span className="metric-label">{statusOf(PARTICIPANT_STATUS, status).label}</span>
          </div>
        ))}
      </div>

      <section className="card">
        <h2>By group</h2>
        {summary.byGroup.length === 0 ? (
          <p className="meta">No participants yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Attendance by group</caption>
              <thead>
                <tr><th scope="col">Group</th><th scope="col">Checked in</th><th scope="col">Checked out</th><th scope="col">Total</th></tr>
              </thead>
              <tbody>
                {summary.byGroup.map((g) => (
                  <tr key={g.groupName}>
                    <td data-label="Group">{g.groupName}</td>
                    <td data-label="Checked in">{g.checkedIn}</td>
                    <td data-label="Checked out">{g.departed}</td>
                    <td data-label="Total">{g.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Meals and checkpoints</h2>
        {summary.byCheckpoint.length === 0 ? (
          <p className="meta">No checkpoints yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Scans by checkpoint</caption>
              <thead>
                <tr><th scope="col">Checkpoint</th><th scope="col">Purpose</th><th scope="col">Recorded</th><th scope="col">Duplicates</th><th scope="col">Refused</th></tr>
              </thead>
              <tbody>
                {summary.byCheckpoint.map((c) => (
                  <tr key={c.checkpointId}>
                    <td data-label="Checkpoint">{c.name}</td>
                    <td data-label="Purpose">{KIND_LABEL[c.kind]}</td>
                    <td data-label="Recorded">{c.accepted}</td>
                    <td data-label="Duplicates">{c.duplicate}</td>
                    <td data-label="Refused">{c.refused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Find a participant</h2>
        <label>
          Name
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type at least two letters" />
        </label>
        {needle.length >= 2 && matches.length === 0 && <p className="meta">No one matches.</p>}
        {matches.length > 0 && (
          <ul className="plain-list">
            {matches.map((p) => {
              const status = statusOf(PARTICIPANT_STATUS, p.status);
              return (
                <li key={p.id} className="field-row-main">
                  <Link to={`/event-participants/${p.id}`}>{p.fullName}</Link>
                  <span className="meta">{groupName(p.groupId)}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
