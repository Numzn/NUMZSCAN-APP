const SETTINGS_STORAGE_KEY = "qrAppSettings";

export function loadAppSettings(defaults = {}) {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (err) {
    console.warn("[Settings] Failed to load settings:", err);
    return { ...defaults };
  }
}

export function saveAppSettings(settings) {
  try {
    const existing = loadAppSettings();
    const merged = { ...existing, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn("[Settings] Failed to save settings:", err);
  }
}


