// Supabase synchronization helper
// Relies on SupabaseConfig global defined in supabase-config.js
// Provides global SupabaseSync object for script.js to use.

(function initSupabaseSync() {
  const DEVICE_ID_STORAGE_KEY = "supabaseDeviceId";
  const QUEUE_STORAGE_KEY = "supabaseSyncQueue";
  const LAST_SYNC_KEY = "supabaseLastSync";
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
      console.warn("[SupabaseSync] Failed to load queue, resetting", err);
      state.queue = [];
    }
  }

  function persistQueue() {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(state.queue));
    } catch (err) {
      console.error("[SupabaseSync] Failed to persist queue", err);
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
      console.error("[SupabaseSync] Failed to persist last sync", err);
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
      console.error("[SupabaseSync] Failed to obtain device id", err);
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
        console.error("[SupabaseSync] listener error", err);
      }
    });
  }

  function notifyError(error) {
    state.errorListeners.forEach((cb) => {
      try {
        cb(error);
      } catch (err) {
        console.error("[SupabaseSync] error listener failed", err);
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

  async function supabaseRequest(path, options = {}) {
    SupabaseConfig.ensureSupabaseConfig();
    const url = `${SupabaseConfig.url}/rest/v1/${path}`;
    const headers = Object.assign({}, SupabaseConfig.headers, options.headers || {});
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase error ${response.status}: ${text}`);
    }
    return response.json().catch(() => null);
  }

  async function handleQueueItem(item) {
    const { type, payload } = item;
    switch (type) {
      case "createTicket": {
        return supabaseRequest(`${SupabaseConfig.tables.tickets}`, {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { Prefer: "resolution=merge-duplicates" },
        });
      }
      case "updateTicket": {
        return supabaseRequest(`${SupabaseConfig.tables.tickets}?id=eq.${encodeURIComponent(payload.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload.update),
        });
      }
      case "recordScan": {
        return supabaseRequest(`${SupabaseConfig.tables.ticketScans}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      case "resetTicket": {
        return supabaseRequest(`${SupabaseConfig.tables.tickets}?id=eq.${encodeURIComponent(payload.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ active: true, last_synced_at: new Date().toISOString() }),
        });
      }
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
          console.error("[SupabaseSync] Failed to sync queue item", item, error);
          notifyError(error);
          item.retries += 1;
          if (item.retries > MAX_RETRIES) {
            console.error("[SupabaseSync] Dropping queue item after max retries", item);
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

  async function fetchAllTickets() {
    const result = await supabaseRequest(`${SupabaseConfig.tables.tickets}?select=*`);
    return Array.isArray(result) ? result : [];
  }

  async function fetchTicketScansSince(timestamp) {
    const filter = timestamp ? `&scan_at=gte.${encodeURIComponent(timestamp)}` : "";
    const result = await supabaseRequest(`${SupabaseConfig.tables.ticketScans}?select=*&order=scan_at.asc${filter}`);
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

  window.SupabaseSync = {
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
