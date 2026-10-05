import { forwardRef } from "react";
import { Link } from "react-router-dom";
import type { NavSection } from "../../app/navigation";
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
            <ul className="nav-list">
              {section.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} onClick={onNavigate} aria-current={item.match(pathname) ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
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
