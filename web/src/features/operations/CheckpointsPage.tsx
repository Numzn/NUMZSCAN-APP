import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { can, viewerOf } from "../../app/policy";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { Checkpoint, CheckpointKind, CheckpointRule, Occurrence } from "../../services/types";

export const KIND_LABEL: Record<CheckpointKind, string> = {
  gate: "Gate",
  check_in: "Check-in",
  service: "Service",
  activity: "Activity",
  meal: "Meal",
  transport: "Transport",
  departure: "Departure (check-out)",
  generic: "Other",
};

export const RULE_LABEL: Record<CheckpointRule, string> = {
  once_per_event: "Once for the whole camp",
  once_per_occurrence: "Once per service time",
  unlimited: "Unlimited",
};

const KINDS = Object.keys(KIND_LABEL) as CheckpointKind[];
const RULES = Object.keys(RULE_LABEL) as CheckpointRule[];

// The manager's checkpoint list. Checkpoints are where the camp is operated: check-in, check-out, meals and services.
export function CheckpointsPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const manage = can(viewerOf(state), "checkpoint.manage", eventId);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CheckpointKind>("meal");
  const [ruleType, setRuleType] = useState<CheckpointRule>("once_per_occurrence");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!manage) return;
    let cancelled = false;
    api
      .checkpoints(eventId)
      .then(({ checkpoints: loaded }) => !cancelled && setCheckpoints(loaded))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load checkpoints."));
    return () => {
      cancelled = true;
    };
  }, [eventId, version, manage]);

  if (state.status !== "signed-in") return null;
  if (!manage) return <p role="alert" className="error">Only event managers can manage checkpoints.</p>;

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      setNotice(done);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(async () => {
      await api.createCheckpoint(eventId, { name: name.trim(), kind, ruleType });
      setName("");
    }, "Checkpoint added.");
  }

  return (
    <section>
      <PageHeader title="Checkpoints" description="Where the camp is operated: check-in, check-out, meals and services." />
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}

      {!checkpoints ? (
        <LoadingState>Loading checkpoints…</LoadingState>
      ) : checkpoints.length === 0 ? (
        <EmptyState>No checkpoints yet. Add one below to start operating the camp.</EmptyState>
      ) : (
        <ul className="plain-list checkpoint-list">
          {checkpoints.map((cp) => (
            <CheckpointRow
              key={cp.id}
              checkpoint={cp}
              busy={busy}
              onSave={(body, done) => run(() => api.updateCheckpoint(cp.id, body), done)}
            />
          ))}
        </ul>
      )}

      <form onSubmit={create} className="card form">
        <h2>Add a checkpoint</h2>
        <label>
          Name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example Lunch, Day 1" />
        </label>
        <label>
          Purpose
          <select value={kind} onChange={(e) => setKind(e.target.value as CheckpointKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label>
          How often each person may be recorded
          <select value={ruleType} onChange={(e) => setRuleType(e.target.value as CheckpointRule)}>
            {RULES.map((r) => (
              <option key={r} value={r}>{RULE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" disabled={busy || name.trim().length === 0}>Add checkpoint</button>
        </div>
      </form>
    </section>
  );
}

interface CheckpointRowProps {
  checkpoint: Checkpoint;
  busy: boolean;
  onSave: (body: { name?: string; kind?: CheckpointKind; ruleType?: CheckpointRule; active?: boolean }, done: string) => void;
}

function CheckpointRow({ checkpoint, busy, onSave }: CheckpointRowProps) {
  const [name, setName] = useState(checkpoint.name);
  const [kind, setKind] = useState<CheckpointKind>(checkpoint.kind);
  const [ruleType, setRuleType] = useState<CheckpointRule>(checkpoint.ruleType);
  const locked = checkpoint.hasScans;
  const dirty = name.trim() !== checkpoint.name || kind !== checkpoint.kind || ruleType !== checkpoint.ruleType;

  return (
    <li className="card checkpoint-row">
      <div className="field-row-main">
        <strong>{checkpoint.name}</strong>
        <Badge tone={checkpoint.active ? "green" : "grey"}>{checkpoint.active ? "Open" : "Closed"}</Badge>
        <span className="meta">{KIND_LABEL[checkpoint.kind]}</span>
        <span className="meta">{RULE_LABEL[checkpoint.ruleType]}</span>
        {locked && <span className="meta">Has scans: purpose and rule are fixed</span>}
      </div>
      <details>
        <summary>Edit {checkpoint.name}</summary>
        <div className="form">
          <label>
            Name
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Purpose
            <select value={kind} disabled={locked} onChange={(e) => setKind(e.target.value as CheckpointKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label>
            How often each person may be recorded
            <select value={ruleType} disabled={locked} onChange={(e) => setRuleType(e.target.value as CheckpointRule)}>
              {RULES.map((r) => (
                <option key={r} value={r}>{RULE_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button
              type="button"
              disabled={busy || !dirty || name.trim().length === 0}
              onClick={() =>
                onSave(
                  { name: name.trim(), ...(locked ? {} : { kind, ruleType }) },
                  "Checkpoint saved."
                )
              }
            >
              Save changes
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => onSave({ active: !checkpoint.active }, checkpoint.active ? "Checkpoint closed. It takes no scans now." : "Checkpoint opened.")}
            >
              {checkpoint.active ? "Close checkpoint" : "Open checkpoint"}
            </button>
          </div>
        </div>
      </details>
      <ServiceTimes checkpointId={checkpoint.id} />
    </li>
  );
}

// The service times a checkpoint runs at. A scan is only accepted inside one of them.
function ServiceTimes({ checkpointId }: { checkpointId: string }) {
  const [occurrences, setOccurrences] = useState<Occurrence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .occurrences(checkpointId)
      .then(({ occurrences: loaded }) => !cancelled && setOccurrences(loaded))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load service times."));
    return () => {
      cancelled = true;
    };
  }, [checkpointId, version]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Times are entered in this device's time zone and stored as exact instants.
    const startsAt = new Date(`${date}T${start}`).toISOString();
    const endsAt = new Date(`${date}T${end}`).toISOString();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError("The service must end after it starts. A service that runs past midnight needs its own day.");
      return;
    }
    try {
      await api.createOccurrence(checkpointId, { label: label.trim(), serviceDate: date, startsAt, endsAt });
      setLabel("");
      setVersion((v) => v + 1);
    } catch (err) {
      // Name the field the server refused, so the organiser knows what to change.
      const detail = err instanceof ApiError && Array.isArray(err.details) ? (err.details as { message?: string }[])[0]?.message : undefined;
      setError(detail ? `Could not add the service time: ${detail}.` : err instanceof ApiError ? err.message : "Could not add the service time.");
    }
  }

  return (
    <div className="service-times">
      <h3>Service times</h3>
      {error && <p role="alert" className="error">{error}</p>}
      {!occurrences ? (
        <p className="status">Loading…</p>
      ) : occurrences.length === 0 ? (
        <p className="meta">No service times yet. A scan is refused until one exists.</p>
      ) : (
        <ul className="plain-list">
          {occurrences.map((o) => (
            <li key={o.id}>
              {o.label} · {o.serviceDate} · {new Date(o.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–
              {new Date(o.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="form inline">
        <label>
          Label
          <input required maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Date
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Starts
          <input required type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Ends
          <input required type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="submit">Add service time</button>
      </form>
    </div>
  );
}
