import type { ReactNode } from "react";

// The three non-content states every data page shows, in the same way.
export function LoadingState({ children }: { children: ReactNode }) {
  return <p className="state" aria-live="polite">{children}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state-empty">{children}</div>;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return <p role="alert" className="error">{children}</p>;
}
