const DEFAULT_DATA = {
  targetAmount: 50000,
  currentAmount: 25000,
  testimonies: [
    "“Every ticket is a testimony that our children will worship on our own land.”",
    "“We are building a legacy of faith for generations to come.”",
    "“Our families stand together to establish a house of prayer.”"
  ],
  milestoneVerses: {
    25: "John 12:24 — Unless a seed falls to the ground, it remains alone.",
    50: "Deut 11:11 — A land of hills and valleys, watered by God.",
    75: "Psalm 127:1 — Unless the Lord builds the house, the builders labour in vain.",
    100: "Isaiah 56:7 — My house will be called a house of prayer for all nations."
  }
};

const STORAGE_KEY = "lhgFundraisingState";
const TESTIMONY_INTERVAL = 12000; // 12s

let state = {
  targetAmount: 0,
  currentAmount: 0,
  contributions: [],
  testimonies: [],
  milestoneVerses: {},
};

let testimonyIndex = 0;
let testimonyTimer = null;

const currentAmountEl = document.getElementById("currentAmount");
const targetAmountEl = document.getElementById("targetAmount");
const progressFillEl = document.getElementById("progressFill");
const progressVerseEl = document.getElementById("progressVerse");
const testimonyDisplayEl = document.getElementById("testimonyDisplay");
const ticketStatsList = document.getElementById("ticketStats");
const manualForm = document.getElementById("manualForm");
const simulateTicketBtn = document.getElementById("simulateTicket");
const celebrationContainer = document.getElementById("celebrationContainer");

async function loadConfig() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load data.json");
    const json = await response.json();
    return { ...DEFAULT_DATA, ...json };
  } catch (err) {
    console.warn("[Fundraising] Falling back to defaults:", err.message);
    return { ...DEFAULT_DATA };
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error("Failed to load stored state", err);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
}

function formatCurrency(amount) {
  return `K${amount.toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`;
}

function updateProgressDisplay() {
  const { currentAmount, targetAmount } = state;
  currentAmountEl.textContent = formatCurrency(currentAmount);
  targetAmountEl.textContent = formatCurrency(targetAmount);

  const percent = Math.min(100, Math.round((currentAmount / targetAmount) * 100));
  progressFillEl.style.width = `${percent}%`;

  const milestone = getCurrentMilestone(percent);
  if (milestone && state.milestoneVerses[milestone]) {
    progressVerseEl.textContent = state.milestoneVerses[milestone];
  } else {
    progressVerseEl.textContent = "From temporary spaces to a permanent home.";
  }

  highlightMilestones(percent);
}

function getCurrentMilestone(percent) {
  if (percent >= 100) return 100;
  if (percent >= 75) return 75;
  if (percent >= 50) return 50;
  if (percent >= 25) return 25;
  return null;
}

function highlightMilestones(percent) {
  [25, 50, 75, 100].forEach((threshold) => {
    const card = document.getElementById(`milestone${threshold}`);
    if (!card) return;
    if (percent >= threshold) {
      if (!card.classList.contains("active")) {
        card.classList.add("active");
        triggerCelebration(threshold);
      }
    } else {
      card.classList.remove("active");
    }
  });
}

function triggerCelebration(threshold) {
  if (!celebrationContainer) return;
  celebrationContainer.textContent = celebrationMessage(threshold);
  celebrationContainer.classList.remove("hidden");
  setTimeout(() => celebrationContainer.classList.add("hidden"), 3500);
}

function celebrationMessage(threshold) {
  switch (threshold) {
    case 25: return "Seed Planted! 🌱";
    case 50: return "Land Secured! 📍";
    case 75: return "Building Begins! 🧱";
    case 100: return "Home Established! 🏡";
    default: return "Milestone reached!";
  }
}

function renderTicketStats() {
  if (!ticketStatsList) return;
  const totals = computeContributionTotals();
  ticketStatsList.innerHTML = `
    <li>Total contributions: ${totals.count}</li>
    <li>Ticket sales: ${formatCurrency(totals.ticketSales)}</li>
    <li>Donations: ${formatCurrency(totals.donations)}</li>
    <li>VIP impact: ${formatCurrency(totals.vip)}</li>
    <li>Cash: ${formatCurrency(totals.cash)}</li>
  `;
}

function computeContributionTotals() {
  return state.contributions.reduce((acc, entry) => {
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
  }, { count: 0, ticketSales: 0, donations: 0, vip: 0, cash: 0 });
}

function startTestimonyLoop() {
  if (!testimonyDisplayEl || state.testimonies.length === 0) return;
  clearInterval(testimonyTimer);
  function showNext() {
    testimonyDisplayEl.textContent = state.testimonies[testimonyIndex];
    testimonyIndex = (testimonyIndex + 1) % state.testimonies.length;
  }
  showNext();
  testimonyTimer = setInterval(showNext, TESTIMONY_INTERVAL);
}

function addContribution(entry) {
  state.contributions.push(entry);
  state.currentAmount += entry.amount || 0;
  saveState();
  updateProgressDisplay();
  renderTicketStats();
}

function handleManualSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const type = formData.get("type") || document.getElementById("entryType")?.value || "donation";
  const rawAmount = Number(document.getElementById("entryAmount")?.value || 0);
  if (!rawAmount || rawAmount <= 0) {
    alert("Enter a valid amount");
    return;
  }
  const notes = document.getElementById("entryNotes")?.value || "";
  const amount = type === "vip" ? rawAmount * 2 : rawAmount;

  addContribution({
    id: `manual-${Date.now()}`,
    type,
    amount,
    notes,
    createdAt: new Date().toISOString(),
  });

  event.target.reset();
  showManualToast(type, amount);
}

function showManualToast(type, amount) {
  triggerCelebrationMessage(`Manual entry recorded: ${type} — ${formatCurrency(amount)}`);
}

function triggerCelebrationMessage(message) {
  if (!celebrationContainer) return;
  celebrationContainer.textContent = message;
  celebrationContainer.classList.remove("hidden");
  setTimeout(() => celebrationContainer.classList.add("hidden"), 2600);
}

function simulateTicketScan() {
  const ticketAmount = 50; // Example ticket amount
  addContribution({
    id: `ticket-${Date.now()}`,
    type: "ticket",
    amount: ticketAmount,
    source: "auto",
    createdAt: new Date().toISOString(),
  });
  triggerCelebrationMessage(`Ticket scanned! +${formatCurrency(ticketAmount)}`);
}

function bindEvents() {
  if (manualForm) {
    manualForm.addEventListener("submit", handleManualSubmit);
  }
  if (simulateTicketBtn) {
    simulateTicketBtn.addEventListener("click", simulateTicketScan);
  }
}

async function init() {
  const config = await loadConfig();
  const stored = loadState();
  state = stored
    ? { ...config, ...stored }
    : {
        ...config,
        contributions: [{ id: "initial", type: "initial", amount: config.currentAmount, createdAt: new Date().toISOString() }]
      };

  updateProgressDisplay();
  renderTicketStats();
  startTestimonyLoop();
  bindEvents();
  saveState();
}

document.addEventListener("DOMContentLoaded", init);

