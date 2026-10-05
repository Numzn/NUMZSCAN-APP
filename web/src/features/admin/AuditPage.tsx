import { useEffect, useState } from "react";
import { describeError } from "../../app/errors";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../services/api";
import type { AuditEntry, CampEvent } from "../../services/types";
import { AUDIT_ACTIONS, actionLabel, describeEntry } from "./auditText";

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [events, setEvents] = useState<CampEvent[]>([]);
  const [action, setAction] = useState("");
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api.listEvents().then(({ events: list }) => setEvents(list)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api
      .adminAudit({ action: action || undefined, eventId: eventId || undefined, limit: 50 })
      .then(({ entries: list, nextBefore: cursor }) => {
        if (cancelled) return;
        setEntries(list);
        setNextBefore(cursor);
        setError(null);
      })
      .catch((err) => !cancelled && setError(describeError(err, "Could not load the audit log.")));
    return () => {
      cancelled = true;
    };
  }, [action, eventId]);

  async function loadOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const { entries: more, nextBefore: cursor } = await api.adminAudit({
        action: action || undefined,
        eventId: eventId || undefined,
        limit: 50,
        before: nextBefore,
      });
      setEntries((current) => [...(current ?? []), ...more]);
      setNextBefore(cursor);
    } catch (err) {
      setError(describeError(err, "Could not load older entries."));
    } finally {
      setLoadingMore(false);
    }
  }

  const eventName = (id: string | null) => (id ? events.find((e) => e.id === id)?.name ?? "Unknown event" : "All events");

  return (
    <section>
      <PageHeader title="Audit log" description="Every change to users, event access, and event settings. Entries cannot be edited or deleted." />

      <div className="toolbar">
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {Object.keys(AUDIT_ACTIONS).map((code) => (
              <option key={code} value={code}>{AUDIT_ACTIONS[code]}</option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {!entries && !error && <p className="status">Loading the audit log…</p>}
      {entries && entries.length === 0 && <p className="status">No entries match these filters.</p>}
      {entries && entries.length > 0 && (
        <>
          <table className="table">
            <thead>
              <tr><th>When</th><th>Who</th><th>What</th><th>Event</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="When">{new Date(entry.occurredAt).toLocaleString()}</td>
                  <td data-label="Who">{entry.actorName ?? "Unknown"}</td>
                  <td data-label="What">
                    {actionLabel(entry.action)}
                    <span className="meta code">{entry.action}</span>
                  </td>
                  <td data-label="Event">{eventName(entry.eventId)}</td>
                  <td data-label="Detail"><span className="meta">{describeEntry(entry)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextBefore && (
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load older entries"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
