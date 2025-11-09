import { loadTickets, saveTickets, migrateFromLocalStorage, createTicketIdGenerator } from "./modules/db.js";
import { getDomRefs } from "./modules/dom.js";
import { createUi } from "./modules/ui.js";
import { createTicketGrid } from "./modules/ticketGrid.js";
import { normalizeTickets, rebuildTicketMap, sortTickets, computeTicketStats, findTicket, ensureTicketShape } from "./modules/tickets.js";
import { loadAppSettings, saveAppSettings } from "./modules/settings.js";
import { setupTabs } from "./modules/tabs.js";
import { parseBoolean } from "./modules/utils.js";
import { setupActions } from "./modules/actions.js";
import { setupScanner } from "./modules/scanner.js";
import { setupReset } from "./modules/reset.js";
import { setupCsvImport } from "./modules/csvImport.js";

const APP_VERSION = window.APP_VERSION || "2025-11-08-1";
const EVENT_ID = "default-event";
const DEFAULT_SCAN_LOCATION = "default";
const TICKET_BASE_URL = "https://program-pro-1.onrender.com?ticket=";
const USE_URL_IN_QR = true;
const SETTINGS_DEFAULTS = {
  autoSyncEnabled: false,
  generationLocked: false,
  lastRemoteSync: null,
};

const state = {
  tickets: [],
  ticketMap: new Map(),
  ticketIdGenerator: createTicketIdGenerator(),
  dbReady: false,
  isGenerating: false,
  supabaseEnabled: false,
  supabaseAutoSync: false,
  supabaseStatus: { pending: 0, syncing: false, lastSyncAt: null, online: navigator.onLine },
  supabaseAnalytics: null,
  settings: SETTINGS_DEFAULTS,
  html5QrScanner: null,
  lastScannedCode: null,
  lastScanTime: 0,
  scanProcessing: false,
  scanCooldownTimer: null,
  manualSyncInProgress: false,
};

let dom = null;
let ui = null;
let ticketGrid = null;
let actions = null;
let scanner = null;
let resetController = null;
let csvImportController = null;
let supabaseUnsubscribe = null;
let supabaseErrorUnsubscribe = null;

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((err) => {
    console.error("[App] Failed to initialize", err);
    alert("Failed to initialize app. Check console for details.");
  });
});

async function bootstrap() {
  dom = getDomRefs();
  ui = createUi(dom);
  ticketGrid = createTicketGrid(dom, { ticketBaseUrl: TICKET_BASE_URL, useUrlInQr: USE_URL_IN_QR });

  setupTabs(dom);

  ui.setGlobalLoading(true, "Setting up…");

  await migrateFromLocalStorage();

  state.settings = loadAppSettings(SETTINGS_DEFAULTS);
  // const supabaseAvailable = typeof SupabaseSync !== "undefined";
  // const autoSyncEnabled = parseBoolean(state.settings.autoSyncEnabled, false);
  const supabaseAvailable = false; // Supabase disabled for local-only mode
  const autoSyncEnabled = false;

  state.supabaseEnabled = supabaseAvailable;
  state.supabaseAutoSync = supabaseAvailable && autoSyncEnabled;

  if (autoSyncEnabled && !state.supabaseAutoSync) {
    state.settings.autoSyncEnabled = false;
    saveAppSettings(state.settings);
  }

  const initialTickets = await loadTickets();
  state.tickets = normalizeTickets(initialTickets);
  state.ticketIdGenerator.setBaseline(state.tickets.length);
  state.ticketMap = rebuildTicketMap(state.tickets);

  await updateDashboard();

  actions = setupActions({
    dom,
    ui,
    state,
    ticketGrid,
    onTicketsChanged: handleTicketsChanged,
    ticketBaseUrl: TICKET_BASE_URL,
    useUrlInQr: USE_URL_IN_QR,
    generateId: () => state.ticketIdGenerator.next(),
    supabase: createSupabaseBridge(),
    appVersion: APP_VERSION,
    eventId: EVENT_ID,
  });

  scanner = setupScanner({
    dom,
    ui,
    state,
    findTicket: (code) => findTicket(state.ticketMap, code),
    onTicketUpdated: handleTicketsChanged,
    supabase: createSupabaseBridge(),
    eventId: EVENT_ID,
  defaultScanLocation: DEFAULT_SCAN_LOCATION,
  });

  resetController = setupReset({
    dom,
    ui,
    state,
    saveTickets: async () => saveTickets(state.tickets),
    onTicketsChanged: handleTicketsChanged,
    supabase: createSupabaseBridge(),
    eventId: EVENT_ID,
    defaultScanLocation: DEFAULT_SCAN_LOCATION,
  });

  csvImportController = setupCsvImport({
    dom,
    ui,
    state,
    saveTickets: async () => saveTickets(state.tickets),
    onTicketsChanged: handleTicketsChanged,
    setGenerationLock,
    supabase: createSupabaseBridge(),
    eventId: EVENT_ID,
  });

  // Supabase sync disabled: keep indicator in local-only state
  // setupSupabaseListeners();
  ui.updateSyncIndicator(state.supabaseStatus, false);
  if (dom.manualSyncBtn) {
    dom.manualSyncBtn.disabled = true;
    dom.manualSyncBtn.title = "Cloud sync disabled in local-only mode";
  }

  ui.updateGenerationLockUI(state.settings.generationLocked);
  ui.setGlobalLoading(false);

  if (dom.manualSyncBtn) {
    dom.manualSyncBtn.addEventListener("click", handleManualSync);
    dom.manualSyncBtn.disabled = !state.supabaseEnabled;
  }
}

async function refreshTicketsFromStorage() {
  const latest = await loadTickets();
  state.tickets = normalizeTickets(latest);
  state.ticketIdGenerator.setBaseline(state.tickets.length);
  state.ticketMap = rebuildTicketMap(state.tickets);
  await updateDashboard();
}

async function handleTicketsChanged() {
  state.ticketMap = rebuildTicketMap(state.tickets);
  await saveTickets(state.tickets);
  await updateDashboard();
}

async function updateDashboard({ refreshGrid = true } = {}) {
  const sorted = sortTickets(state.tickets);
  state.tickets = sorted;
  state.ticketMap = rebuildTicketMap(state.tickets);

  if (refreshGrid) {
    ticketGrid.renderGrid(sorted);
  }
  const stats = computeTicketStats(sorted);
  ticketGrid.renderTicketStats(stats);
}

function setGenerationLock(locked, { reason = "", propagate = true } = {}) {
  state.settings.generationLocked = Boolean(locked);
  ui.updateGenerationLockUI(state.settings.generationLocked);
  saveAppSettings(state.settings);

  if (propagate && state.supabaseEnabled) {
    const supabase = createSupabaseBridge();
    supabase.enqueueControlTicket(state.settings.generationLocked, reason);
  }
}

function createSupabaseBridge() {
  // Supabase integration disabled; provide no-op implementations for local-only mode
  return {
    isEnabled: () => false,
    enqueue() {},
    enqueueControlTicket() {},
    getDeviceId: () => "local-device",
    fetchTickets: () => Promise.resolve([]),
    fetchScansSince: () => Promise.resolve([]),
    flushQueue: () => Promise.resolve(),
    getLastSyncAt: () => null,
    setLastSyncAt() {},
    getStatus: () => ({ ...state.supabaseStatus }),
    getPendingCount: () => 0,
  };
}

/* Original Supabase bridge retained for reference:
function createSupabaseBridge(options = {}) {
  const { force = false, autoFlush } = options;
  const supabaseAvailable = typeof SupabaseSync !== "undefined";
  const enabled = () => {
    if (force) return supabaseAvailable;
    return state.supabaseEnabled && supabaseAvailable;
  };
  const shouldAutoFlush = typeof autoFlush === "boolean" ? autoFlush : state.supabaseAutoSync;

  return {
    isEnabled: enabled,
    enqueue(action) {
      if (!enabled()) return;
      SupabaseSync.enqueue(action);
      if (shouldAutoFlush) {
        SupabaseSync.flushQueue();
      }
    },
    enqueueControlTicket(locked, reason = "") {
      if (!enabled()) return;
      const payload = {
        id: "__control_generation__",
        event_id: EVENT_ID,
        active: !locked,
        metadata: {
          locked,
          reason,
          updated_at: new Date().toISOString(),
        },
      };
      SupabaseSync.enqueue({
        type: "createTicket",
        payload,
      });
      if (shouldAutoFlush) {
        SupabaseSync.flushQueue();
      }
    },
    getDeviceId() {
      return supabaseAvailable ? SupabaseSync.getDeviceId() : "-";
    },
    fetchTickets: () => (enabled() ? SupabaseSync.fetchAllTickets() : Promise.resolve([])),
    fetchScansSince: (ts) => (enabled() ? SupabaseSync.fetchTicketScansSince(ts) : Promise.resolve([])),
    flushQueue: () => {
      if (supabaseAvailable) return SupabaseSync.flushQueue();
      return Promise.resolve();
    },
    getLastSyncAt: () => (enabled() ? SupabaseSync.getLastSyncAt() : null),
    setLastSyncAt: (ts) => {
      if (enabled()) SupabaseSync.setLastSyncAt(ts);
    },
    getStatus: () => ({ ...state.supabaseStatus }),
    getPendingCount: () => (supabaseAvailable ? SupabaseSync.getPendingCount() : 0),
  };
}
*/

function setupSupabaseListeners() {
  if (typeof SupabaseSync === "undefined" || !state.supabaseEnabled) {
    ui.updateSyncIndicator(state.supabaseStatus, false);
    if (dom.manualSyncBtn) {
      dom.manualSyncBtn.disabled = true;
    }
    return;
  }

  SupabaseSync.init();

  if (supabaseUnsubscribe) supabaseUnsubscribe();
  supabaseUnsubscribe = SupabaseSync.onStatusChange((status) => {
    state.supabaseStatus = status;
    ui.updateSyncIndicator(status, state.supabaseAutoSync, {
      manualMode: !state.supabaseAutoSync,
      getDeviceId: () => SupabaseSync.getDeviceId(),
      getLastSyncAt: () => SupabaseSync.getLastSyncAt(),
      getTotals: () => state.supabaseAnalytics,
    });
  });

  if (supabaseErrorUnsubscribe) supabaseErrorUnsubscribe();
  supabaseErrorUnsubscribe = SupabaseSync.onError((error) => {
    if (!error) {
      ui.hideSyncAlert();
      return;
    }
    ui.showSyncAlert(error.message || "Cloud sync failed. Will retry shortly.");
  });
}

async function initialSupabaseSync({ force = false } = {}) {
  if (!force) {
    if (!state.supabaseEnabled || typeof SupabaseSync === "undefined") return;
    if (!state.supabaseAutoSync) return;
  } else if (typeof SupabaseSync === "undefined") {
    return;
  }

  ui.updateLoaderMessage("Syncing tickets…");
  const supabase = createSupabaseBridge({ force: true, autoFlush: false });

  try {
    const remoteTickets = await supabase.fetchTickets();
    const merged = mergeRemoteTickets(remoteTickets);

    const lastSync = supabase.getLastSyncAt();
    const scans = await supabase.fetchScansSince(lastSync);
    const changed = applyRemoteScans(scans);

    if (merged || changed) {
      await saveTickets(state.tickets);
      await updateDashboard();
    }

    const syncedAt = new Date().toISOString();
    supabase.setLastSyncAt(syncedAt);
    state.supabaseStatus = {
      pending: supabase.getPendingCount ? supabase.getPendingCount() : supabase.getStatus().pending,
      syncing: false,
      lastSyncAt: syncedAt,
      online: navigator.onLine,
    };
    ui.hideSyncAlert();
  } catch (error) {
    console.error("[Supabase] initial sync failed", error);
    ui.showSyncAlert(error.message || "Failed to fetch data from cloud.");
    if (force) throw error;
  }
}

function mergeRemoteTickets(remoteTickets) {
  if (!Array.isArray(remoteTickets) || remoteTickets.length === 0) return false;
  let changed = false;

  remoteTickets.forEach((remote) => {
    if (!remote || remote.id === "__control_generation__") {
      if (remote?.id === "__control_generation__" && remote?.metadata) {
        const locked = remote.metadata.locked === true || remote.metadata.locked === "true";
        if (state.settings.generationLocked !== locked) {
          state.settings.generationLocked = locked;
          saveAppSettings(state.settings);
          ui.updateGenerationLockUI(locked);
        }
      }
      return;
    }

    const existing = state.ticketMap.get(remote.id);
    const remoteUsed = remote.active === false;
    const remoteTicket = ensureTicketShape({
      id: remote.id,
      used: remoteUsed,
      createdAt: remote.created_at || remote.createdAt || new Date().toISOString(),
      usedAt: remoteUsed ? remote.last_synced_at || remote.used_at || null : null,
      syncStatus: "synced",
      pendingAction: null,
      lastSyncedAt: remote.last_synced_at || new Date().toISOString(),
      metadata: remote.metadata || {},
      source: "cloud",
    });

    if (!existing) {
      state.tickets.push(remoteTicket);
      changed = true;
      return;
    }

    let updated = false;
    if (existing.used !== remoteTicket.used) {
      existing.used = remoteTicket.used;
      existing.usedAt = remoteTicket.usedAt;
      updated = true;
    }
    existing.syncStatus = "synced";
    existing.pendingAction = null;
    existing.lastSyncedAt = remoteTicket.lastSyncedAt;
    existing.metadata = remoteTicket.metadata;
    existing.source = "cloud";

    if (updated) changed = true;
  });

  if (changed) {
    state.tickets = sortTickets(state.tickets);
    state.ticketMap = rebuildTicketMap(state.tickets);
    state.ticketIdGenerator.setBaseline(state.tickets.length);
  }
  state.supabaseAnalytics = {
    active: remoteTickets.filter((t) => t.active !== false).length,
    inactive: remoteTickets.filter((t) => t.active === false).length,
  };
  return changed;
}

function applyRemoteScans(scans) {
  if (!Array.isArray(scans) || scans.length === 0) return false;
  let changed = false;

  scans.forEach((scan) => {
    if (!scan || !scan.ticket_id) return;
    const ticket = state.ticketMap.get(scan.ticket_id);
    if (!ticket) return;

    const action = scan.scan_action;
    const scannedAt = scan.scan_at || scan.created_at || scan.createdAt;
    if (action === "scan" && !ticket.used) {
      ticket.used = true;
      ticket.usedAt = scannedAt || new Date().toISOString();
      ticket.syncStatus = "synced";
      ticket.pendingAction = null;
      changed = true;
    }
    if (action === "reset" && ticket.used) {
      ticket.used = false;
      ticket.usedAt = null;
      ticket.syncStatus = "synced";
      ticket.pendingAction = null;
      changed = true;
    }
  });

  if (changed) {
    state.tickets = sortTickets(state.tickets);
    state.ticketMap = rebuildTicketMap(state.tickets);
  }

  return changed;
}

async function handleManualSync() {
  if (!state.supabaseEnabled || typeof SupabaseSync === "undefined") {
    alert("Cloud sync is not configured on this device.");
    return;
  }
  if (state.manualSyncInProgress) return;
  if (!navigator.onLine) {
    alert("Connect to the internet before syncing.");
    return;
  }

  state.manualSyncInProgress = true;
  ui.hideSyncAlert();
  if (dom.manualSyncBtn) {
    ui.toggleButtonLoading(dom.manualSyncBtn, true, "Syncing…");
  }

  const bridge = createSupabaseBridge({ force: true, autoFlush: true });

  try {
    state.supabaseStatus = { ...state.supabaseStatus, syncing: true };
    ui.updateSyncIndicator(state.supabaseStatus, state.supabaseAutoSync, {
      manualMode: !state.supabaseAutoSync,
      getDeviceId: () => bridge.getDeviceId(),
      getLastSyncAt: () => bridge.getLastSyncAt(),
      getTotals: () => state.supabaseAnalytics,
    });

    await bridge.flushQueue();
    await initialSupabaseSync({ force: true });

    state.supabaseStatus = {
      pending: bridge.getPendingCount ? bridge.getPendingCount() : state.supabaseStatus.pending,
      syncing: false,
      lastSyncAt: bridge.getLastSyncAt ? bridge.getLastSyncAt() : state.supabaseStatus.lastSyncAt,
      online: navigator.onLine,
    };

    ui.updateSyncIndicator(state.supabaseStatus, state.supabaseAutoSync, {
      manualMode: !state.supabaseAutoSync,
      getDeviceId: () => bridge.getDeviceId(),
      getLastSyncAt: () => bridge.getLastSyncAt(),
      getTotals: () => state.supabaseAnalytics,
    });

    alert("Cloud sync complete.");
  } catch (error) {
    console.error("[App] Manual sync failed", error);
    state.supabaseStatus = { ...state.supabaseStatus, syncing: false };
    ui.updateSyncIndicator(state.supabaseStatus, state.supabaseAutoSync, {
      manualMode: !state.supabaseAutoSync,
      getDeviceId: () => bridge.getDeviceId(),
      getLastSyncAt: () => bridge.getLastSyncAt(),
      getTotals: () => state.supabaseAnalytics,
    });
    ui.showSyncAlert(error.message || "Manual sync failed.");
    alert(`Manual sync failed: ${error.message || "Unknown error"}`);
  } finally {
    state.manualSyncInProgress = false;
    if (dom.manualSyncBtn) {
      ui.toggleButtonLoading(dom.manualSyncBtn, false);
    }
  }
}

