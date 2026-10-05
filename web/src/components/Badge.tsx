import type { ReactNode } from "react";
import type { Tone } from "../app/labels";

// A small coloured label for a status. The text carries the meaning; colour only reinforces it.
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
