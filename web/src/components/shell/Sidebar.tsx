import { forwardRef } from "react";
import { Link } from "react-router-dom";
import type { NavItem, NavSection } from "../../app/navigation";
import { initials } from "./initials";

interface SidebarProps {
  sections: NavSection[];
  pathname: string;
  open: boolean;
  inert: boolean;
  displayName: string;
  onNavigate: () => void;
  onSignOut: () => void;
}

// The current page is "page". An event that holds the open pages is "true": current in its set, not the page itself.
function currentValue(item: NavItem, pathname: string): "page" | "true" | undefined {
  if (!item.match(pathname)) return undefined;
  return item.context ? "true" : "page";
}

// Permanent on desktop. On smaller screens it is a drawer, opened from the topbar.
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { sections, pathname, open, inert, displayName, onNavigate, onSignOut },
  ref
) {
  return (
    <aside id="app-sidebar" ref={ref} className={`sidebar${open ? " open" : ""}`} aria-label="Application" inert={inert}>
      <Link to="/" className="sidebar-brand" onClick={onNavigate}>EventPass</Link>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="nav-heading">{section.title}</p>
            {section.items.length > 0 ? (
              <ul className="nav-list">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} onClick={onNavigate} aria-current={currentValue(item, pathname)}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              section.note && <p className="nav-note">{section.note}</p>
            )}
          </div>
        ))}
      </nav>
      {displayName && (
        <div className="sidebar-account">
          <div className="sidebar-account-who">
            <span className="avatar" aria-hidden="true">{initials(displayName)}</span>
            <span className="account-name">{displayName}</span>
          </div>
          <button type="button" className="btn-secondary" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </aside>
  );
});
