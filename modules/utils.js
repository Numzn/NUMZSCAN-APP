export function formatTimestamp(ts) {
  if (!ts) return "Never";
  try {
    return new Date(ts).toLocaleString();
  } catch (err) {
    return ts;
  }
}

export function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return defaultValue;
}

export function formatTimestampForStorage(value) {
  try {
    return new Date(value).toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

export function formatCurrency(amount) {
  const numeric = Number(amount) || 0;
  return `K${numeric.toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`;
}

export function yieldToMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}


