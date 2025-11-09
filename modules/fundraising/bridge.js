import { formatCurrency } from "./utils.js";

export function createBridge({ state, autoSync, addContribution, ui, overlay }) {
  function recordTicketSale(amount = 50, meta = {}) {
    if (!autoSync.isEnabled()) return;
    const entry = addContribution({
      type: "ticket",
      amount,
      metadata: meta,
      createdAt: new Date().toISOString(),
      source: "auto",
    });
    ui.showToast(`Ticket scanned! +${formatCurrency(entry.amount)}`);
    return entry;
  }

  function addExternalContribution(entry) {
    const contribution = addContribution({
      id: entry.id,
      type: entry.type || "donation",
      amount: entry.amount || 0,
      notes: entry.notes || "",
      metadata: entry.metadata || {},
      createdAt: entry.createdAt || new Date().toISOString(),
    });
    ui.showToast(`Contribution added: ${formatCurrency(contribution.amount)}`);
    return contribution;
  }

  function setAutoSync(enabled) {
    autoSync.set(enabled);
  }

  function getState() {
    return { ...state, autoSyncEnabled: autoSync.isEnabled() };
  }

  function getRecentContributions(limit = 10) {
    return [...state.contributions]
      .filter((entry) => entry.type !== "initial")
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }

  function install() {
    window.FundraisingDashboard = {
      recordTicketSale,
      addContribution: addExternalContribution,
      getState,
      setAutoSync,
      getRecentContributions,
      getTestimonies: () => [...state.testimonies],
      openOverlay: () => overlay.open(),
    };
  }

  return {
    install,
  };
}

