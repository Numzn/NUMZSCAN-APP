import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { describeError } from "../../app/errors";
import { EVENT_STATUS, statusOf } from "../../app/labels";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../services/api";
import type { CampEvent } from "../../services/types";
import { LoadingState } from "../../components/States";

type Settings = Pick<CampEvent, "name" | "status" | "timezone" | "startsOn" | "endsOn">;

export function EventSettingsPage() {
  const { eventId = "" } = useParams();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getEvent(eventId)
      .then(({ event: loaded }) => {
        if (cancelled) return;
        setEvent(loaded);
        setForm({ name: loaded.name, status: loaded.status, timezone: loaded.timezone, startsOn: loaded.startsOn, endsOn: loaded.endsOn });
      })
      .catch((err) => !cancelled && setLoadError(describeError(err, "Could not load this event.")));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loadError) return <p role="alert" className="error">{loadError}</p>;
  if (!event || !form) return <LoadingState>Loading event…</LoadingState>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value });

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice(null);
    if (form!.endsOn < form!.startsOn) {
      setSaveError("Ends on must not be before Starts on.");
      return;
    }
    // Only changed fields are sent, so the audit entry records real changes.
    const changed: Partial<Settings> = {};
    (Object.keys(form!) as (keyof Settings)[]).forEach((key) => {
      if (form![key] !== event![key]) (changed as Record<string, unknown>)[key] = form![key];
    });
    if (Object.keys(changed).length === 0) {
      setNotice("Nothing to save.");
      return;
    }
    setBusy(true);
    try {
      const { event: saved } = await api.updateEvent(eventId, changed);
      setEvent(saved);
      setNotice("Saved. The change is in the audit log.");
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const status = statusOf(EVENT_STATUS, event.status);

  return (
    <section>
      <PageHeader
        title={event.name}
        crumbs={[{ label: "Admin", to: "/admin" }, { label: "Events", to: "/admin/events" }, { label: event.name }]}
        badge={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <form className="card form" onSubmit={handleSave}>
        <h2>Settings</h2>
        <label>
          Name
          <input required maxLength={200} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => set("status", e.target.value as Settings["status"])}>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
          <span className="meta">Closing or archiving keeps all data. Nothing is deleted.</span>
        </label>
        <label>
          Starts on
          <input type="date" required value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
        </label>
        <label>
          Ends on
          <input type="date" required value={form.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
        </label>
        <label>
          Timezone
          <input required value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </label>
        {notice && <p role="status" className="notice">{notice}</p>}
        {saveError && <p role="alert" className="error">{saveError}</p>}
        <div className="form-actions">
          <button type="submit" disabled={busy}>Save changes</button>
        </div>
      </form>

      <p className="meta"><Link to={`/events/${event.id}/access`}>Access for this event</Link></p>
    </section>
  );
}
