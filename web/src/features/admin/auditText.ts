import type { AuditEntry } from "../../services/types";

// Plain-language wording for every action the audit log records.
export const AUDIT_ACTIONS: Record<string, string> = {
  "user.create": "Created a user",
  "user.update": "Changed a user",
  "user.deactivate": "Deactivated a user",
  "user.reactivate": "Reactivated a user",
  "user.password_reset": "Reset a password",
  "user.sessions_revoke": "Signed a user out everywhere",
  "membership.add": "Added event access",
  "membership.change": "Changed event role",
  "membership.remove": "Removed event access",
  "event.update": "Changed event settings",
};

const FIELD_NAMES: Record<string, string> = {
  displayName: "name",
  isAdmin: "administrator",
  isActive: "active",
  name: "name",
  status: "status",
  timezone: "timezone",
  startsOn: "starts on",
  endsOn: "ends on",
};

const ROLE_NAMES: Record<string, string> = { event_manager: "event manager", staff: "staff" };

function show(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "string" && ROLE_NAMES[value]) return ROLE_NAMES[value];
  return String(value);
}

export function actionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action;
}

// A short, readable summary of what changed. It never shows secrets, because the server never records them.
export function describeEntry(entry: AuditEntry): string {
  const d = entry.details as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.email === "string") parts.push(d.email);
  const changes = d.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes) {
    for (const [field, change] of Object.entries(changes)) {
      parts.push(`${FIELD_NAMES[field] ?? field}: ${show(change.from)} to ${show(change.to)}`);
    }
    if (Object.keys(changes).length === 0) parts.push("no field changed");
  }
  if (typeof d.role === "string") parts.push(`as ${show(d.role)}`);
  if (typeof d.from === "string" && typeof d.to === "string") parts.push(`${show(d.from)} to ${show(d.to)}`);
  if (typeof d.sessionsEnded === "number") parts.push(`${d.sessionsEnded} ${d.sessionsEnded === 1 ? "session" : "sessions"} ended`);
  return parts.join(", ") || "";
}
