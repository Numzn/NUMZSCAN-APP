export function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `K${amount.toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`;
}

export function yieldToMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}


