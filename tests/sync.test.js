import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sync.js is a browser IIFE that publishes window.TicketSync. Provide the
// browser globals it reads before loading it.
const storage = new Map();
const localStorageStub = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

globalThis.window = globalThis;
globalThis.localStorage = localStorageStub;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });

let TicketSync;

async function loadFreshSync() {
  vi.resetModules();
  delete globalThis.TicketSync;
  await import("../public/sync.js");
  TicketSync = globalThis.TicketSync;
  TicketSync.init();
}

const QUEUE_KEY = "numzscanSyncQueue";
const LAST_SYNC_KEY = "numzscanLastSync";

let fetchMock;

beforeEach(async () => {
  storage.clear();
  await loadFreshSync();
  navigator.onLine = true;
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }));
  globalThis.fetch = fetchMock;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sync queue persistence", () => {
  it("enqueue stores the action in localStorage with retries and createdAt", () => {
    const id = TicketSync.enqueue({ type: "createTicket", payload: { id: "Q1" } });
    const persisted = JSON.parse(storage.get(QUEUE_KEY));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ id, type: "createTicket", retries: 0, payload: { id: "Q1" } });
    expect(typeof persisted[0].createdAt).toBe("string");
    expect(TicketSync.getPendingCount()).toBe(1);
  });

  it("returns a unique id for each enqueued item", () => {
    const a = TicketSync.enqueue({ type: "createTicket", payload: {} });
    const b = TicketSync.enqueue({ type: "createTicket", payload: {} });
    expect(a).not.toBe(b);
  });

  it("device id is generated once and reused", () => {
    const first = TicketSync.getDeviceId();
    expect(first.startsWith("device-")).toBe(true);
    expect(TicketSync.getDeviceId()).toBe(first);
    expect(storage.get("numzscanDeviceId")).toBe(first);
  });
});

describe("flushQueue", () => {
  it("does nothing and reports Offline when the browser is offline", async () => {
    navigator.onLine = false;
    const errors = [];
    const unsubscribe = TicketSync.onError((e) => errors.push(e && e.message));
    TicketSync.enqueue({ type: "createTicket", payload: { id: "O1" } });
    await TicketSync.flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(TicketSync.getPendingCount()).toBe(1);
    expect(errors).toContain("Offline");
    unsubscribe();
  });

  it("sends createTicket as POST /api/tickets and removes it on success", async () => {
    TicketSync.enqueue({ type: "createTicket", payload: { id: "C1", event_id: "e" } });
    await TicketSync.flushQueue();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tickets");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ id: "C1", event_id: "e" });
    expect(TicketSync.getPendingCount()).toBe(0);
  });

  it("maps updateTicket to PATCH /api/tickets/:id with the update body", async () => {
    TicketSync.enqueue({ type: "updateTicket", payload: { id: "U 1/x", update: { active: false } } });
    await TicketSync.flushQueue();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tickets/U%201%2Fx");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ active: false });
  });

  it("maps recordScan to POST /api/ticket-scans", async () => {
    TicketSync.enqueue({ type: "recordScan", payload: { ticket_id: "S1", scan_action: "scan" } });
    await TicketSync.flushQueue();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ticket-scans");
    expect(opts.method).toBe("POST");
  });

  it("maps resetTicket to PATCH with active true and a last_synced_at timestamp", async () => {
    TicketSync.enqueue({ type: "resetTicket", payload: { id: "R1" } });
    await TicketSync.flushQueue();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tickets/R1");
    const body = JSON.parse(opts.body);
    expect(body.active).toBe(true);
    expect(typeof body.last_synced_at).toBe("string");
  });

  it("records lastSync after a fully successful flush", async () => {
    TicketSync.enqueue({ type: "createTicket", payload: { id: "L1" } });
    await TicketSync.flushQueue();
    expect(storage.get(LAST_SYNC_KEY)).toBeTruthy();
    expect(TicketSync.getLastSyncAt()).toBe(storage.get(LAST_SYNC_KEY));
  });

  it("keeps a failed item, increments its retries, and surfaces the error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) });
    const errors = [];
    const unsubscribe = TicketSync.onError((e) => e && errors.push(e.message));
    TicketSync.enqueue({ type: "createTicket", payload: { id: "F1" } });
    await TicketSync.flushQueue();
    expect(TicketSync.getPendingCount()).toBe(1);
    const persisted = JSON.parse(storage.get(QUEUE_KEY));
    expect(persisted[0].retries).toBe(1);
    expect(errors.some((m) => m.includes("API error 500"))).toBe(true);
    unsubscribe();
  });

  it("schedules a retry after a backoff proportional to the retry count", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    TicketSync.enqueue({ type: "createTicket", payload: { id: "B1" } });
    await TicketSync.flushQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("drops an item once it has failed more than MAX_RETRIES (5) times", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    TicketSync.enqueue({ type: "createTicket", payload: { id: "D1" } });
    await TicketSync.flushQueue();
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }
    expect(TicketSync.getPendingCount()).toBe(0);
  });

  it("rejects an unknown queue action type as a failed item", async () => {
    TicketSync.enqueue({ type: "bogusAction", payload: {} });
    await TicketSync.flushQueue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(TicketSync.getPendingCount()).toBe(1);
  });
});

describe("remote reads", () => {
  it("fetchAllTickets scopes by event_id when given", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: "X" }], text: async () => "" });
    const rows = await TicketSync.fetchAllTickets("camp-1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tickets?event_id=camp-1");
    expect(rows).toEqual([{ id: "X" }]);
  });

  it("fetchTicketScansSince builds since and event_id query parameters", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [], text: async () => "" });
    await TicketSync.fetchTicketScansSince("2026-01-01T00:00:00Z", "camp-1");
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("since=2026-01-01T00%3A00%3A00Z");
    expect(url).toContain("event_id=camp-1");
  });

  it("returns an empty array when the API returns a non-array", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ error: "x" }), text: async () => "" });
    expect(await TicketSync.fetchAllTickets()).toEqual([]);
  });
});

describe("regressions: failed flushes and queue loading", () => {
  it("a flush with a failed item does not record lastSync and keeps the error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    const errors = [];
    const unsubscribe = TicketSync.onError((e) => errors.push(e ? e.message : null));
    TicketSync.enqueue({ type: "createTicket", payload: { id: "K1" } });
    await TicketSync.flushQueue();
    expect(errors[errors.length - 1]).toContain("API error 500");
    expect(TicketSync.getLastSyncAt()).toBeNull();
    expect(storage.get(LAST_SYNC_KEY)).toBeUndefined();
    unsubscribe();
  });

  it("a later successful retry records lastSync and clears the error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    const errors = [];
    const unsubscribe = TicketSync.onError((e) => errors.push(e ? e.message : null));
    TicketSync.enqueue({ type: "createTicket", payload: { id: "K2" } });
    await TicketSync.flushQueue();
    expect(TicketSync.getLastSyncAt()).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(TicketSync.getPendingCount()).toBe(0);
    expect(TicketSync.getLastSyncAt()).toBeTruthy();
    expect(errors[errors.length - 1]).toBeNull();
    unsubscribe();
  });

  it("enqueue before init() keeps previously persisted queue items", async () => {
    storage.set(QUEUE_KEY, JSON.stringify([{ id: "OLD", type: "createTicket", payload: { id: "OLD" }, retries: 0 }]));
    vi.resetModules();
    delete globalThis.TicketSync;
    await import("../public/sync.js");
    const fresh = globalThis.TicketSync;
    expect(fresh.getPendingCount()).toBe(1);
    fresh.enqueue({ type: "createTicket", payload: { id: "NEW" } });
    const persisted = JSON.parse(storage.get(QUEUE_KEY));
    expect(persisted.map((i) => i.payload.id)).toEqual(["OLD", "NEW"]);
    expect(fresh.getPendingCount()).toBe(2);
  });
});
