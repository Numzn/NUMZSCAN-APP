const STORAGE_KEY = "lhgFundraisingState";
const DEFAULT_STATE = {
  targetAmount: 50000,
  currentAmount: 0,
  testimonies: [],
  contributions: [],
  milestoneVerses: {
    25: "John 12:24 — Unless a seed falls to the ground, it remains alone.",
    50: "Deut 11:11 — A land of hills and valleys, watered by God.",
    75: "Psalm 127:1 — Unless the Lord builds the house, the builders labour in vain.",
    100: "Isaiah 56:7 — My house will be called a house of prayer for all nations."
  }
};

const overlayCurrentEl = document.getElementById("overlayCurrent");
const overlayTargetEl = document.getElementById("overlayTarget");
const overlayFillEl = document.getElementById("overlayFill");
const overlayVerseEl = document.getElementById("overlayVerse");
const overlayTickerEl = document.getElementById("overlayTicker");
const overlayMilestoneEl = document.getElementById("overlayMilestone");
const overlayDeviceStatusEl = document.getElementById("overlayDeviceStatus");

const MILESTONE_META = {
  25: { message: "Seed Planted! 🌱" },
  50: { message: "Land Secured! 📍" },
  75: { message: "Building Begins! 🧱" },
  100: { message: "Home Established! 🏡" },
};

let tickerTimer = null;
let tickerItems = [];
let currentTickerIndex = 0;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (err) {
    console.error("Overlay: failed to parse stored state", err);
    return { ...DEFAULT_STATE };
  }
}

function formatCurrency(amount) {
  return `K${(amount || 0).toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`;
}

function computeMilestone(percent) {
  if (percent >= 100) return 100;
  if (percent >= 75) return 75;
  if (percent >= 50) return 50;
  if (percent >= 25) return 25;
  return null;
}

function render(state) {
  const target = state.targetAmount || DEFAULT_STATE.targetAmount;
  const current = state.currentAmount || 0;
  const percent = Math.min(100, Math.round((current / target) * 100));

  overlayCurrentEl.textContent = formatCurrency(current);
  overlayTargetEl.textContent = formatCurrency(target);
  overlayFillEl.style.width = `${percent}%`;

  const milestone = computeMilestone(percent);
  const verse = milestone && state.milestoneVerses[milestone]
    ? state.milestoneVerses[milestone]
    : "From temporary spaces to a permanent home.";
  overlayVerseEl.textContent = verse;

  if (milestone && MILESTONE_META[milestone]) {
    overlayMilestoneEl.textContent = `${MILESTONE_META[milestone].message} — ${percent}%`;
  } else {
    overlayMilestoneEl.textContent = `Progress: ${percent}%`;
  }

  tickerItems = buildTickerItems(state);
  renderTicker();

  overlayDeviceStatusEl.textContent = `Last updated: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function buildTickerItems(state) {
  const items = [];
  const recent = [...(state.contributions || [])]
    .filter((entry) => entry.type !== "initial")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 8);

  if (recent.length === 0) {
    items.push("We are believing for new contributions today!");
  } else {
    recent.forEach((entry) => {
      const label = entry.type ? entry.type.replace("_", " ") : "Contribution";
      const note = entry.notes ? ` — ${entry.notes}` : "";
      items.push(`${label}: ${formatCurrency(entry.amount || 0)}${note}`);
    });
  }

  const testimonies = state.testimonies && state.testimonies.length > 0
    ? state.testimonies
    : DEFAULT_STATE.testimonies;

  return items.concat(testimonies);
}

function renderTicker() {
  if (!overlayTickerEl) return;
  if (tickerItems.length === 0) return;

  overlayTickerEl.innerHTML = tickerItems
    .map((item) => `<span class="ticker-item">${item}</span>`)
    .join(" • ");

  overlayTickerEl.classList.remove("paused");
  clearInterval(tickerTimer);
  tickerTimer = setInterval(() => {
    currentTickerIndex = (currentTickerIndex + 1) % tickerItems.length;
    overlayTickerEl.style.animation = "none";
    void overlayTickerEl.offsetWidth; // reset animation
    overlayTickerEl.style.animation = "";
  }, 20000);
}

function initialize() {
  const state = loadState();
  render(state);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      render(loadState());
    }
  });

  setInterval(() => {
    render(loadState());
  }, 10000);
}

initialize();


