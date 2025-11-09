import { createId } from "./utils.js";

export function createContributionStore(state, { onChange }) {
  function add(entry) {
    state.contributions.push(entry);
    recalc();
  }

  function addContribution({ type = "donation", amount = 0, notes = "", metadata = {}, id, createdAt }) {
    const entry = {
      id: id || createId("contribution"),
      type,
      amount,
      notes,
      metadata,
      createdAt: createdAt || new Date().toISOString(),
    };
    add(entry);
    return entry;
  }

  function importMany(entries) {
    entries.forEach(add);
    recalc();
  }

  function clearNonInitial() {
    state.contributions = state.contributions.filter((entry) => entry.type === "initial");
    recalc();
  }

  function recalc() {
    state.currentAmount = state.contributions.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    onChange?.();
  }

  function totals() {
    return state.contributions.reduce(
      (acc, entry) => {
        acc.count += 1;
        const amount = entry.amount || 0;
        switch (entry.type) {
          case "ticket":
          case "bulk_tickets":
            acc.ticketSales += amount;
            break;
          case "donation":
            acc.donations += amount;
            break;
          case "vip":
            acc.vip += amount;
            break;
          case "cash":
          default:
            acc.cash += amount;
        }
        return acc;
      },
      { count: 0, ticketSales: 0, donations: 0, vip: 0, cash: 0 }
    );
  }

  return {
    addContribution,
    importMany,
    clear: clearNonInitial,
    totals,
    recalc,
  };
}


