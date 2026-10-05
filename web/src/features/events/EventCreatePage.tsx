import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { api, ApiError } from "../../services/api";
import { slugify } from "./slug";

// The server names fields by their API keys. The form shows the labels the user sees.
const FIELD_LABELS: Record<string, string> = {
  slug: "Web address",
  name: "Name",
  kind: "Kind",
  timezone: "Timezone",
  startsOn: "Starts on",
  endsOn: "Ends on",
};

function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Could not create the event.";
  const details = Array.isArray(err.details) ? (err.details as { path?: string; message?: string }[]) : [];
  if (details.length === 0) return err.message;
  const problems = details.map((d) => `${FIELD_LABELS[d.path ?? ""] ?? d.path ?? "Form"}: ${d.message ?? "is not valid"}`);
  return `${err.message}. ${problems.join(". ")}.`;
}

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
    if (endsOn < startsOn) {
      setError("Ends on must not be before Starts on.");
      return;
    }
    setSubmitting(true);
    try {
      const { event: created } = await api.createEvent({ slug, name: name.trim(), kind, timezone: timezone.trim(), startsOn, endsOn });
      navigate(`/events/${created.id}`);
    } catch (err) {
      setError(describeError(err));
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
            minLength={3}
            maxLength={60}
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
