import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { navigationFor } from "../../app/navigation";
import { viewerOf } from "../../app/policy";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useMediaQuery } from "./useMediaQuery";

// The application frame: sidebar, topbar, and a fluid workspace. Below the desktop breakpoint the sidebar is a drawer.
export function AppShell() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const viewer = viewerOf(state);
  const displayName = viewer?.user.displayName ?? "";
  const isDesktop = useMediaQuery("(min-width: 1100px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerActive = drawerOpen && !isDesktop;

  // Navigating anywhere closes the drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While the drawer is open: focus moves into it, Escape closes it and returns focus to the menu button,
  // and the page behind does not scroll.
  useEffect(() => {
    if (!drawerActive) return;
    sidebarRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("drawer-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("drawer-open");
    };
  }, [drawerActive]);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Sidebar
        ref={sidebarRef}
        sections={navigationFor(viewer)}
        pathname={pathname}
        open={drawerActive}
        inert={!isDesktop && !drawerActive}
        displayName={displayName}
        onNavigate={() => setDrawerOpen(false)}
        onSignOut={handleSignOut}
      />
      {drawerActive && <div className="drawer-backdrop" aria-hidden="true" onClick={() => setDrawerOpen(false)} />}
      <Topbar menuRef={menuRef} menuOpen={drawerActive} onToggleMenu={() => setDrawerOpen((open) => !open)} displayName={displayName} />
      <main id="main" className="workspace" tabIndex={-1}>
        <div className="workspace-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
