import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { initials } from "./initials";

interface TopbarProps {
  menuRef: RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
  onToggleMenu: () => void;
  displayName: string;
  // The event whose pages are open. Shown so the manager always knows which event they are working in.
  event: { id: string; name: string } | null;
}

// Identity, the current event, and the phone's menu button. Navigation lives in the sidebar, not here.
export function Topbar({ menuRef, menuOpen, onToggleMenu, displayName, event }: TopbarProps) {
  return (
    <header className="topbar">
      <button
        ref={menuRef}
        type="button"
        className="icon-button"
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-controls="app-sidebar"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span aria-hidden="true" />
      </button>
      <Link to="/" className="topbar-brand">EventPass</Link>
      {event && (
        <Link to={`/events/${event.id}`} className="topbar-context">{event.name}</Link>
      )}
      {displayName && (
        <div className="account">
          <span className="avatar" aria-hidden="true">{initials(displayName)}</span>
          <span className="account-name">{displayName}</span>
        </div>
      )}
    </header>
  );
}
