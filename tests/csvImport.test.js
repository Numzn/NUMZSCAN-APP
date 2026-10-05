import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupCsvImport } from "../modules/csvImport.js";

let alertSpy;

beforeEach(() => {
  alertSpy = vi.fn();
  globalThis.alert = alertSpy;
});

afterEach(() => {
  delete globalThis.alert;
});

function makeImporter(existingTickets = []) {
  const state = {
    tickets: existingTickets,
    ticketMap: new Map(),
    ticketIdGenerator: { setBaseline: vi.fn() },
  };
  const ctx = {
    dom: {
      importCsvBtn: { addEventListener: vi.fn() },
      importCsvFile: { addEventListener: vi.fn() },
    },
    ui: { setGlobalLoading: vi.fn(), updateLoaderMessage: vi.fn() },
    state,
    saveTickets: vi.fn(async () => {}),
    onTicketsChanged: vi.fn(async () => {}),
    setGenerationLock: vi.fn(),
    supabase: { isEnabled: () => false },
    eventId: "test-event",
  };
  const controller = setupCsvImport(ctx);
  return { controller, state, ctx };
}

const csvFile = (text) => new File([text], "tickets.csv", { type: "text/csv" });

describe("CSV import", () => {
  it("imports rows using the 'Ticket ID' header and reports added/skipped counts", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile("Ticket ID,Status\nT1,unused\nT2,used\n"));
    expect(state.tickets.map((t) => t.id)).toEqual(["T1", "T2"]);
    expect(alertSpy).toHaveBeenLastCalledWith("CSV import complete. Added 2 tickets. Skipped 0.");
  });

  it("accepts the 'id' and 'ticket' header aliases", async () => {
    for (const header of ["id", "ticket"]) {
      const { controller, state } = makeImporter();
      await controller.import(csvFile(`${header}\nX1\n`));
      expect(state.tickets.map((t) => t.id)).toEqual(["X1"]);
    }
  });

  it("marks a row used when status is used, true, or yes (case-insensitive)", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile("Ticket ID,Status\nA,USED\nB,true\nC,Yes\nD,no\n"));
    const used = Object.fromEntries(state.tickets.map((t) => [t.id, t.used]));
    expect(used).toEqual({ A: true, B: true, C: true, D: false });
  });

  it("reads used_at / 'used at' into usedAt when present", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile("Ticket ID,Status,Used At\nE,used,2026-01-02T03:04:05Z\n"));
    expect(state.tickets[0].usedAt).toBe("2026-01-02T03:04:05Z");
  });

  it("parses quoted fields that contain commas", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile('Ticket ID,Notes\n"F,1",\"hello, world\"\n'));
    expect(state.tickets.map((t) => t.id)).toEqual(["F,1"]);
  });

  it("skips rows whose id is blank; empty lines are dropped before parsing and not counted", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile("Ticket ID\nG1\n\n ,\nG2\n"));
    expect(state.tickets.map((t) => t.id)).toEqual(["G1", "G2"]);
    expect(alertSpy).toHaveBeenLastCalledWith("CSV import complete. Added 2 tickets. Skipped 1.");
  });

  it("does not re-add an existing ticket, but upgrades it to used when the CSV says used", async () => {
    const existing = [{ id: "H1", used: false, usedAt: null, createdAt: "2025-01-01T00:00:00Z", syncStatus: "local", lastSyncedAt: null, pendingAction: null, metadata: {}, source: "local" }];
    const { controller, state } = makeImporter(existing);
    await controller.import(csvFile("Ticket ID,Status\nH1,used\n"));
    expect(state.tickets).toHaveLength(1);
    expect(state.tickets[0].used).toBe(true);
    expect(alertSpy).toHaveBeenLastCalledWith("CSV import complete. Added 0 tickets. Skipped 0.");
  });

  it("does not un-use an existing used ticket when the CSV says unused", async () => {
    const existing = [{ id: "I1", used: true, usedAt: "x", createdAt: "2025-01-01T00:00:00Z", syncStatus: "local", lastSyncedAt: null, pendingAction: null, metadata: {}, source: "local" }];
    const { controller, state } = makeImporter(existing);
    await controller.import(csvFile("Ticket ID,Status\nI1,unused\n"));
    expect(state.tickets[0].used).toBe(true);
  });

  it("rejects a file without an id column and changes no tickets", async () => {
    const { controller, state, ctx } = makeImporter();
    await controller.import(csvFile("Name,Status\nX,used\n"));
    expect(state.tickets).toHaveLength(0);
    expect(ctx.saveTickets).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenLastCalledWith("Failed to import CSV: CSV must include a 'Ticket ID' column.");
  });

  it("alerts and imports nothing for an empty file", async () => {
    const { controller, state } = makeImporter();
    await controller.import(csvFile(""));
    expect(state.tickets).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledWith("CSV file is empty.");
  });

  it("locks generation during import and releases the loader afterwards", async () => {
    const { controller, ctx } = makeImporter();
    await controller.import(csvFile("Ticket ID\nJ1\n"));
    expect(ctx.setGenerationLock).toHaveBeenNthCalledWith(1, true, { reason: "CSV import" });
    expect(ctx.ui.setGlobalLoading).toHaveBeenLastCalledWith(false);
  });
});
