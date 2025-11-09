const STORAGE_KEY = "lhgFundraisingState";

const defaultState = {
  targetAmount: 50000,
  currentAmount: 25000,
  autoSyncEnabled: true,
  contributions: [],
  milestones: [],
  testimonies: [],
  milestoneVerses: {},
  recentTickets: [],
  ticketStats: {
    scanned: 0,
    generated: 0,
  },
  leadershipNotes: "",
  obsOverlayEnabled: false,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch (error) {
    console.warn("[Fundraising:State] Failed to load state", error);
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[Fundraising:State] Failed to save state", error);
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDefaultState() {
  return { ...defaultState };
}

