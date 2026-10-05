import { NavLink } from "react-router-dom";

export interface Tab {
  to: string;
  label: string;
  end?: boolean;
}

// A labelled row of sections. The active tab is marked for screen readers and for sight.
export function NavTabs({ label, items }: { label: string; items: Tab[] }) {
  return (
    <nav aria-label={label} className="tabs">
      {items.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
