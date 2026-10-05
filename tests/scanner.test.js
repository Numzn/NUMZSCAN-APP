import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupScanner } from "../modules/scanner.js";

// extractTicketId and processScan are private to setupScanner, so these tests
// drive them through the public start() path: a fake camera captures the
// decode callback, and the test invokes it with raw scanned text.
let decode;

class FakeHtml5Qrcode {
  constructor() {}
  start(_config, _cameraConfig, onSuccess) {
    decode = onSuccess;
    return Promise.resolve();
  }
  stop() {
    return Promise.resolve();
  }
  clear() {}
}

function makeScanner({ findTicket = () => null, onTicketUpdated = vi.fn(async () => {}) } = {}) {
  const ui = { showScanFeedback: vi.fn() };
  const state = { html5QrScanner: null, scanProcessing: false, lastScannedCode: null, lastScanTime: 0, scanCooldownTimer: null };
  const dom = {
    startScannerBtn: { disabled: false, addEventListener() {} },
    stopScannerBtn: { disabled: true, addEventListener() {} },
    readerEl: null,
    scanFeedbackEl: null,
  };
  const findTicketSpy = vi.fn(findTicket);
  const handle = setupScanner({
    dom,
    ui,
    state,
    findTicket: findTicketSpy,
    onTicketUpdated,
    supabase: { isEnabled: () => false },
    eventId: "test-event",
    defaultScanLocation: "gate",
  });
  return { handle, ui, state, findTicketSpy, onTicketUpdated };
}

async function scanRaw(raw, options) {
  const ctx = makeScanner(options);
  await ctx.handle.start();
  decode(raw);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return ctx;
}

beforeEach(() => {
  globalThis.Html5Qrcode = FakeHtml5Qrcode;
  decode = null;
});

describe("extractTicketId (observed through findTicket)", () => {
  const cases = [
    ["LHG-TK01-AAAA", "LHG-TK01-AAAA", "plain id is used as-is"],
    ["   LHG-TK01-AAAA  ", "LHG-TK01-AAAA", "plain text is trimmed"],
    ["https://host.example/?ticket=ABC123&x=1", "ABC123", "ticket query parameter wins"],
    ["https://host.example/page#HASH42", "HASH42", "URL fragment is used when there is no ticket parameter"],
    ["https://host.example/t/TOKEN9/extra", "TOKEN9", "/t/<id> path form"],
    ["https://host.example/ticket/TK-77", "TK-77", "/ticket/<id> path form"],
    ["https://host.example/a/b/CARD42", "CARD42", "falls back to the last path segment"],
    ["https://host.example/", "https://host.example/", "no path segment: returns the full code"],
  ];

  for (const [raw, expected, label] of cases) {
    it(`${label}: ${JSON.stringify(raw)} -> ${JSON.stringify(expected)}`, async () => {
      const { findTicketSpy } = await scanRaw(raw);
      expect(findTicketSpy).toHaveBeenCalledWith(expected);
    });
  }
});

describe("processScan decisions", () => {
  it("reports an unknown ticket as an error and does not call onTicketUpdated", async () => {
    const { ui, onTicketUpdated } = await scanRaw("NOPE");
    expect(ui.showScanFeedback).toHaveBeenCalledWith("error", "Unknown Ticket", "NOPE", "This ticket is not in the system.");
    expect(onTicketUpdated).not.toHaveBeenCalled();
  });

  it("reports an already-used ticket as a warning and leaves it unchanged", async () => {
    const used = { id: "T1", used: true, usedAt: "x" };
    const { ui, onTicketUpdated } = await scanRaw("T1", { findTicket: () => used });
    expect(ui.showScanFeedback).toHaveBeenCalledWith("warning", "Already Used", "T1", "This ticket was already scanned.");
    expect(onTicketUpdated).not.toHaveBeenCalled();
    expect(used.used).toBe(true);
  });

  it("accepts an unused ticket: marks it used, stamps usedAt, and notifies", async () => {
    const ticket = { id: "T2", used: false, usedAt: null };
    const { ui, onTicketUpdated } = await scanRaw("T2", { findTicket: () => ticket });
    expect(ticket.used).toBe(true);
    expect(typeof ticket.usedAt).toBe("string");
    expect(ui.showScanFeedback).toHaveBeenCalledWith("success", "Ticket Accepted", "T2", "Entry granted. Welcome!");
    expect(onTicketUpdated).toHaveBeenCalledTimes(1);
  });
});
