import { clampPercent, formatCurrency } from "./utils.js";
import { MILESTONE_META, DEFAULT_CELEBRATION_GRADIENT } from "./constants.js";

export function createUi(dom, state, { onMilestoneCelebrated }) {
  let celebrationTimer = null;

  function updateProgress() {
    const percent = clampPercent((state.currentAmount / state.targetAmount) * 100);
    dom.currentAmount.textContent = formatCurrency(state.currentAmount);
    dom.targetAmount.textContent = formatCurrency(state.targetAmount);
    dom.progressFill.style.width = `${percent}%`;
    updateVerse(percent);
    highlightMilestones(percent);
    return percent;
  }

  function updateVerse(percent) {
    const thresholds = [100, 75, 50, 25];
    const matched = thresholds.find((value) => percent >= value);
    if (matched && state.milestoneVerses[matched]) {
      dom.progressVerse.textContent = state.milestoneVerses[matched];
    } else {
      dom.progressVerse.textContent = "From temporary spaces to a permanent home.";
    }
  }

  function highlightMilestones(percent) {
    [25, 50, 75, 100].forEach((threshold) => {
      const card = document.getElementById(`milestone${threshold}`);
      if (!card) return;
      const meta = MILESTONE_META[threshold];
      if (percent >= threshold) {
        if (!card.classList.contains("is-complete")) {
          card.classList.add("is-complete");
          if (meta?.className) card.classList.add(meta.className);
          triggerCelebration(meta?.message, meta?.gradient);
          onMilestoneCelebrated?.(threshold);
        }
      } else {
        card.classList.remove("is-complete");
        if (meta?.className) card.classList.remove(meta.className);
      }
    });
  }

  function triggerCelebration(message, gradient = DEFAULT_CELEBRATION_GRADIENT) {
    if (!dom.celebrationContainer) return;
    dom.celebrationContainer.textContent = message || "Milestone reached!";
    dom.celebrationContainer.style.background = gradient;
    dom.celebrationContainer.classList.remove("hidden");
    dom.celebrationContainer.style.opacity = "1";
    clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => {
      dom.celebrationContainer.classList.add("hidden");
      dom.celebrationContainer.style.opacity = "0";
    }, 3200);
  }

  function showToast(message) {
    triggerCelebration(message, DEFAULT_CELEBRATION_GRADIENT);
    clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => dom.celebrationContainer.classList.add("hidden"), 2200);
  }

  function renderStats(totals) {
    if (!dom.ticketStats) return;
    dom.ticketStats.innerHTML = `
      <li>Total contributions: ${totals.count}</li>
      <li>Ticket sales: ${formatCurrency(totals.ticketSales)}</li>
      <li>Donations: ${formatCurrency(totals.donations)}</li>
      <li>VIP impact: ${formatCurrency(totals.vip)}</li>
      <li>Cash: ${formatCurrency(totals.cash)}</li>
    `;
  }

  function renderContributions(contributions) {
    if (!dom.contributionList) return;
    const recent = contributions
      .filter((entry) => entry.type !== "initial")
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 10);

    if (!recent.length) {
      dom.contributionList.innerHTML =
        '<li class="contribution-item"><strong>No recent contributions yet.</strong><span class="contribution-meta">Be the first to give towards the land.</span></li>';
      return;
    }

    dom.contributionList.innerHTML = recent
      .map((entry) => {
        const amount = formatCurrency(entry.amount || 0);
        const note = entry.notes ? ` — ${entry.notes}` : "";
        const time = entry.createdAt
          ? new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Today";
        return `
          <li class="contribution-item">
            <strong>${labelForType(entry.type)}: ${amount}${note}</strong>
            <span class="contribution-meta">${time} • ${entry.type}</span>
          </li>`;
      })
      .join("");
  }

  function labelForType(type) {
    switch (type) {
      case "ticket":
      case "bulk_tickets":
        return "Ticket";
      case "donation":
        return "Donation";
      case "vip":
        return "VIP Ticket";
      case "cash":
        return "Cash";
      default:
        return "Contribution";
    }
  }

  function toggleButtonLoading(button, isLoading, message = "Working…") {
    if (!button) return;
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.innerHTML;
    }
    if (isLoading) {
      button.disabled = true;
      button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${message}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalLabel || button.innerHTML;
    }
  }

  return {
    updateProgress,
    renderStats,
    renderContributions,
    triggerCelebration,
    showToast,
    toggleButtonLoading,
  };
}


