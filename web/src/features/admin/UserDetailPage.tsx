import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { describeError } from "../../app/errors";
import { Badge } from "../../components/Badge";
import { api } from "../../services/api";
import type { AdminUserDetail } from "../../services/types";

const MIN_PASSWORD = 12;

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const { state } = useAuth();
  const me = state.status === "signed-in" ? state.user : null;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { user: loaded } = await api.adminGetUser(userId);
        if (!cancelled) {
          setUser(loaded);
          setDisplayName(loaded.displayName);
          setIsAdmin(loaded.isAdmin);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(describeError(err, "Could not load this user."));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  if (loadError) return <p role="alert" className="error">{loadError}</p>;
  if (!user) return <p className="status">Loading user…</p>;

  const self = me?.id === user.id;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    setActionError(null);
    try {
      await action();
      setNotice(success);
      setConfirmingDeactivate(false);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: { displayName?: string; isAdmin?: boolean } = {};
    if (displayName.trim() !== user!.displayName) body.displayName = displayName.trim();
    if (isAdmin !== user!.isAdmin) body.isAdmin = isAdmin;
    if (Object.keys(body).length === 0) {
      setNotice("Nothing to save.");
      return;
    }
    void run(() => api.adminUpdateUser(user!.id, body), "Saved. The change is in the audit log.");
  }

  function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD) {
      setActionError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    void run(async () => {
      const result = await api.adminResetPassword(user!.id, newPassword);
      setNewPassword("");
      return result;
    }, "Password reset. Share the new password in person. Their existing sessions have ended.");
  }

  return (
    <section>
      <p><Link to="/admin/users" className="back-link">← Users</Link></p>
      <div className="page-head">
        <h1>{user.displayName}</h1>
        <div className="badges">
          {user.isAdmin && <Badge tone="blue">Administrator</Badge>}
          {user.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
        </div>
      </div>

      <dl className="facts card">
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Last sign-in</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</dd>
      </dl>

      {notice && <p role="status" className="notice">{notice}</p>}
      {actionError && <p role="alert" className="error">{actionError}</p>}

      <div className="card">
        <h2>Details</h2>
        {self && (
          <p className="meta">This is your account. You can't remove your own administrator access or deactivate it. Ask another administrator.</p>
        )}
        <form className="form" onSubmit={handleSave}>
          <label>
            Display name
            <input required maxLength={200} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={isAdmin} disabled={self} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrator
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>Save changes</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Event access</h2>
        {user.access.length === 0 ? (
          <p className="status">No event access yet.</p>
        ) : (
          <ul className="plain-list">
            {user.access.map((a) => (
              <li key={a.eventId}>
                <Link to={`/events/${a.eventId}/access`}>{a.eventName}</Link>
                <span className="meta">{a.role === "event_manager" ? "Event manager" : "Staff"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="meta">Event access is changed on each event's access page.</p>
      </div>

      <div className="card">
        <h2>Sign-in</h2>
        <form className="form inline" onSubmit={handleResetPassword}>
          <label>
            New password, at least {MIN_PASSWORD} characters
            <input type="password" autoComplete="new-password" maxLength={1024} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || newPassword.length === 0}>Reset password</button>
        </form>
        <div className="row-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || self}
            onClick={() => run(() => api.adminRevokeSessions(user.id), "Signed out everywhere.")}
          >
            Sign out everywhere
          </button>
          {user.isActive ? (
            confirmingDeactivate ? (
              <>
                <span className="meta">They are signed out and cannot sign in until reactivated. Their past actions stay in the audit log.</span>
                <button type="button" className="btn-danger" disabled={busy} onClick={() => run(() => api.adminUpdateUser(user.id, { isActive: false }), "Deactivated. They are signed out.")}>
                  Confirm deactivate
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirmingDeactivate(false)}>Keep active</button>
              </>
            ) : (
              <button type="button" className="btn-danger" disabled={busy || self} onClick={() => setConfirmingDeactivate(true)}>
                Deactivate
              </button>
            )
          ) : (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api.adminUpdateUser(user.id, { isActive: true }), "Reactivated. They can sign in again.")}>
              Reactivate
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
