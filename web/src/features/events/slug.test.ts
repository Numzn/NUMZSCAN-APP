import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("turns a camp name into a lowercase web address", () => {
    expect(slugify("Youth Camp 2026")).toBe("youth-camp-2026");
  });

  it("removes punctuation and accents", () => {
    expect(slugify("Mulenga's Camp, Côte!")).toBe("mulenga-s-camp-cote");
  });

  it("never leaves leading or trailing hyphens", () => {
    expect(slugify("  --Retreat!!  ")).toBe("retreat");
  });
});
