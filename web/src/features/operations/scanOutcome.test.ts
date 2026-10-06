import { describe, expect, it } from "vitest";
import type { ScanResult } from "../../services/types";
import { describeRefusal, describeScan } from "./scanOutcome";

const result = (operation: ScanResult["operation"], over: Partial<ScanResult> = {}): ScanResult => ({
  replayed: false,
  operation,
  participant: { id: "p", fullName: "Michael Banda", groupName: "Church A", status: "checked_in" },
  interaction: { id: "i", outcome: "accepted", reason: null },
  ...over,
});

describe("scan outcomes", () => {
  it("says what was done, with the participant's name and group", () => {
    expect(describeScan(result("check_in"))).toEqual({ tone: "success", text: "Checked in: Michael Banda (Church A)." });
    expect(describeScan(result("check_out"))).toEqual({ tone: "success", text: "Checked out: Michael Banda." });
    expect(describeScan(result("meal"))).toEqual({ tone: "success", text: "Meal recorded for Michael Banda." });
  });

  it("says a retried scan was already recorded, rather than recording it again", () => {
    expect(describeScan(result("check_in", { replayed: true }))).toEqual({ tone: "info", text: "Already recorded: Michael Banda." });
  });

  it("names every refusal the operator can meet, in plain words", () => {
    expect(describeRefusal("CREDENTIAL_NOT_FOUND")).toBe("This pass is not recognised for this event.");
    expect(describeRefusal("CREDENTIAL_REVOKED")).toBe("This pass has been revoked.");
    expect(describeRefusal("CREDENTIAL_EXPIRED")).toBe("This pass has expired.");
    expect(describeRefusal("OUTSIDE_WINDOW")).toBe("Outside this service time.");
    expect(describeRefusal("CHECKPOINT_INACTIVE")).toBe("This checkpoint is closed.");
    expect(describeRefusal("ALREADY_CHECKED_IN", "Ruth")).toBe("Ruth is already checked in.");
    expect(describeRefusal("ALREADY_CHECKED_OUT", "Ruth")).toBe("Ruth has already checked out.");
    expect(describeRefusal("NOT_CHECKED_IN", "Ruth")).toBe("Ruth has not checked in yet.");
    expect(describeRefusal("DUPLICATE_INTERACTION")).toBe("This participant has already been recorded here.");
    expect(describeRefusal("PARTICIPANT_CANCELLED", "Ruth")).toBe("Ruth is cancelled.");
    expect(describeRefusal("INVALID_INPUT")).toBe("That is not a valid pass code.");
  });

  it("falls back to a generic message for anything unexpected", () => {
    expect(describeRefusal("SOMETHING_NEW")).toBe("The scan could not be recorded. Try again.");
  });
});
