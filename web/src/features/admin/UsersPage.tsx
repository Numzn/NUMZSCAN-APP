import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { describeError } from "../../app/errors";
import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../services/api";
import type { AdminUser } from "../../services/types";

const MIN_PASSWORD = 12;

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "deactivated" | "all">("all");
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { users: list, total: count } = await api.adminListUsers({ q: search.trim(), status, limit: 100 });
        if (!cancelled) {
          setUsers(list);
          setTotal(count);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(describeError(err, "Could not load users."));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [search, status, version]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    if (password.length < MIN_PASSWORD) {
      setFormError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    try {
      const { user } = await api.adminCreateUser({ email: email.trim(), displayName: displayName.trim(), password, isAdmin });
      setNotice(`${user.displayName} can now sign in. Share the password with them in person.`);
      setEmail("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
      setAdding(false);
      setVersion((v) => v + 1);
    } catch (err) {
      setFormError(describeError(err, "Could not create the user."));
    }
  }

  return (
    <section>
      <PageHeader
        title="Users"
        actions={<button type="button" onClick={() => { setAdding((v) => !v); setFormError(null); }}>{adding ? "Close" : "Add user"}</button>}
      />

      {notice && <p role="status" className="notice">{notice}</p>}

      {adding && (
        <form className="card form" onSubmit={handleCreate}>
          <h2>Add user</h2>
          <label>
            Email
            <input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Display name
            <input required maxLength={200} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            Initial password, at least {MIN_PASSWORD} characters
            <input type="password" autoComplete="new-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="meta">Share it in person. Email is not set up yet, so nothing is sent.</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrator
          </label>
          {formError && <p role="alert" className="error">{formError}</p>}
          <div className="form-actions">
            <button type="submit">Create user</button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <label>
          Search
          <input type="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </label>
      </div>

      {loadError && <p role="alert" className="error">{loadError}</p>}
      {!users && !loadError && <p className="status">Loading users…</p>}
      {users && (
        <>
          <p className="meta">{total} {total === 1 ? "user" : "users"}</p>
          {users.length === 0 ? (
            <p className="status">No users match.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name"><Link to={`/admin/users/${u.id}`}>{u.displayName}</Link></td>
                    <td data-label="Email">{u.email}</td>
                    <td data-label="Role">{u.isAdmin ? "Administrator" : "Member"}</td>
                    <td data-label="Status">
                      {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
