import { describe, expect, it } from "vitest";
import {
  computeTicketStats,
  ensureTicketShape,
  findTicket,
  normalizeTickets,
  rebuildTicketMap,
  sortTickets,
} from "../modules/tickets.js";

describe("ensureTicketShape", () => {
  it("fills every defaulted field for a bare id", () => {
    const ticket = ensureTicketShape({ id: "LHG-TK01-AAAA" });
    expect(ticket).toMatchObject({
      id: "LHG-TK01-AAAA",
      used: false,
      usedAt: null,
      syncStatus: "local",
      lastSyncedAt: null,
      pendingAction: null,
      metadata: {},
      source: "local",
    });
    expect(Number.isNaN(Date.parse(ticket.createdAt))).toBe(false);
  });

  it("coerces used to a boolean and keeps supplied values", () => {
    const ticket = ensureTicketShape({
      id: "X",
      used: 1,
      usedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2025-12-31T00:00:00.000Z",
      syncStatus: "synced",
      source: "csv",
      metadata: { a: 1 },
    });
    expect(ticket.used).toBe(true);
    expect(ticket.usedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(ticket.createdAt).toBe("2025-12-31T00:00:00.000Z");
    expect(ticket.syncStatus).toBe("synced");
    expect(ticket.source).toBe("csv");
    expect(ticket.metadata).toEqual({ a: 1 });
  });

  it("does not drop an empty-string usedAt into the object (falsy becomes null)", () => {
    expect(ensureTicketShape({ id: "X", usedAt: "" }).usedAt).toBeNull();
  });
});

describe("normalizeTickets", () => {
  it("maps every element through ensureTicketShape without mutating the input", () => {
    const input = [{ id: "A" }, { id: "B", used: true }];
    const output = normalizeTickets(input);
    expect(output.map((t) => t.id)).toEqual(["A", "B"]);
    expect(output[1].used).toBe(true);
    expect(input[0]).toEqual({ id: "A" });
  });

  it("returns an empty array for an empty input", () => {
    expect(normalizeTickets([])).toEqual([]);
  });
});

describe("rebuildTicketMap and findTicket", () => {
  const map = rebuildTicketMap(normalizeTickets([{ id: "LHG-TK01-AAAA" }, { id: "LHG-TK02-BBBB" }]));

  it("indexes tickets by id", () => {
    expect(map.size).toBe(2);
    expect(map.get("LHG-TK02-BBBB").id).toBe("LHG-TK02-BBBB");
  });

  it("finds a ticket by exact id", () => {
    expect(findTicket(map, "LHG-TK01-AAAA")?.id).toBe("LHG-TK01-AAAA");
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(findTicket(map, "  LHG-TK01-AAAA \n")?.id).toBe("LHG-TK01-AAAA");
  });

  it("returns null for unknown, empty, and missing codes", () => {
    expect(findTicket(map, "NOPE")).toBeNull();
    expect(findTicket(map, "")).toBeNull();
    expect(findTicket(map, undefined)).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(findTicket(map, "lhg-tk01-aaaa")).toBeNull();
  });
});

describe("sortTickets", () => {
  it("sorts numerically within id strings (TK2 before TK10)", () => {
    const sorted = sortTickets(normalizeTickets([{ id: "TK10" }, { id: "TK2" }, { id: "TK1" }]));
    expect(sorted.map((t) => t.id)).toEqual(["TK1", "TK2", "TK10"]);
  });

  it("does not mutate the original array", () => {
    const input = normalizeTickets([{ id: "B" }, { id: "A" }]);
    sortTickets(input);
    expect(input.map((t) => t.id)).toEqual(["B", "A"]);
  });
});

describe("computeTicketStats", () => {
  it("counts total, used, and unused", () => {
    const stats = computeTicketStats(normalizeTickets([{ id: "1" }, { id: "2", used: true }, { id: "3", used: true }]));
    expect(stats).toEqual({ total: 3, used: 2, unused: 1 });
  });

  it("handles an empty list", () => {
    expect(computeTicketStats([])).toEqual({ total: 0, used: 0, unused: 0 });
  });
});
