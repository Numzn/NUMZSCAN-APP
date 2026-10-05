import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { can, viewerOf } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { FormField } from "../../services/types";
import { FIELD_TYPES, TYPE_LABEL, draftFrom, groupBySection, parseOptions, takesOptions, validateDraft, type FieldDraft } from "./fieldRules";

type Editing = { mode: "add" } | { mode: "edit"; fieldId: string } | null;

// Builds the registration form: an ordered list of questions, grouped by section, with an editor for one field at a time.
export function FormBuilderPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const canManage = can(viewerOf(state), "event.registration.manage", eventId);

  const [fields, setFields] = useState<FormField[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    api
      .registrationForm(eventId)
      .then(({ fields: loaded }) => !cancelled && setFields(loaded))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load the form."));
    return () => {
      cancelled = true;
    };
  }, [eventId, canManage]);

  if (state.status !== "signed-in") return null;
  if (!canManage) return <p role="alert" className="error">Only event managers can edit the registration form.</p>;
  if (error && !fields) return <p role="alert" className="error">{error}</p>;
  if (!fields) return <LoadingState>Loading the form…</LoadingState>;

  const editingField = editing?.mode === "edit" ? fields.find((f) => f.id === editing.fieldId) ?? null : null;

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!fields || target < 0 || target >= fields.length) return;
    const order = fields.map((f) => f.id);
    [order[index], order[target]] = [order[target], order[index]];
    setBusy(true);
    setError(null);
    try {
      const { fields: updated } = await api.reorderRegistrationFields(eventId, order);
      setFields(updated);
      setNotice(`Moved "${fields[index].label}".`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(field: FormField) {
    setBusy(true);
    setError(null);
    try {
      await api.removeRegistrationField(eventId, field.id);
      setFields((list) => (list ?? []).filter((f) => f.id !== field.id));
      setConfirmRemove(null);
      setNotice(`Removed "${field.label}" from the form. Answers already given are kept.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(draft: FieldDraft) {
    setBusy(true);
    setError(null);
    const body = {
      label: draft.label.trim(),
      type: draft.type,
      required: draft.required,
      section: draft.section.trim() || null,
      options: takesOptions(draft.type) ? parseOptions(draft.optionsText) : null,
    };
    try {
      if (editing?.mode === "edit") {
        const { field } = await api.updateRegistrationField(eventId, editing.fieldId, body);
        setFields((list) => (list ?? []).map((f) => (f.id === field.id ? field : f)));
        setNotice(`Saved "${field.label}".`);
      } else {
        const { field } = await api.addRegistrationField(eventId, body);
        setFields((list) => [...(list ?? []), field]);
        setNotice(`Added "${field.label}" to the end of the form. Move it if it belongs elsewhere.`);
      }
      setEditing(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const groups = groupBySection(fields);
  const flat = fields;

  return (
    <section>
      <PageHeader title="Registration form" description="Build the information you need from participants." />
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}

      {flat.length === 0 ? (
        <p className="state-empty">The form has no questions yet. Add one to start.</p>
      ) : (
        groups.map((group) => (
          <section key={group.title} className="form-section" aria-labelledby={`section-${slugOf(group.title)}`}>
            <h2 id={`section-${slugOf(group.title)}`}>{group.title}</h2>
            <ul className="field-list">
              {group.fields.map((field) => {
                const index = flat.findIndex((f) => f.id === field.id);
                return (
                  <li key={field.id} className="field-row">
                    <div className="field-row-main">
                      <strong>{field.label}</strong>
                      <span className="meta">{TYPE_LABEL[field.type]}</span>
                      <span className="meta">{field.required ? "Required" : "Optional"}</span>
                      {field.personField && <span className="meta">Identifies the person</span>}
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn-ghost" aria-label={`Move ${field.label} up`} onClick={() => move(index, -1)} disabled={busy || index === 0}>
                        Up
                      </button>
                      <button type="button" className="btn-ghost" aria-label={`Move ${field.label} down`} onClick={() => move(index, 1)} disabled={busy || index === flat.length - 1}>
                        Down
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setEditing({ mode: "edit", fieldId: field.id })} disabled={busy}>
                        Edit<span className="sr-only"> {field.label}</span>
                      </button>
                      {!field.personField && (
                        <button type="button" className="btn-danger" onClick={() => setConfirmRemove(field.id)} disabled={busy}>
                          Remove<span className="sr-only"> {field.label}</span>
                        </button>
                      )}
                    </div>
                    {confirmRemove === field.id && (
                      <div className="confirm-row" role="group" aria-label={`Confirm removing ${field.label}`}>
                        <p>Remove “{field.label}”? It leaves the form. Answers already given are kept.</p>
                        <div className="row-actions">
                          <button type="button" className="btn-danger" onClick={() => remove(field)} disabled={busy}>Confirm remove</button>
                          <button type="button" className="btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {editing ? (
        <FieldEditor
          key={editing.mode === "edit" ? editing.fieldId : "new"}
          field={editingField}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div>
          <button type="button" onClick={() => setEditing({ mode: "add" })} disabled={busy}>
            Add field
          </button>
        </div>
      )}
    </section>
  );
}

interface FieldEditorProps {
  field: FormField | null;
  busy: boolean;
  onSave: (draft: FieldDraft) => void;
  onCancel: () => void;
}

// The settings for one field. Person fields keep their type and stay required, because the server requires both.
function FieldEditor({ field, busy, onSave, onCancel }: FieldEditorProps) {
  const [draft, setDraft] = useState<FieldDraft>(() => draftFrom(field));
  const [attempted, setAttempted] = useState(false);
  const locked = field?.personField != null;
  const errors = validateDraft(draft);
  const hasErrors = Object.keys(errors).length > 0;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    if (!hasErrors) onSave(draft);
  }

  return (
    <form className="form field-editor" onSubmit={submit} aria-labelledby="field-editor-title" noValidate>
      <h2 id="field-editor-title">{field ? `Edit “${field.label}”` : "Add a field"}</h2>
      <label>
        Label
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          maxLength={120}
          aria-invalid={attempted && errors.label ? true : undefined}
          aria-describedby={attempted && errors.label ? "field-label-error" : undefined}
        />
      </label>
      {attempted && errors.label && <p id="field-label-error" className="field-error">{errors.label}</p>}
      <label>
        Type
        <select
          value={draft.type}
          disabled={locked}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldDraft["type"] })}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
      </label>
      {takesOptions(draft.type) && (
        <label>
          Options
          <textarea
            rows={4}
            value={draft.optionsText}
            onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })}
            aria-invalid={attempted && errors.options ? true : undefined}
            aria-describedby={attempted && errors.options ? "field-options-error" : "field-options-help"}
          />
        </label>
      )}
      {takesOptions(draft.type) && (
        <>
          <p id="field-options-help" className="meta">One option per line. At least two.</p>
          {attempted && errors.options && <p id="field-options-error" className="field-error">{errors.options}</p>}
        </>
      )}
      <label>
        Section
        <input value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })} maxLength={60} placeholder="For example Church information" />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={locked ? true : draft.required}
          disabled={locked}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
        />
        Required{locked && <span className="meta"> — always required for this field</span>}
      </label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>Save field</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general";
}

// Names the server's own message, and the field it refers to when it gives one.
function messageOf(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  const details = Array.isArray(err.details) ? (err.details as { message?: string }[]) : [];
  const first = details[0]?.message;
  return first ? `${err.message}: ${first}.` : err.message;
}
