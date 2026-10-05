import type { FormField, RegistrationFieldType } from "../../services/types";

// The field types a manager can choose, in the order the form builder offers them.
export const FIELD_TYPES: { type: RegistrationFieldType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "dropdown", label: "Dropdown" },
  { type: "radio", label: "Radio" },
  { type: "checkbox", label: "Checkbox" },
  { type: "long_text", label: "Long text" },
];

export const TYPE_LABEL: Record<RegistrationFieldType, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.type, t.label])
) as Record<RegistrationFieldType, string>;

export function takesOptions(type: RegistrationFieldType): boolean {
  return type === "dropdown" || type === "radio";
}

// One option per line. Blank lines are dropped, so pasting a list with spare breaks is harmless.
export function parseOptions(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface FieldDraft {
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  section: string;
  optionsText: string;
}

export function draftFrom(field: FormField | null): FieldDraft {
  return {
    label: field?.label ?? "",
    type: field?.type ?? "text",
    required: field?.required ?? false,
    section: field?.section ?? "",
    optionsText: field?.options?.join("\n") ?? "",
  };
}

// The same rules the server applies, so most mistakes are named before the request is sent.
// The server still decides; a field-level message from it is shown when it refuses.
export function validateDraft(draft: FieldDraft): Partial<Record<"label" | "options", string>> {
  const errors: Partial<Record<"label" | "options", string>> = {};
  if (draft.label.trim().length === 0) errors.label = "Give the field a label";
  else if (draft.label.trim().length > 120) errors.label = "Keep the label under 120 characters";

  if (takesOptions(draft.type)) {
    const options = parseOptions(draft.optionsText);
    if (options.length < 2) errors.options = "Add at least two options, one per line";
    else if (options.length > 50) errors.options = "Use at most 50 options";
    else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      errors.options = "Each option must be different";
    }
  }
  return errors;
}

export interface SectionGroup {
  title: string;
  fields: FormField[];
}

// Fields grouped under their section headings, in the order the form shows them.
export function groupBySection<T extends { section: string | null }>(fields: T[]): { title: string; fields: T[] }[] {
  const groups: { title: string; fields: T[] }[] = [];
  for (const field of fields) {
    const title = field.section ?? "General";
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.fields.push(field);
    else groups.push({ title, fields: [field] });
  }
  return groups;
}
