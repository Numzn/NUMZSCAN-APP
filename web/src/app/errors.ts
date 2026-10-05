import { ApiError } from "../services/api";

// Turns a server error into a sentence a person can act on. Field-level details are named, not hidden.
export const FIELD_LABELS: Record<string, string> = {
  slug: "Web address",
  name: "Name",
  kind: "Kind",
  timezone: "Timezone",
  startsOn: "Starts on",
  endsOn: "Ends on",
  email: "Email",
  displayName: "Display name",
  password: "Password",
  role: "Role",
  userId: "Person",
};

export function describeError(err: unknown, fallback = "That did not work. Try again."): string {
  if (!(err instanceof ApiError)) return fallback;
  const details = Array.isArray(err.details) ? (err.details as { path?: string; message?: string }[]) : [];
  if (details.length === 0) return err.message;
  const problems = details.map((d) => `${FIELD_LABELS[d.path ?? ""] ?? d.path ?? "Form"}: ${d.message ?? "is not valid"}`);
  return `${err.message}. ${problems.join(". ")}.`;
}
