// Human wording and colour tone for statuses. The API keeps its own codes; the UI shows these.
export type Tone = "green" | "amber" | "red" | "blue" | "grey";

export const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "grey" },
  open: { label: "Open", tone: "green" },
  closed: { label: "Closed", tone: "amber" },
  archived: { label: "Archived", tone: "grey" },
};

export const PARTICIPANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  registered: { label: "Registered", tone: "blue" },
  checked_in: { label: "Checked in", tone: "green" },
  departed: { label: "Departed", tone: "grey" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const CREDENTIAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "green" },
  replaced: { label: "Replaced", tone: "amber" },
  revoked: { label: "Revoked", tone: "red" },
};

export const GROUP_KIND: Record<string, string> = {
  church: "Church",
  dorm: "Dormitory",
  team: "Team",
};

// Falls back to the raw code, so an unexpected status still shows something truthful.
export function statusOf(table: Record<string, { label: string; tone: Tone }>, code: string) {
  return table[code] ?? { label: code, tone: "grey" as Tone };
}

export const REGISTRATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "grey" },
  open: { label: "Open", tone: "green" },
  closed: { label: "Closed", tone: "amber" },
};
