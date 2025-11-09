import { loadConfig } from "./modules/fundraising/config.js";
import { getDomRefs } from "./modules/fundraising/dom.js";
import { createUi } from "./modules/fundraising/ui.js";
import { createLoader } from "./modules/fundraising/loader.js";
import { loadState, saveState, getDefaultState } from "./modules/fundraising/state.js";
import { createContributionStore } from "./modules/fundraising/contributions.js";
import { createTestimonyRotator } from "./modules/fundraising/testimony.js";
import { createOverlayController } from "./modules/fundraising/overlay.js";
import { importCsv } from "./modules/fundraising/csv.js";
import { createBridge } from "./modules/fundraising/bridge.js";
import { createAutoSync } from "./modules/fundraising/autoSync.js";
import { formatCurrency } from "./modules/fundraising/utils.js";

const dom = getDomRefs();
const loader = createLoader(dom);
const overlay = createOverlayController();

let state = {
  ...getDefaultState(),
  contributions: [],
};

const ui = createUi(dom, state, {
  onMilestoneCelebrated: () => {},
});

const autoSync = createAutoSync(state, dom);

const contributionStore = createContributionStore(state, {
  onChange: handleTotalsUpdated,
});

const testimonyRotator = createTestimonyRotator(dom, state);

const bridge = createBridge({
  state,
  autoSync,
  addContribution: (entry) => contributionStore.addContribution(entry),
  ui,
  overlay,
});

let storageSyncTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  loader.show("Preparing dashboard…");
  const config = await loadConfig();
  const storedState = loadState();

  if (storedState) {
    state = Object.assign(state, config, storedState);
  } else {
    state = Object.assign(state, config, {
      contributions: [
        {
          id: "initial",
          type: "initial",
          amount: config.currentAmount,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  contributionStore.recalc();
  autoSync.set(typeof state.autoSyncEnabled === "boolean" ? state.autoSyncEnabled : true);
  handleTotalsUpdated();
  testimonyRotator.start();
  bridge.install();
  bindEvents();
  syncUi();
  saveState(state);

  window.addEventListener("storage", handleStorageEvent);
  storageSyncTimer = setInterval(checkForExternalUpdates, 15000);
  loader.hide();
}

function bindEvents() {
  dom.manualForm?.addEventListener("submit", handleManualSubmit);
  dom.simulateTicket?.addEventListener("click", simulateTicketScan);
  dom.autoSyncToggle?.addEventListener("change", (event) =>
    autoSync.toggleFromEvent(event, {
      onChange: (enabled) => {
        saveState(state);
        ui.showToast(enabled ? "Auto sync enabled." : "Auto sync paused.");
      },
    })
  );
  dom.clearContributions?.addEventListener("click", handleClearContributions);
  if (dom.importCsvBtn && dom.importCsvFile) {
    dom.importCsvBtn.addEventListener("click", () => dom.importCsvFile.click());
    dom.importCsvFile.addEventListener("change", onCsvSelected);
  }
  dom.openOverlayBtn?.addEventListener("click", () => overlay.open());
}

function syncUi() {
  ui.updateProgress();
  ui.renderStats(contributionStore.totals());
  ui.renderContributions(state.contributions);
}

function handleTotalsUpdated() {
  syncUi();
  saveState(state);
}

function handleManualSubmit(event) {
  event.preventDefault();
  const type = (dom.entryType?.value || "donation").trim();
  const rawAmount = Number(dom.entryAmount?.value || 0);
  if (!rawAmount || rawAmount <= 0) {
    alert("Enter a valid amount");
    return;
  }
  const notes = dom.entryNotes?.value || "";
  const amount = type === "vip" ? rawAmount * 2 : rawAmount;

  contributionStore.addContribution({
    type,
    amount,
    notes,
    createdAt: new Date().toISOString(),
    id: `manual-${Date.now()}`,
  });
  ui.showToast(`Manual entry: ${type} — ${formatCurrency(amount)}`);
  event.target.reset();
}

function handleClearContributions() {
  if (!confirm("This will clear contribution history (except the initial amount). Continue?")) {
    return;
  }
  contributionStore.clear();
  ui.showToast("Contribution history cleared.");
}

function simulateTicketScan() {
  const ticketAmount = 50;
  if (!autoSync.isEnabled()) {
    ui.showToast("Auto sync paused — ticket not counted.");
    return;
  }
  contributionStore.addContribution({
    id: `ticket-${Date.now()}`,
    type: "ticket",
    amount: ticketAmount,
    source: "auto",
    createdAt: new Date().toISOString(),
  });
  ui.showToast(`Ticket scanned! +${formatCurrency(ticketAmount)}`);
}

function onCsvSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  importCsv(file, {
    loader,
    ui,
    dom,
    state,
    contributionStore,
    onAfterImport: (count) => {
      ui.showToast(`Imported ${count} contributions!`);
      handleTotalsUpdated();
    },
  });
}

function handleStorageEvent(event) {
  if (event.key !== "lhgFundraisingState" || !event.newValue) return;
  try {
    const latest = JSON.parse(event.newValue);
    applyExternalState(latest);
  } catch (error) {
    console.error("[Fundraising] Storage sync failed", error);
  }
}

function checkForExternalUpdates() {
  const latest = loadState();
  if (!latest) return;
  if (latest.currentAmount !== state.currentAmount || latest.contributions.length !== state.contributions.length) {
    applyExternalState(latest);
  }
}

function applyExternalState(latest) {
  Object.assign(state, latest);
  contributionStore.recalc();
  testimonyRotator.reset();
  testimonyRotator.start();
  syncUi();
}

