// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupActions } from "../modules/actions.js";
import { createUi } from "../modules/ui.js";
import { createTicketGrid } from "../modules/ticketGrid.js";
import { escapeHtml } from "../modules/utils.js";

// Untrusted text (scanned QR content, imported ticket IDs) must render as text,
// never as markup. These payloads are built at runtime so the test source stays inert.
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const QUOTE = String.fromCharCode(34);
const PAYLOAD = `${LT}img src=x onerror=${QUOTE}window.__xssProbe=1${QUOTE}${GT}`;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="scanResult"></div>
    <div id="scanFeedback" class="hidden"></div>
    <div id="feedbackIcon"></div>
    <div id="feedbackTitle"></div>
    <div id="feedbackCode"></div>
    <div id="feedbackMessage"></div>
    <div id="qrcodes"></div>
    <span id="ticketCountBadge"></span>`;
  window.__xssProbe = undefined;
  globalThis.QRCode = class {
    constructor(el) {
      el.appendChild(document.createElement("canvas"));
    }
  };
  globalThis.QRCode.CorrectLevel = { H: 2 };
});

describe("scan result bar", () => {
  it("renders a scanned payload as literal text with no injected elements", () => {
    const ui = createUi({
      scanResultEl: document.getElementById("scanResult"),
      scanFeedbackEl: document.getElementById("scanFeedback"),
      feedbackIconEl: document.getElementById("feedbackIcon"),
      feedbackTitleEl: document.getElementById("feedbackTitle"),
      feedbackCodeEl: document.getElementById("feedbackCode"),
      feedbackMessageEl: document.getElementById("feedbackMessage"),
    });
    ui.showScanFeedback("error", "Unknown Ticket", PAYLOAD, "not in system");
    const bar = document.getElementById("scanResult");
    expect(bar.querySelectorAll("img")).toHaveLength(0);
    expect(bar.textContent).toBe(`Unknown Ticket: ${PAYLOAD}`);
  });
});

describe("QR grid", () => {
  it("renders an imported ticket ID as label text, not markup", () => {
    const grid = createTicketGrid(
      { qrcodesEl: document.getElementById("qrcodes"), ticketCountBadge: document.getElementById("ticketCountBadge") },
      { ticketBaseUrl: "https://example.test/?ticket=", useUrlInQr: true }
    );
    grid.renderGrid([{ id: PAYLOAD }, { id: "SAFE-0001" }]);
    const labels = Array.from(document.querySelectorAll("#qrcodes .item > div:last-child"));
    expect(labels.map((el) => el.textContent)).toEqual([PAYLOAD, "SAFE-0001"]);
    expect(document.querySelectorAll("#qrcodes .item > div:last-child img")).toHaveLength(0);
    expect(window.__xssProbe).toBeUndefined();
  });

  it("still renders a real QR element for each ticket", () => {
    const grid = createTicketGrid(
      { qrcodesEl: document.getElementById("qrcodes"), ticketCountBadge: document.getElementById("ticketCountBadge") },
      { ticketBaseUrl: "https://example.test/?ticket=", useUrlInQr: true }
    );
    grid.renderGrid([{ id: "SAFE-0002" }]);
    expect(document.querySelector("#qr-SAFE-0002 canvas")).not.toBeNull();
  });

  it("renders a QR failure message as text", () => {
    globalThis.QRCode = class {
      constructor() {
        throw new Error(PAYLOAD);
      }
    };
    globalThis.QRCode.CorrectLevel = { H: 2 };
    const grid = createTicketGrid(
      { qrcodesEl: document.getElementById("qrcodes"), ticketCountBadge: document.getElementById("ticketCountBadge") },
      { ticketBaseUrl: "https://example.test/?ticket=", useUrlInQr: true }
    );
    grid.renderGrid([{ id: "FAIL-0001" }]);
    const errorSpan = document.querySelector("#qr-FAIL-0001 .qr-error");
    expect(errorSpan).not.toBeNull();
    expect(errorSpan.querySelectorAll("img")).toHaveLength(0);
    expect(errorSpan.textContent).toContain(PAYLOAD);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("neutralises an injected tag inside an attribute context", () => {
    const attr = `alt="${escapeHtml(`" onerror="x`)}"`;
    expect(attr).not.toContain('" onerror="x');
  });

  it("coerces non-string values", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});


describe("print sheet SVG fallback", () => {
  it("escapes ticket text inside the SVG fallback image", async () => {
    delete globalThis.QRCode;
    const written = [];
    window.open = vi.fn(() => ({ document: { write: (s) => written.push(s), close() {} } }));
    const button = document.createElement("button");
    document.body.appendChild(button);
    setupActions({
      dom: { downloadSheetBtn: button },
      ui: {},
      state: { tickets: [{ id: PAYLOAD }] },
      onTicketsChanged() {},
      ticketBaseUrl: "https://example.test/?ticket=",
      useUrlInQr: false,
      generateId() {},
      supabase: {},
      eventId: "e",
      appVersion: "1",
    });
    button.click();
    await vi.waitFor(() => expect(written).toHaveLength(1));
    const src = written[0].match(/<img src="([^"]+)"/)[1];
    const svg = decodeURIComponent(src.slice("data:image/svg+xml;utf8,".length));
    expect(svg).toContain("&lt;img");
    expect(svg).not.toContain(PAYLOAD);
  });
});
