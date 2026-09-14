// Ticket cloud sync — talks to our own NUMZSCAN API (Express + Postgres),
// not a third party. Replaces the old Supabase-based sync (removed after a
// service_role key was found committed to this repo).
// Provides global TicketSync for main.js to use.

(function initTicketSync() {
  const API_BASE = "/api";
  const DEVICE_ID_STORAGE_KEY = "numzscanDeviceId";
  const QUEUE_STORAGE_KEY = "numzscanSyncQueue";
  const LAST_SYNC_KEY = "numzscanLastSync";
  const MAX_RETRIES = 5;
  const RETRY_BACKOFF_MS = 4000;

  const state = {
    deviceId: null,
    queue: [],
    syncing: false,
    lastSyncAt: null,
    listeners: new Set(),
    errorListeners: new Set(),
  };

  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      state.queue = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn("[TicketSync] Failed to load queue, resetting", err);
      state.queue = [];
    }
  }

  function persistQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(state.queue));
    } catch (err) {
      console.error("[TicketSync] Failed to persist queue", err);
    }
    notify();
  }

  function loadLastSync() {
    state.lastSyncAt = localStorage.getItem(LAST_SYNC_KEY) || null;
  }

  function persistLastSync(ts) {
    state.lastSyncAt = ts;
    try {
      if (ts) {
        localStorage.setItem(LAST_SYNC_KEY, ts);
      } else {
        localStorage.removeItem(LAST_SYNC_KEY);
      }
    } catch (err) {
      console.error("[TicketSync] Failed to persist last sync", err);
    }
  }

  function ensureDeviceId() {
    if (state.deviceId) return state.deviceId;
    let id = null;
    try {
      id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (!id) {
        id = `device-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16)}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
      }
    } catch (err) {
      console.error("[TicketSync] Failed to obtain device id", err);
      id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    state.deviceId = id;
    return id;
  }

  function notify() {
    state.listeners.forEach((cb) => {
      try {
        cb({
          pending: state.queue.length,
          syncing: state.syncing,
          lastSyncAt: state.lastSyncAt,
          online: navigator.onLine,
        });
      } catch (err) {
        console.error("[TicketSync] listener error", err);
      }
    });
  }

  function notifyError(error) {
    state.errorListeners.forEach((cb) => {
      try {
        cb(error);
      } catch (err) {
        console.error("[TicketSync] error listener failed", err);
      }
    });
  }

  function onStatusChange(cb) {
    state.listeners.add(cb);
    cb({ pending: state.queue.length, syncing: state.syncing, lastSyncAt: state.lastSyncAt, online: navigator.onLine });
    return () => state.listeners.delete(cb);
  }

  function onError(cb) {
    state.errorListeners.add(cb);
    return () => state.errorListeners.delete(cb);
  }

  function enqueue(action) {
    const item = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      retries: 0,
      createdAt: new Date().toISOString(),
      ...action,
    };
    state.queue.push(item);
    persistQueue();
    return item.id;
  }

  function removeFromQueue(id) {
    const idx = state.queue.findIndex((item) => item.id === id);
    if (idx >= 0) {
      state.queue.splice(idx, 1);
      persistQueue();
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API error ${response.status}: ${text || response.statusText}`);
    }
    return response.json().catch(() => null);
  }

  async function handleQueueItem(item) {
    const { type, payload } = item;
    switch (type) {
      case "createTicket":
        return apiRequest("/tickets", { method: "POST", body: JSON.stringify(payload) });
      case "updateTicket":
        return apiRequest(`/tickets/${encodeURIComponent(payload.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload.update),
        });
      case "recordScan":
        return apiRequest("/ticket-scans", { method: "POST", body: JSON.stringify(payload) });
      case "resetTicket":
        return apiRequest(`/tickets/${encodeURIComponent(payload.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true, last_synced_at: new Date().toISOString() }),
        });
      default:
        throw new Error(`Unknown queue action: ${type}`);
    }
  }

  async function flushQueue() {
    if (!navigator.onLine) {
      notify();
      notifyError(new Error("Offline"));
      return;
    }
    if (state.syncing || state.queue.length === 0) {
      notify();
      if (state.queue.length === 0) {
        notifyError(null);
      }
      return;
    }
    state.syncing = true;
    notify();

    try {
      for (const item of [...state.queue]) {
        try {
          await handleQueueItem(item);
          removeFromQueue(item.id);
        } catch (error) {
          console.error("[TicketSync] Failed to sync queue item", item, error);
          notifyError(error);
          item.retries += 1;
          if (item.retries > MAX_RETRIES) {
            console.error("[TicketSync] Dropping queue item after max retries", item);
            removeFromQueue(item.id);
          } else {
            setTimeout(() => flushQueue(), RETRY_BACKOFF_MS * item.retries);
          }
        }
      }
      persistLastSync(new Date().toISOString());
      notifyError(null);
    } finally {
      state.syncing = false;
      persistQueue();
      notify();
    }
  }

  async function fetchAllTickets(eventId) {
    const qs = eventId ? `?event_id=${encodeURIComponent(eventId)}` : "";
    const result = await apiRequest(`/tickets${qs}`);
    return Array.isArray(result) ? result : [];
  }

  async function fetchTicketScansSince(timestamp, eventId) {
    const params = new URLSearchParams();
    if (timestamp) params.set("since", timestamp);
    if (eventId) params.set("event_id", eventId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await apiRequest(`/ticket-scans${qs}`);
    return Array.isArray(result) ? result : [];
  }

  function init() {
    ensureDeviceId();
    loadQueue();
    loadLastSync();
    notify();

    window.addEventListener("online", () => {
      notify();
      flushQueue();
    });
    window.addEventListener("offline", notify);
  }

  window.TicketSync = {
    init,
    enqueue,
    flushQueue,
    getDeviceId: ensureDeviceId,
    getPendingCount: () => state.queue.length,
    getLastSyncAt: () => state.lastSyncAt,
    setLastSyncAt: (ts) => persistLastSync(ts),
    fetchAllTickets,
    fetchTicketScansSince,
    onStatusChange,
    onError,
  };
})();
