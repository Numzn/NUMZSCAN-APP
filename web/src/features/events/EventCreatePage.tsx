import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { api, ApiError } from "../../services/api";
import { slugify } from "./slug";

export function EventCreatePage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [kind, setKind] = useState<"church_camp" | "generic">("church_camp");
  const [timezone, setTimezone] = useState("Africa/Lusaka");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status !== "signed-in") return null;
  if (!state.user.isAdmin) {
    return <p role="alert" className="error">Only administrators can create events.</p>;
  }

  function handleName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { event: created } = await api.createEvent({ slug, name: name.trim(), kind, timezone: timezone.trim(), startsOn, endsOn });
      navigate(`/events/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1>New event</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Name
          <input required value={name} onChange={(e) => handleName(e.target.value)} />
        </label>
        <label>
          Web address (slug)
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
          />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as "church_camp" | "generic")}>
            <option value="church_camp">Church camp</option>
            <option value="generic">Other event</option>
          </select>
        </label>
        <label>
          Timezone
          <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>
        <label>
          Starts on
          <input type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label>
          Ends on
          <input type="date" required value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create event"}</button>
      </form>
    </section>
  );
}
