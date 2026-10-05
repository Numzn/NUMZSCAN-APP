import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { describeError } from "../../app/errors";
import { canManage, roleFor } from "../../app/roles";
import { api, ApiError } from "../../services/api";
import type { AccessRow, AdminUser, CampEvent } from "../../services/types";

type Role = "event_manager" | "staff";
const ROLE_LABEL: Record<Role, string> = { event_manager: "Event manager", staff: "Staff" };

export function AccessPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const me = state.status === "signed-in" ? state.user : null;
  const isAdmin = Boolean(me?.isAdmin);
  const manager = state.status === "signed-in" && canManage(roleFor(state.user, state.memberships, eventId));

  const [event, setEvent] = useState<CampEvent | null>(null);
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [newRole, setNewRole] = useState<Role>("staff");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ event: e }, { memberships }] = await Promise.all([api.getEvent(eventId), api.listMemberships(eventId)]);
        if (!cancelled) {
          setEvent(e);
          setRows(memberships);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError && err.status === 403 ? "Only administrators and this event's managers can see its access list." : describeError(err, "Could not load access."));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, version]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api
      .adminListUsers({ q: search.trim(), status: "active", limit: 20 })
      .then(({ users }) => !cancelled && setCandidates(users))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin, search]);

  if (loadError) return <p role="alert" className="error">{loadError}</p>;
  if (!event || !rows) return <p className="status">Loading access…</p>;

  const onList = new Set(rows.map((r) => r.userId));
  const addable = candidates.filter((u) => !onList.has(u.id));

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    setActionError(null);
    try {
      await action();
      setNotice(success);
      setRemoving(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pickedId) {
      setActionError("Choose a person to add.");
      return;
    }
    void run(async () => {
      await api.addMembership(eventId, { userId: pickedId, role: newRole });
      setPickedId("");
      setSearch("");
    }, "Added. The change is in the audit log.");
  }

  return (
    <section>
      <p><Link to={`/events/${eventId}`} className="back-link">← {event.name}</Link></p>
      <h1>Access</h1>
      <p className="meta">Who can work on {event.name}, and in what role.</p>

      {!isAdmin && manager && (
        <p className="meta">Only administrators can add, change, or remove access. You can see the list.</p>
      )}

      {notice && <p role="status" className="notice">{notice}</p>}
      {actionError && <p role="alert" className="error">{actionError}</p>}

      {rows.length === 0 ? (
        <p className="status">No one has access to this event yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Person</th><th>Role</th>{isAdmin && <th aria-label="Actions" />}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <td data-label="Person">
                  {row.displayName}
                  <span className="meta block">{row.email}</span>
                </td>
                <td data-label="Role">
                  {isAdmin ? (
                    <select
                      aria-label={`Role for ${row.displayName}`}
                      value={row.role}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() => api.changeMembership(eventId, row.userId, e.target.value as Role), "Role changed. The change is in the audit log.")
                      }
                    >
                      <option value="event_manager">Event manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  ) : (
                    ROLE_LABEL[row.role]
                  )}
                </td>
                {isAdmin && (
                  <td data-label="Actions" className="row-actions-cell">
                    {removing === row.userId ? (
                      <span className="row-actions">
                        <button type="button" className="btn-danger" disabled={busy} onClick={() => run(() => api.removeMembership(eventId, row.userId), "Removed. Their other events are unchanged.")}>
                          Confirm remove
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setRemoving(null)}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" className="btn-danger" disabled={busy} onClick={() => setRemoving(row.userId)}>Remove</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <form className="card form" onSubmit={handleAdd}>
          <h2>Add a person</h2>
          <label>
            Find by name or email
            <input type="search" value={search} placeholder="Start typing" onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Person
            <select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
              <option value="">Choose a person</option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              <option value="staff">Staff</option>
              <option value="event_manager">Event manager</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>Add to event</button>
          </div>
        </form>
      )}
    </section>
  );
}
