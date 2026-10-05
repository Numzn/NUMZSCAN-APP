import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIELDS,
  checkFieldDefinition,
  keyFromLabel,
  newReference,
  normalizeName,
  phoneDigits,
  slugCandidate,
  validateAnswers,
} from "../../api/src/v1/registration.js";

const field = (overrides) => ({ key: "f", label: "Field", type: "text", required: false, options: null, ...overrides });

describe("answer validation", () => {
  it("accepts a complete valid answer and returns the cleaned values", () => {
    const fields = [field({ key: "name", label: "Name", required: true }), field({ key: "age", label: "Age", type: "number" })];
    const { errors, values } = validateAnswers(fields, { name: "  Ada  ", age: "12" });
    expect(errors).toEqual([]);
    expect(values).toEqual({ name: "Ada", age: "12" });
  });

  it("names a missing required answer by its label", () => {
    const { errors } = validateAnswers([field({ key: "church", label: "Church", required: true })], {});
    expect(errors).toEqual([{ path: "church", message: "Church is required" }]);
  });

  it("refuses keys the published form does not ask for", () => {
    const { errors } = validateAnswers([field({ key: "a", label: "A" })], { a: "x", extra: "y" });
    expect(errors).toEqual([{ path: "extra", message: "This field is not part of the form" }]);
  });

  it("refuses answers that are not an object", () => {
    expect(validateAnswers([], null).errors[0].path).toBe("answers");
    expect(validateAnswers([], ["x"]).errors[0].path).toBe("answers");
  });

  it("refuses nested values where text belongs", () => {
    const { errors } = validateAnswers([field({ key: "a", label: "A" })], { a: { nested: true } });
    expect(errors).toEqual([{ path: "a", message: "Use text for this answer" }]);
  });

  it("checks emails, phone numbers, numbers and dates", () => {
    const fields = [
      field({ key: "email", label: "Email", type: "email" }),
      field({ key: "phone", label: "Phone", type: "phone" }),
      field({ key: "n", label: "N", type: "number" }),
      field({ key: "d", label: "D", type: "date" }),
    ];
    const { errors } = validateAnswers(fields, { email: "a@b", phone: "12", n: "1.2.3", d: "2026-13-01" });
    expect(errors.map((e) => e.path)).toEqual(["email", "phone", "n", "d"]);
    const good = validateAnswers(fields, { email: "a@b.org", phone: "+260 (97) 100-0001", n: "-3.25", d: "2026-02-28" });
    expect(good.errors).toEqual([]);
  });

  it("rejects impossible calendar dates, including a leap day in a non-leap year", () => {
    expect(validateAnswers([field({ key: "d", label: "D", type: "date" })], { d: "2026-02-29" }).errors).toHaveLength(1);
    expect(validateAnswers([field({ key: "d", label: "D", type: "date" })], { d: "2024-02-29" }).errors).toEqual([]);
  });

  it("accepts a dropdown or radio answer only from its options", () => {
    const fields = [field({ key: "shirt", label: "Shirt", type: "radio", options: ["S", "M"] })];
    expect(validateAnswers(fields, { shirt: "L" }).errors).toHaveLength(1);
    expect(validateAnswers(fields, { shirt: "M" }).errors).toEqual([]);
  });

  it("stores a checkbox as true or false, and a required checkbox must be ticked", () => {
    const optional = validateAnswers([field({ key: "c", label: "C", type: "checkbox" })], {});
    expect(optional.values).toEqual({ c: "false" });
    const required = validateAnswers([field({ key: "c", label: "Agree", type: "checkbox", required: true })], { c: false });
    expect(required.errors).toEqual([{ path: "c", message: "Agree must be ticked" }]);
    const ticked = validateAnswers([field({ key: "c", label: "Agree", type: "checkbox", required: true })], { c: true });
    expect(ticked.values).toEqual({ c: "true" });
  });

  it("caps text length", () => {
    expect(validateAnswers([field({ key: "a", label: "A" })], { a: "x".repeat(201) }).errors).toHaveLength(1);
    expect(validateAnswers([field({ key: "a", label: "A", type: "long_text" })], { a: "x".repeat(2000) }).errors).toEqual([]);
  });
});

describe("field definitions", () => {
  it("needs options for choice fields and refuses them for others", () => {
    expect(checkFieldDefinition({ type: "dropdown", options: null })).toHaveLength(1);
    expect(checkFieldDefinition({ type: "text", options: ["a", "b"] })).toHaveLength(1);
    expect(checkFieldDefinition({ type: "radio", options: ["Yes", "yes"] })).toHaveLength(1);
    expect(checkFieldDefinition({ type: "radio", options: ["Yes", "No"] })).toEqual([]);
  });

  it("derives a URL-safe key from the label and never reuses a taken one", () => {
    expect(keyFromLabel("Dietary requirements", new Set())).toBe("dietary_requirements");
    expect(keyFromLabel("Café £ Name!", new Set())).toBe("cafe_name");
    expect(keyFromLabel("Bus stop", new Set(["bus_stop"]))).toBe("bus_stop_2");
    expect(keyFromLabel("2nd choice", new Set())).toBe("f_2nd_choice");
    expect(keyFromLabel("???", new Set())).toBe("field");
  });

  it("the default form is valid and keeps the three person fields", () => {
    for (const f of DEFAULT_FIELDS) {
      expect(checkFieldDefinition({ type: f.type, options: null })).toEqual([]);
    }
    const persons = DEFAULT_FIELDS.filter((f) => f.personField).map((f) => f.personField).sort();
    expect(persons).toEqual(["first_name", "last_name", "phone"]);
  });
});

describe("identity keys and slugs", () => {
  it("compares names ignoring case and spacing, and phones by digits only", () => {
    expect(normalizeName("  Michael   Banda ")).toBe("michael banda");
    expect(phoneDigits("+260 97 100-0001")).toBe("260971000001");
  });

  it("gives the event's address first, then numbered alternatives", () => {
    expect(slugCandidate("bigoca-youth-camp-2026", 1)).toBe("bigoca-youth-camp-2026");
    expect(slugCandidate("bigoca-youth-camp-2026", 2)).toBe("bigoca-youth-camp-2026-2");
  });

  it("makes references from the unambiguous alphabet only", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(newReference()).toMatch(/^EP-[2-9A-HJKMNP-TV-Z]{5}$/);
    }
  });
});
