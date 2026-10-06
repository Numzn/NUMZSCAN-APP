import type { ScanResult } from "../../services/types";

export interface ScanNotice {
  tone: "success" | "info" | "error";
  text: string;
}

// What the operator reads after a scan that was recorded. Names come from the server; the wording is ours.
export function describeScan(result: ScanResult): ScanNotice {
  const name = result.participant.fullName;
  if (result.replayed) return { tone: "info", text: `Already recorded: ${name}.` };
  switch (result.operation) {
    case "check_in":
      return { tone: "success", text: `Checked in: ${name}${result.participant.groupName ? ` (${result.participant.groupName})` : ""}.` };
    case "check_out":
      return { tone: "success", text: `Checked out: ${name}.` };
    case "meal":
      return { tone: "success", text: `Meal recorded for ${name}.` };
    default:
      return { tone: "success", text: `Scan recorded for ${name}.` };
  }
}

// The wording for a refused scan. The refusal is already on record; this only explains it to the operator.
export function describeRefusal(code: string, participantName?: string): string {
  const who = participantName ?? "This participant";
  switch (code) {
    case "CREDENTIAL_NOT_FOUND":
      return "This pass is not recognised for this event.";
    case "CREDENTIAL_REVOKED":
      return "This pass has been revoked.";
    case "CREDENTIAL_EXPIRED":
      return "This pass has expired.";
    case "OUTSIDE_WINDOW":
      return "Outside this service time.";
    case "CHECKPOINT_INACTIVE":
      return "This checkpoint is closed.";
    case "ALREADY_CHECKED_IN":
      return `${who} is already checked in.`;
    case "ALREADY_CHECKED_OUT":
      return `${who} has already checked out.`;
    case "NOT_CHECKED_IN":
      return `${who} has not checked in yet.`;
    case "DUPLICATE_INTERACTION":
      return `${who} has already been recorded here.`;
    case "PARTICIPANT_CANCELLED":
      return `${who} is cancelled.`;
    case "INVALID_INPUT":
      return "That is not a valid pass code.";
    case "FORBIDDEN":
      return "You are not allowed to scan here.";
    default:
      return "The scan could not be recorded. Try again.";
  }
}
