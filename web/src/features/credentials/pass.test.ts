import { describe, expect, it } from "vitest";
import { isCredentialToken } from "./pass";

const valid = "EP1:" + "a".repeat(43);

describe("credential payload", () => {
  it("accepts the EP1 token shape", () => {
    expect(isCredentialToken(valid)).toBe(true);
  });

  it("rejects a legacy ticket id, which is guessable and must never be a pass", () => {
    expect(isCredentialToken("LHG-TK01-ABCD")).toBe(false);
  });

  it("rejects a payload carrying a name, a URL, or whitespace", () => {
    expect(isCredentialToken("EP1:Michael-" + "a".repeat(34))).toBe(false);
    expect(isCredentialToken("https://example.org/?t=" + valid)).toBe(false);
    expect(isCredentialToken(" " + valid)).toBe(false);
  });

  it("rejects a token of the wrong length", () => {
    expect(isCredentialToken("EP1:" + "a".repeat(42))).toBe(false);
    expect(isCredentialToken("EP1:" + "a".repeat(44))).toBe(false);
  });
});
