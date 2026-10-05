import { describe, expect, it } from "vitest";
import type { FormField } from "../../services/types";
import { draftFrom, groupBySection, parseOptions, takesOptions, validateDraft } from "./fieldRules";

const draft = (overrides: Partial<ReturnType<typeof draftFrom>> = {}) => ({
  label: "Bus stop",
  type: "text" as const,
  required: false,
  section: "",
  optionsText: "",
  ...overrides,
});

describe("field rules", () => {
  it("keeps only the choice types as option-taking", () => {
    expect(takesOptions("dropdown")).toBe(true);
    expect(takesOptions("radio")).toBe(true);
    expect(takesOptions("text")).toBe(false);
  });

  it("drops blank lines and spaces around options", () => {
    expect(parseOptions("  Town \n\n Farm\n")).toEqual(["Town", "Farm"]);
  });

  it("asks for a label and at least two different options", () => {
    expect(validateDraft(draft({ label: "  " })).label).toMatch(/label/);
    expect(validateDraft(draft({ type: "radio", optionsText: "Only one" })).options).toMatch(/at least two/);
    expect(validateDraft(draft({ type: "dropdown", optionsText: "Yes\nyes" })).options).toMatch(/different/);
    expect(validateDraft(draft({ type: "dropdown", optionsText: "Yes\nNo" }))).toEqual({});
  });

  it("starts an editor from a field, or from blank for a new one", () => {
    const field = {
      id: "1", key: "shirt", label: "Shirt", type: "radio", required: true, section: "Camp", options: ["S", "M"], personField: null, position: 0,
    } as FormField;
    expect(draftFrom(field)).toEqual({ label: "Shirt", type: "radio", required: true, section: "Camp", optionsText: "S\nM" });
    expect(draftFrom(null)).toEqual({ label: "", type: "text", required: false, section: "", optionsText: "" });
  });

  it("groups fields under their section, keeping the form's order", () => {
    const groups = groupBySection([
      { section: "Personal" }, { section: "Personal" }, { section: "Church" }, { section: null },
    ]);
    expect(groups.map((g) => [g.title, g.fields.length])).toEqual([["Personal", 2], ["Church", 1], ["General", 1]]);
  });
});
