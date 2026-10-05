import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { canManage, roleFor } from "../../app/roles";
import { api, ApiError } from "../../services/api";
import type { Group, PersonMatch } from "../../services/types";

// Search first, so a person who already attends another event is reused rather than duplicated.
export function RegisterParticipantPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PersonMatch[] | null>(null);
  const [selected, setSelected] = useState<PersonMatch | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listGroups(eventId)
      .then(({ groups: g }) => !cancelled && setGroups(g))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (state.status !== "signed-in") return null;
  if (!canManage(roleFor(state.user, state.memberships, eventId))) {
    return <p role="alert" className="error">Only event managers can register participants.</p>;
  }

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const { people } = await api.searchPeople(query.trim());
      setMatches(people);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed.");
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const group = groupId || null;
      const body = selected
        ? { personId: selected.id, groupId: group }
        : { person: { fullName: newName.trim(), phone: newPhone.trim() || undefined }, groupId: group };
      const { participant } = await api.createParticipant(eventId, body);
      navigate(`/event-participants/${participant.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register the participant.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = selected !== null || (creating && newName.trim().length > 0);

  return (
    <section>
      <p><Link to={`/events/${eventId}/participants`}>← Participants</Link></p>
      <h1>Register a participant</h1>

      <form onSubmit={handleSearch} className="form inline">
        <label>
          Find an existing person
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="At least 2 letters" />
        </label>
        <button type="submit" disabled={query.trim().length < 2}>Search</button>
      </form>

      {matches && (
        <ul className="plain-list">
          {matches.length === 0 && <li className="status">No one matches. You can create a new person below.</li>}
          {matches.map((m) => (
            <li key={m.id}>
              {m.fullName}{" "}
              <button type="button" onClick={() => { setSelected(m); setCreating(false); }}>
                {selected?.id === m.id ? "Selected" : "Use this person"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleRegister} className="form">
        {!selected && (
          <button type="button" onClick={() => setCreating(true)} disabled={creating}>
            Create a new person
          </button>
        )}
        {creating && !selected && (
          <>
            <label>
              Full name
              <input required maxLength={200} value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label>
              Phone (optional)
              <input maxLength={40} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Group (optional)
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? "Registering…" : "Register"}
        </button>
      </form>
    </section>
  );
}
