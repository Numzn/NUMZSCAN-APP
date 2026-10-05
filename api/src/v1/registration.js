import crypto from "node:crypto";
import { z } from "zod";

// Registration rules that do not touch the database: field definitions, answer validation, the keys used to find
// an existing person, and the slugs and references the public side shows. The routes own the database work.

export const FIELD_TYPES = ["text", "email", "phone", "number", "date", "dropdown", "radio", "checkbox", "long_text"];
export const OPTION_TYPES = ["dropdown", "radio"];
export const PERSON_FIELDS = ["first_name", "last_name", "phone"];
export const MAX_FIELDS = 60;

// The common starting form. A manager can change any field except the three that identify the person.
export const DEFAULT_FIELDS = [
  { key: "first_name", label: "First name", type: "text", required: true, section: "Personal information", personField: "first_name" },
  { key: "last_name", label: "Last name", type: "text", required: true, section: "Personal information", personField: "last_name" },
  { key: "date_of_birth", label: "Date of birth", type: "date", required: true, section: "Personal information" },
  { key: "phone", label: "Phone number", type: "phone", required: true, section: "Personal information", personField: "phone" },
  { key: "email", label: "Email", type: "email", required: false, section: "Personal information" },
  { key: "church", label: "Church", type: "text", required: true, section: "Church information" },
  { key: "district", label: "District", type: "text", required: false, section: "Church information" },
  { key: "emergency_contact", label: "Emergency contact", type: "text", required: true, section: "Camp information" },
  { key: "emergency_phone", label: "Emergency phone", type: "phone", required: true, section: "Camp information" },
  { key: "dietary_requirements", label: "Dietary requirements", type: "long_text", required: false, section: "Camp information" },
];

// ----- Field definitions -------------------------------------------------------------------------------------------

const text = (max) => z.string().trim().min(1).max(max);

export const fieldShape = z.object({
  label: text(120),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  section: text(60).nullable(),
  options: z.array(text(120)).min(2).max(50).nullable(),
});

// Checks a complete field definition: options are present exactly for choice fields, and they are distinct.
export function checkFieldDefinition(field) {
  const problems = [];
  const isChoice = OPTION_TYPES.includes(field.type);
  if (isChoice && !field.options) problems.push({ path: "options", message: "Add at least two options" });
  if (!isChoice && field.options) problems.push({ path: "options", message: "Only dropdown and radio fields have options" });
  if (isChoice && field.options) {
    const distinct = new Set(field.options.map((option) => option.toLowerCase()));
    if (distinct.size !== field.options.length) problems.push({ path: "options", message: "Each option must be different" });
  }
  return problems;
}

// A stable, URL-safe key from a label. Keys are never reused, so a stored answer always names the field it answered.
export function keyFromLabel(label, taken) {
  let base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) base = "field";
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
}

// ----- Answers ------------------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^[0-9+()\s.-]{7,40}$/;
const NUMBER = /^-?\d{1,12}(\.\d{1,4})?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function phoneDigits(phone) {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

function isCalendarDate(value) {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Returns a message when the value does not fit the field, or null when it does.
function valueProblem(field, value) {
  switch (field.type) {
    case "text":
      return value.length > 200 ? "Keep this under 200 characters" : null;
    case "long_text":
      return value.length > 2000 ? "Keep this under 2000 characters" : null;
    case "email":
      return value.length > 200 || !EMAIL.test(value) ? "Enter a valid email address" : null;
    case "phone":
      return !PHONE_CHARS.test(value) || phoneDigits(value).length < 7 || phoneDigits(value).length > 15
        ? "Enter a valid phone number"
        : null;
    case "number":
      return NUMBER.test(value) ? null : "Enter a number";
    case "date":
      return isCalendarDate(value) ? null : "Enter a valid date";
    case "dropdown":
    case "radio":
      return field.options.includes(value) ? null : "Choose one of the listed options";
    case "checkbox":
      return value === "true" || value === "false" ? null : "Choose yes or no";
    default:
      return "Unknown field type";
  }
}

// Validates a submitted answers object against the active fields. Unknown keys are refused, so the browser cannot
// add data the published form does not ask for. Returns the cleaned values, keyed by field key.
export function validateAnswers(fields, answers) {
  const errors = [];
  const values = {};
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { errors: [{ path: "answers", message: "Answers must be an object" }], values };
  }
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) errors.push({ path: key, message: "This field is not part of the form" });
  }

  for (const field of fields) {
    const raw = answers[field.key];
    if (raw !== undefined && raw !== null && typeof raw !== "string" && typeof raw !== "boolean") {
      errors.push({ path: field.key, message: "Use text for this answer" });
      continue;
    }
    const value = raw === undefined || raw === null ? "" : String(raw).trim();

    if (field.type === "checkbox") {
      const ticked = value === "true";
      if (field.required && !ticked) {
        errors.push({ path: field.key, message: `${field.label} must be ticked` });
      } else if (value !== "" && value !== "true" && value !== "false") {
        errors.push({ path: field.key, message: "Choose yes or no" });
      } else {
        values[field.key] = ticked ? "true" : "false";
      }
      continue;
    }

    if (value === "") {
      if (field.required) errors.push({ path: field.key, message: `${field.label} is required` });
      continue;
    }
    const problem = valueProblem(field, value);
    if (problem) errors.push({ path: field.key, message: problem });
    else values[field.key] = value;
  }
  return { errors, values };
}

// ----- Identity -----------------------------------------------------------------------------------------------------

// Two registrations are the same person only when the name and the phone digits both match exactly.
export function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function fullName(first, last) {
  return `${first.trim().replace(/\s+/g, " ")} ${last.trim().replace(/\s+/g, " ")}`;
}

// ----- Slugs and references -----------------------------------------------------------------------------------------

// The first candidate is the event's own slug. Later candidates add a number, so the choice is deterministic.
export function slugCandidate(base, attempt) {
  return attempt === 1 ? base : `${base}-${attempt}`;
}

// 30 symbols with the look-alikes left out. Five of them give about 24 million references.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newReference() {
  let suffix = "";
  for (let i = 0; i < 5; i += 1) suffix += REFERENCE_ALPHABET[crypto.randomInt(REFERENCE_ALPHABET.length)];
  return `EP-${suffix}`;
}

export const SLUG = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens");
