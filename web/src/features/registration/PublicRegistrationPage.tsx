import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { formatEventDates } from "../../app/dates";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { Confirmation, PublicField, PublicRegistration } from "../../services/types";
import { groupBySection } from "./fieldRules";

type Answer = string | boolean;

// The page a person opens from the registration link or QR code. It is public: no sidebar, no account, no
// navigation. It shows the event, the form when it is open, and a confirmation the person can keep.
export function PublicRegistrationPage() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<PublicRegistration | null>(null);
  const [loadError, setLoadError] = useState<"not-found" | "failed" | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // One id per visit. A retried or double-pressed submit carries the same id, so the server registers the person once.
  const [submissionId] = useState(() => crypto.randomUUID());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .publicRegistration(slug)
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setAnswers(initialAnswers(loaded.registration.fields));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError && err.status === 404 ? "not-found" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loadError === "not-found") {
    return (
      <Shell>
        <PageHeader title="Event not found" />
        <p>This registration link does not match an event. Check the link you were given.</p>
      </Shell>
    );
  }
  if (loadError === "failed") {
    return (
      <Shell>
        <PageHeader title="Registration" />
        <p role="alert" className="error">Registration could not be loaded. Try again in a moment.</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <LoadingState>Loading registration…</LoadingState>
      </Shell>
    );
  }

  const { event, registration } = data;
  const dates = `${formatEventDates(event.startsOn, event.endsOn)} · ${event.timezone}`;

  if (confirmation) {
    return (
      <Shell>
        <EventSummary name={event.name} dates={dates} />
        <PageHeader title="Registration complete" />
        <div className="public-section">
          <p className="public-thanks">Thank you, {confirmation.firstName}.</p>
          <p>You are registered for:</p>
          <p className="public-event-name">{confirmation.eventName}</p>
          <p className="meta">{formatEventDates(confirmation.startsOn, confirmation.endsOn)} · {confirmation.timezone}</p>
          <p className="meta">Registration reference</p>
          <p className="public-reference">{confirmation.reference}</p>
          <p className="meta">Keep this reference. Your event manager may provide your camp pass before the event.</p>
        </div>
      </Shell>
    );
  }

  if (registration.status === "draft") {
    return (
      <Shell>
        <EventSummary name={event.name} dates={dates} />
        <PageHeader title="Registration not open yet" />
        <p>Registration for {event.name} has not opened yet. Try again later.</p>
      </Shell>
    );
  }
  if (registration.status === "closed") {
    return (
      <Shell>
        <EventSummary name={event.name} dates={dates} />
        <PageHeader title="Registration closed" />
        <p>Registration for {event.name} is no longer accepting new participants.</p>
      </Shell>
    );
  }

  function setAnswer(key: string, value: Answer) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problems = missingRequired(registration.fields, answers);
    setFieldErrors(problems);
    setFormError(Object.keys(problems).length > 0 ? "Please answer the highlighted questions." : null);
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const { confirmation: done } = await api.submitPublicRegistration(slug, { submissionId, answers: outgoing(registration.fields, answers) });
      setConfirmation(done);
    } catch (err) {
      setFormError(await explain(err, setFieldErrors, () => setData((current) => current && { ...current, registration: { status: "closed", fields: [] } })));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <EventSummary name={event.name} dates={dates} />
      <PageHeader title="Participant registration" />
      <p className="meta">Required questions are marked with an asterisk (*).</p>
      <form className="public-form" onSubmit={handleSubmit} noValidate>
        {groupBySection(registration.fields).map((group) => (
          <section key={group.title} className="public-section" aria-labelledby={`section-${group.title.toLowerCase().replace(/\W+/g, "-")}`}>
            <h2 id={`section-${group.title.toLowerCase().replace(/\W+/g, "-")}`} className="public-section-title">{group.title}</h2>
            {group.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={answers[field.key]}
                error={fieldErrors[field.key]}
                onChange={(value) => setAnswer(field.key, value)}
              />
            ))}
          </section>
        ))}
        {formError && <p role="alert" className="error">{formError}</p>}
        <button type="submit" className="public-submit" disabled={submitting}>
          {submitting ? "Registering…" : "Register"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="public-page">
      <header className="public-header">
        <span className="public-brand">EventPass</span>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

function EventSummary({ name, dates }: { name: string; dates: string }) {
  return (
    <div className="public-event">
      <p className="public-eyebrow">{name}</p>
      <p className="meta">{dates}</p>
    </div>
  );
}

interface FieldInputProps {
  field: PublicField;
  value: Answer | undefined;
  error: string | undefined;
  onChange: (value: Answer) => void;
}

function FieldInput({ field, value, error, onChange }: FieldInputProps) {
  const id = `field-${field.key}`;
  const errorId = `${id}-error`;
  const described = error ? errorId : undefined;
  const label = (
    <>
      {field.label}
      {field.required && <span aria-hidden="true"> *</span>}
    </>
  );

  if (field.type === "checkbox") {
    return (
      <div className="public-field">
        <label className="public-check">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
          />
          <span>
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </span>
        </label>
        {error && <p id={errorId} className="field-error">{error}</p>}
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className="public-field public-radio" aria-describedby={described}>
        <legend>{label}</legend>
        {(field.options ?? []).map((option, index) => (
          <label key={option} className="public-check">
            <input
              id={index === 0 ? id : `${id}-${index}`}
              type="radio"
              name={id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
        {error && <p id={errorId} className="field-error">{error}</p>}
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : "";
  let control;
  if (field.type === "dropdown") {
    control = (
      <select id={id} value={text} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={described} required={field.required}>
        <option value="">Choose…</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  } else if (field.type === "long_text") {
    control = (
      <textarea id={id} rows={4} maxLength={2000} value={text} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={described} />
    );
  } else {
    control = (
      <input
        id={id}
        type={inputTypeOf(field.type)}
        inputMode={field.type === "phone" ? "tel" : field.type === "number" ? "decimal" : undefined}
        autoComplete={autoCompleteOf(field.key)}
        maxLength={field.type === "phone" ? 40 : 200}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
    );
  }

  return (
    <div className="public-field">
      <label htmlFor={id}>{label}</label>
      {control}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}

function inputTypeOf(type: PublicField["type"]): string {
  switch (type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "date":
      return "date";
    default:
      return "text";
  }
}

// Helps phones fill in the right suggestions. Only the field keys the default form uses are matched.
function autoCompleteOf(key: string): string | undefined {
  if (key === "first_name") return "given-name";
  if (key === "last_name") return "family-name";
  if (key === "email") return "email";
  if (key === "phone") return "tel";
  return undefined;
}

function initialAnswers(fields: PublicField[]): Record<string, Answer> {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? false : ""]));
}

// Required answers that are blank, named by field. The server repeats this check; this is only so people see it first.
function missingRequired(fields: PublicField[], answers: Record<string, Answer>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of fields) {
    if (!field.required) continue;
    const value = answers[field.key];
    if (field.type === "checkbox") {
      if (value !== true) problems[field.key] = `${field.label} must be ticked`;
    } else if (typeof value !== "string" || value.trim() === "") {
      problems[field.key] = `${field.label} is required`;
    }
  }
  return problems;
}

// What is sent: text trimmed, and only answers that have a value. Checkboxes always send yes or no.
function outgoing(fields: PublicField[], answers: Record<string, Answer>): Record<string, string | boolean> {
  const body: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = answers[field.key];
    if (field.type === "checkbox") body[field.key] = value === true;
    else if (typeof value === "string" && value.trim() !== "") body[field.key] = value.trim();
  }
  return body;
}

// Shows what the server refused. A field-level refusal lands on its field; anything else becomes a plain message.
async function explain(
  err: unknown,
  setFieldErrors: (errors: Record<string, string>) => void,
  markClosed: () => void
): Promise<string> {
  if (!(err instanceof ApiError)) return "Your registration was not sent. Check your connection and press Register again.";
  if (err.code === "REGISTRATION_CLOSED" || err.code === "REGISTRATION_NOT_OPEN") {
    markClosed();
    return "Registration is no longer open.";
  }
  if (err.code === "ALREADY_REGISTERED") return "You are already registered for this event.";
  if (err.status === 400 && Array.isArray(err.details)) {
    const errors: Record<string, string> = {};
    for (const detail of err.details as { path?: string; message?: string }[]) {
      if (detail.path && detail.message) errors[detail.path] = detail.message;
    }
    setFieldErrors(errors);
    return "Please check the highlighted answers.";
  }
  return "Something went wrong. Press Register again to retry.";
}
