import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { can, viewerOf } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { api, ApiError } from "../../services/api";
import type { CampEvent, Group, GroupKind } from "../../services/types";

const KIND_LABEL: Record<GroupKind, string> = { church: "Church", dorm: "Dormitory", team: "Team" };

export function GroupsPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GroupKind>("church");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ event: loadedEvent }, { groups: loadedGroups }] = await Promise.all([
          api.getEvent(eventId),
          api.listGroups(eventId),
        ]);
        if (!cancelled) {
          setEvent(loadedEvent);
          setGroups(loadedGroups);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load groups.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, version]);

  if (state.status !== "signed-in") return null;
  const manager = can(viewerOf(state), "event.manage", eventId);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api.createGroup(eventId, { name: name.trim(), kind });
      setName("");
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the group.");
    }
  }

  if (error && !groups) return <p role="alert" className="error">{error}</p>;
  if (!groups || !event) return <p className="status">Loading groups…</p>;

  return (
    <section>
      <PageHeader title="Groups" />
      {groups.length === 0 ? (
        <p className="status">No groups yet.</p>
      ) : (
        <ul className="plain-list">
          {groups.map((g) => (
            <li key={g.id}>
              <strong>{g.name}</strong> <span className="meta">{KIND_LABEL[g.kind]}</span>
            </li>
          ))}
        </ul>
      )}
      {manager && (
        <form onSubmit={handleCreate} className="form">
          <h2>Add a group</h2>
          <label>
            Name
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as GroupKind)}>
              <option value="church">Church</option>
              <option value="dorm">Dormitory</option>
              <option value="team">Team</option>
            </select>
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="submit">Add group</button>
        </form>
      )}
    </section>
  );
}
