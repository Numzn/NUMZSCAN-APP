import { describe, expect, it } from "vitest";
import { formatEventDates } from "./dates";

describe("formatEventDates", () => {
  it("shows a range inside one year with the year once", () => {
    expect(formatEventDates("2026-12-10", "2026-12-17")).toBe("10 Dec – 17 Dec 2026");
  });

  it("shows both years when the range crosses a year end", () => {
    expect(formatEventDates("2026-12-30", "2027-01-03")).toBe("30 Dec 2026 – 3 Jan 2027");
  });

  it("shows a one-day event once", () => {
    expect(formatEventDates("2026-12-10", "2026-12-10")).toBe("10 Dec 2026");
  });

  it("keeps the calendar day whatever the machine's time zone", () => {
    // Formatting in local time would move a UTC-midnight date back a day in the Americas.
    expect(formatEventDates("2027-03-01", "2027-03-02")).toBe("1 Mar – 2 Mar 2027");
  });

  it("falls back to the raw values when a date is not a calendar day", () => {
    expect(formatEventDates("soon", "2026-12-17")).toBe("soon to 2026-12-17");
  });
});
